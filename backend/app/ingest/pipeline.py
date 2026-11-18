"""
Background Ingest Pipeline & Worker Isolation per SPEC §4 and Phase 2.
Guarantees single worker process pool execution, atomic replay writes,
single-transaction DB persistence, and zero leftover .dem files on disk.
"""

import os
import asyncio
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
import httpx

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import Match, PlayerMatchStat, Highlight, Mistake, IngestJob
from app.schemas import MatchMeta, ParsedMatch
from app.parser.parser import parse_demo, serialize_replay_gzip
from app.ingest.faceit import resolve_source, IngestTarget
from app.ingest.download import stream_and_decompress

logger = logging.getLogger("ingest.pipeline")

# Module-level concurrency controls per Phase 2 specifications
INGEST_SEMAPHORE = asyncio.Semaphore(1)
PROCESS_POOL = ProcessPoolExecutor(max_workers=1)


def _run_parse_worker(dem_path: str, meta_dict: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Top-level picklable worker function executed inside PROCESS_POOL.
    Invokes parse_demo and serializes replay bytes for atomic writing.
    Prunes replay object from IPC payload to eliminate multi-megabyte serialization overhead.
    """
    meta = MatchMeta(**meta_dict) if meta_dict else None
    parsed: ParsedMatch = parse_demo(dem_path, meta=meta)
    gz_bytes = parsed.replay_gz_bytes or serialize_replay_gzip(parsed.replay)
    return {
        "parsed": {
            "match": parsed.match.model_dump(),
            "player_stats": [s.model_dump() for s in parsed.player_stats],
            "highlights": [h.model_dump() for h in parsed.highlights],
            "mistakes": [m.model_dump() for m in parsed.mistakes],
        },
        "replay_bytes": gz_bytes,
    }


def startup_recovery() -> None:
    """
    Performs startup recovery per Phase 2:
    - Creates data_dir, replays_dir, tmp_dir
    - Deletes all *.dem files in tmp_dir
    - Updates any IngestJob in ('queued', 'downloading', 'parsing') to 'error'
    """
    settings.resolved_data_dir.mkdir(parents=True, exist_ok=True)
    settings.resolved_replays_dir.mkdir(parents=True, exist_ok=True)
    tmp = settings.resolved_tmp_dir
    tmp.mkdir(parents=True, exist_ok=True)

    # Clean leftover .dem files
    for dem_file in tmp.glob("*.dem"):
        try:
            dem_file.unlink(missing_ok=True)
            logger.info("Startup recovery: Deleted stale .dem file %s", dem_file.name)
        except Exception as e:
            logger.warning("Failed to delete stale demo %s: %s", dem_file, e)

    # Reset interrupted jobs
    with SessionLocal() as db:
        stale_jobs = db.scalars(
            select(IngestJob).where(
                IngestJob.status.in_(["queued", "downloading", "parsing"])
            )
        ).all()
        for j in stale_jobs:
            j.status = "error"
            j.error = "Interrupted by server restart"
        if stale_jobs:
            db.commit()
            logger.info("Startup recovery: Reset %d interrupted jobs to error", len(stale_jobs))


async def execute_ingest_job(
    job_id: str,
    source_str: Optional[str] = None,
    upload_dem_path: Optional[Path] = None,
    original_filename: Optional[str] = None,
    upload_match_id: Optional[str] = None,
) -> None:
    """
    Core background task per Phase 2 specification.
    Acquires INGEST_SEMAPHORE, downloads, parses in PROCESS_POOL, persists in single transaction,
    and unconditionally deletes temporary .dem files in finally block.
    """
    dem_path: Optional[Path] = None
    loop = asyncio.get_running_loop()

    async with INGEST_SEMAPHORE:
        try:
            meta_dict: Optional[Dict[str, Any]] = None

            if upload_dem_path is not None:
                # Direct upload scenario
                dem_path = upload_dem_path
                m_id = upload_match_id or f"up-{job_id[:16]}"

                # Deduplication check: Check if match already exists in database
                with SessionLocal() as db:
                    existing = db.get(Match, m_id)
                    if existing:
                        logger.info("Match %s already exists in database; returning existing match", m_id)
                        job = db.get(IngestJob, job_id)
                        if job:
                            job.match_id = existing.id
                            job.status = "done"
                            db.commit()
                        return

                meta_dict = {
                    "match_id": m_id,
                    "source": "upload",
                    "demo_url": original_filename,
                    "team_a_name": "Team A",
                    "team_b_name": "Team B",
                    "my_steamid": settings.my_steamid,
                }
            elif source_str is not None:
                # URL / FACEIT resolution scenario
                with SessionLocal() as db:
                    job = db.get(IngestJob, job_id)
                    if job:
                        job.status = "downloading"
                        db.commit()

                async with httpx.AsyncClient(timeout=30.0) as client:
                    target: IngestTarget = await resolve_source(source_str, client)

                    # Deduplication check 1: Check if match already exists in database
                    with SessionLocal() as db:
                        existing = db.get(Match, target.match_id)
                        if existing:
                            logger.info("Match %s already exists in database; returning existing match", target.match_id)
                            job = db.get(IngestJob, job_id)
                            if job:
                                job.match_id = existing.id
                                job.status = "done"
                                db.commit()
                            return

                    # Download to temporary dem file
                    dem_path = settings.resolved_tmp_dir / f"{job_id}.dem"
                    if not target.signed_url:
                        raise ValueError(f"No valid download URL available for {target.match_id}")

                    await stream_and_decompress(
                        target.signed_url,
                        dem_path,
                        client,
                        max_bytes=settings.max_dem_bytes,
                    )

                meta_dict = {
                    "match_id": target.match_id,
                    "source": target.source,
                    "faceit_url": target.faceit_url,
                    "demo_url": target.demo_url,
                    "team_a_name": target.team_a_name or "Team A",
                    "team_b_name": target.team_b_name or "Team B",
                    "my_steamid": settings.my_steamid,
                }
            else:
                raise ValueError("Neither source_str nor upload_dem_path provided to execute_ingest_job")

            # Update status to parsing
            with SessionLocal() as db:
                job = db.get(IngestJob, job_id)
                if job:
                    job.status = "parsing"
                    if meta_dict and meta_dict.get("match_id"):
                        job.match_id = meta_dict["match_id"]
                    db.commit()

            # Execute parsing in single-worker ProcessPoolExecutor
            worker_result = await loop.run_in_executor(
                PROCESS_POOL,
                _run_parse_worker,
                str(dem_path),
                meta_dict,
            )

            parsed_data = worker_result["parsed"]
            gz_bytes = worker_result["replay_bytes"]
            match_row_data = parsed_data["match"]
            match_id = match_row_data["id"]

            # Deduplication check 2 (e.g. for re-uploaded files that produce identical match_id)
            with SessionLocal() as db:
                existing = db.get(Match, match_id)
                if existing:
                    logger.info("Match %s already exists in DB; marking job done", match_id)
                    job = db.get(IngestJob, job_id)
                    if job:
                        job.match_id = match_id
                        job.status = "done"
                        db.commit()
                    return

                # Atomic write of replay file
                replays_dir = settings.resolved_replays_dir
                replays_dir.mkdir(parents=True, exist_ok=True)
                final_replay_path = replays_dir / f"{match_id}.json.gz"
                tmp_replay_path = replays_dir / f".{match_id}.tmp"

                with open(tmp_replay_path, "wb") as f_out:
                    f_out.write(gz_bytes)
                os.replace(tmp_replay_path, final_replay_path)

                # Relative replay path for portable storage
                rel_replay_path = f"data/replays/{match_id}.json.gz"

                # Parse played_at datetime
                played_at_dt = None
                if match_row_data.get("played_at"):
                    try:
                        played_at_dt = datetime.fromisoformat(match_row_data["played_at"].replace("Z", "+00:00"))
                    except Exception:
                        pass

                # Single-transaction persistence
                match_obj = Match(
                    id=match_id,
                    source=match_row_data["source"],
                    faceit_url=match_row_data.get("faceit_url"),
                    demo_url=match_row_data.get("demo_url"),
                    map=match_row_data["map"],
                    played_at=played_at_dt,
                    duration_s=match_row_data["duration_s"],
                    tick_rate=match_row_data.get("tick_rate", 64),
                    rounds_total=match_row_data["rounds_total"],
                    team_a_name=match_row_data["team_a_name"],
                    team_b_name=match_row_data["team_b_name"],
                    score_a=match_row_data["score_a"],
                    score_b=match_row_data["score_b"],
                    team_a_first_side=match_row_data["team_a_first_side"],
                    my_steamid=match_row_data.get("my_steamid"),
                    my_team=match_row_data.get("my_team"),
                    result=match_row_data.get("result"),
                    replay_path=rel_replay_path,
                    replay_bytes=len(gz_bytes),
                    parser_version=match_row_data.get("parser_version", "v1"),
                )
                db.add(match_obj)

                for ps in parsed_data.get("player_stats", []):
                    p_obj = PlayerMatchStat(
                        match_id=match_id,
                        steamid=ps["steamid"],
                        name=ps["name"],
                        team=ps["team"],
                        kills=ps["kills"],
                        deaths=ps["deaths"],
                        assists=ps["assists"],
                        adr=ps["adr"],
                        hs_pct=ps["hs_pct"],
                        kast_pct=ps["kast_pct"],
                        first_kills=ps["first_kills"],
                        first_deaths=ps["first_deaths"],
                        trade_kills=ps["trade_kills"],
                        traded_deaths=ps["traded_deaths"],
                        k3=ps["k3"],
                        k4=ps["k4"],
                        k5=ps["k5"],
                        clutches_played=ps["clutches_played"],
                        clutches_won=ps["clutches_won"],
                        utility_damage=ps["utility_damage"],
                        enemies_flashed=ps["enemies_flashed"],
                        flash_assists=ps["flash_assists"],
                        team_flashes=ps["team_flashes"],
                        shots_fired=ps["shots_fired"],
                        ttd_ms_median=ps.get("ttd_ms_median"),
                        ttd_samples=ps.get("ttd_samples", 0),
                        counter_strafe_pct=ps.get("counter_strafe_pct"),
                        counter_strafe_samples=ps.get("counter_strafe_samples", 0),
                    )
                    db.add(p_obj)

                for hl in parsed_data.get("highlights", []):
                    hl_obj = Highlight(
                        match_id=match_id,
                        steamid=hl["steamid"],
                        round=hl["round"],
                        type=hl["type"],
                        start_tick=hl["start_tick"],
                        end_tick=hl["end_tick"],
                        kill_ticks=hl["kill_ticks"],
                        weapon=hl.get("weapon"),
                        score=hl["score"],
                        meta=hl["meta"],
                    )
                    db.add(hl_obj)

                for mis in parsed_data.get("mistakes", []):
                    mis_obj = Mistake(
                        match_id=match_id,
                        steamid=mis["steamid"],
                        round=mis["round"],
                        type=mis["type"],
                        tick=mis["tick"],
                        x=mis["x"],
                        y=mis["y"],
                        z=mis["z"],
                        layer=mis.get("layer", 0),
                        severity=mis["severity"],
                        meta=mis["meta"],
                    )
                    db.add(mis_obj)

                job = db.get(IngestJob, job_id)
                if job:
                    job.match_id = match_id
                    job.status = "done"

                db.commit()
                logger.info("Successfully persisted match %s in one transaction", match_id)

        except Exception as exc:
            logger.error("Job %s execution failed: %s", job_id, exc)
            with SessionLocal() as db:
                db.rollback()
                job = db.get(IngestJob, job_id)
                if job:
                    job.status = "error"
                    job.error = str(exc)[:500]
                    db.commit()
            raise
        finally:
            # Unconditional deletion of raw demo file per Zero-Leftover policy
            if dem_path is not None:
                try:
                    dem_path.unlink(missing_ok=True)
                    logger.info("Guaranteed cleanup: Unlinked temporary demo %s", dem_path)
                except Exception as e:
                    logger.warning("Failed to unlink demo %s: %s", dem_path, e)
