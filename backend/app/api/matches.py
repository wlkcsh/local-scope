"""
Matches and Replay API Endpoints per SPEC §4 and Phase 2.
Provides match listings, detailed scoreboard, highlights, mistakes, deletion, and raw replay streaming.
"""

from typing import List, Optional, Dict, Any
import gzip
import json
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status, Path as PathParam
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import desc, select

from app.config import settings
from app.db import get_db
from app.models import Match, PlayerMatchStat, Highlight, Mistake
from app.api.deps import verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/matches", tags=["matches"], dependencies=[Depends(verify_token)])

MATCH_ID_REGEX = r"^[a-zA-Z0-9_\-]+$"


class MatchDetailResponse(BaseModel):
    match: Dict[str, Any]
    player_stats: List[Dict[str, Any]]
    highlights: List[Dict[str, Any]]
    mistakes: List[Dict[str, Any]]
    rounds: List[Dict[str, Any]] = []


@router.get("", response_model=List[Dict[str, Any]])
def list_matches(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> List[Dict[str, Any]]:
    """List match summaries ordered by played_at DESC, created_at DESC per Phase 2."""
    stmt = (
        select(Match)
        .order_by(desc(Match.played_at), desc(Match.created_at))
        .offset(offset)
        .limit(limit)
    )
    matches = db.scalars(stmt).all()
    results = []
    for m in matches:
        results.append({
            "id": m.id,
            "source": m.source,
            "faceit_url": m.faceit_url,
            "demo_url": m.demo_url,
            "map": m.map,
            "played_at": m.played_at.isoformat() if m.played_at else None,
            "duration_s": m.duration_s,
            "tick_rate": m.tick_rate,
            "rounds_total": m.rounds_total,
            "team_a_name": m.team_a_name,
            "team_b_name": m.team_b_name,
            "score_a": m.score_a,
            "score_b": m.score_b,
            "team_a_first_side": m.team_a_first_side,
            "my_steamid": m.my_steamid,
            "my_team": m.my_team,
            "result": m.result,
            "replay_bytes": m.replay_bytes,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return results


@router.get("/{match_id}", response_model=MatchDetailResponse)
def get_match_detail(match_id: str, db: Session = Depends(get_db)) -> MatchDetailResponse:
    """Retrieve full match metadata, player statistics, highlights, and mistakes."""
    stmt = (
        select(Match)
        .options(
            selectinload(Match.player_stats),
            selectinload(Match.highlights),
            selectinload(Match.mistakes),
        )
        .where(Match.id == match_id)
    )
    m = db.scalars(stmt).first()
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )

    stats = [
        {
            "match_id": s.match_id,
            "steamid": s.steamid,
            "name": s.name,
            "team": s.team,
            "kills": s.kills,
            "deaths": s.deaths,
            "assists": s.assists,
            "adr": s.adr,
            "hs_pct": s.hs_pct,
            "kast_pct": s.kast_pct,
            "first_kills": s.first_kills,
            "first_deaths": s.first_deaths,
            "trade_kills": s.trade_kills,
            "traded_deaths": s.traded_deaths,
            "k3": s.k3,
            "k4": s.k4,
            "k5": s.k5,
            "clutches_played": s.clutches_played,
            "clutches_won": s.clutches_won,
            "utility_damage": s.utility_damage,
            "enemies_flashed": s.enemies_flashed,
            "flash_assists": s.flash_assists,
            "team_flashes": s.team_flashes,
            "shots_fired": s.shots_fired,
            "ttd_ms_median": s.ttd_ms_median,
            "ttd_samples": s.ttd_samples,
            "counter_strafe_pct": s.counter_strafe_pct,
            "counter_strafe_samples": s.counter_strafe_samples,
            "first_bullet_acc_pct": s.first_bullet_acc_pct,
            "first_bullet_acc_samples": s.first_bullet_acc_samples,
        }
        for s in m.player_stats
    ]

    hls = [
        {
            "id": h.id,
            "match_id": h.match_id,
            "steamid": h.steamid,
            "round": h.round,
            "type": h.type,
            "start_tick": h.start_tick,
            "end_tick": h.end_tick,
            "kill_ticks": h.kill_ticks,
            "weapon": h.weapon,
            "score": h.score,
            "meta": h.meta,
        }
        for h in m.highlights
    ]

    mis = [
        {
            "id": mi.id,
            "match_id": mi.match_id,
            "steamid": mi.steamid,
            "round": mi.round,
            "type": mi.type,
            "tick": mi.tick,
            "x": mi.x,
            "y": mi.y,
            "z": mi.z,
            "layer": mi.layer,
            "severity": mi.severity,
            "meta": mi.meta,
        }
        for mi in m.mistakes
    ]

    match_dict = {
        "id": m.id,
        "source": m.source,
        "faceit_url": m.faceit_url,
        "demo_url": m.demo_url,
        "map": m.map,
        "played_at": m.played_at.isoformat() if m.played_at else None,
        "duration_s": m.duration_s,
        "tick_rate": m.tick_rate,
        "rounds_total": m.rounds_total,
        "team_a_name": m.team_a_name,
        "team_b_name": m.team_b_name,
        "score_a": m.score_a,
        "score_b": m.score_b,
        "team_a_first_side": m.team_a_first_side,
        "my_steamid": m.my_steamid,
        "my_team": m.my_team,
        "result": m.result,
        "replay_path": m.replay_path,
        "replay_bytes": m.replay_bytes,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }

    # Extract lightweight round summary for chronological UI telemetry
    rounds_summary = []
    replay_path = (settings.resolved_replays_dir / f"{match_id}.json.gz").resolve()
    if not replay_path.exists():
        alt_path = (settings.resolved_data_dir.parent / m.replay_path).resolve()
        if alt_path.is_relative_to(settings.resolved_data_dir.parent.resolve()):
            replay_path = alt_path

    if replay_path.exists():
        try:
            with gzip.open(replay_path, "rt", encoding="utf-8") as f:
                rep_data = json.load(f)
            for r in rep_data.get("rounds", []):
                side_a = r.get("side_a", "CT")
                winner_side = r.get("winner", "CT")
                winner_team = "A" if winner_side == side_a else "B"
                rounds_summary.append({
                    "round_num": r.get("n", 1),
                    "winner_team": winner_team,
                    "winner_side": winner_side,
                    "reason": r.get("reason", "normal"),
                    "score_a": r.get("score", [0, 0])[0],
                    "score_b": r.get("score", [0, 0])[1],
                })
        except Exception as e:
            logger.warning(f"Failed to extract round summaries for {match_id}: {e}")

    return MatchDetailResponse(
        match=match_dict,
        player_stats=stats,
        highlights=hls,
        mistakes=mis,
        rounds=rounds_summary,
    )


@router.delete("/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_match(
    match_id: str = PathParam(..., pattern=MATCH_ID_REGEX),
    db: Session = Depends(get_db),
):
    """Deletes match from database (cascading to stats, highlights, mistakes) and unlinks replay file."""
    m = db.get(Match, match_id)
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )

    target_replay = (settings.resolved_replays_dir / f"{match_id}.json.gz").resolve()
    if not target_replay.is_relative_to(settings.resolved_replays_dir.resolve()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid match ID path")

    db.delete(m)
    db.commit()

    # Unlink replay file on disk after DB commit succeeds
    target_replay.unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{match_id}/highlights", response_model=List[Dict[str, Any]])
def get_match_highlights(
    match_id: str,
    steamid: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Retrieve highlights for a match, optionally filtered by player steamid."""
    stmt = select(Highlight).where(Highlight.match_id == match_id)
    if steamid:
        stmt = stmt.where(Highlight.steamid == steamid)
    stmt = stmt.order_by(desc(Highlight.score))
    hls = db.scalars(stmt).all()
    return [
        {
            "id": h.id,
            "match_id": h.match_id,
            "steamid": h.steamid,
            "round": h.round,
            "type": h.type,
            "start_tick": h.start_tick,
            "end_tick": h.end_tick,
            "kill_ticks": h.kill_ticks,
            "weapon": h.weapon,
            "score": h.score,
            "meta": h.meta,
        }
        for h in hls
    ]


@router.get("/{match_id}/mistakes", response_model=List[Dict[str, Any]])
def get_match_mistakes(
    match_id: str,
    steamid: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Retrieve mistake cards for a match, optionally filtered by player steamid."""
    stmt = select(Mistake).where(Mistake.match_id == match_id)
    if steamid:
        stmt = stmt.where(Mistake.steamid == steamid)
    stmt = stmt.order_by(desc(Mistake.severity), Mistake.round)
    mis = db.scalars(stmt).all()
    return [
        {
            "id": mi.id,
            "match_id": mi.match_id,
            "steamid": mi.steamid,
            "round": mi.round,
            "type": mi.type,
            "tick": mi.tick,
            "x": mi.x,
            "y": mi.y,
            "z": mi.z,
            "layer": mi.layer,
            "severity": mi.severity,
            "meta": mi.meta,
        }
        for mi in mis
    ]


@router.get("/{match_id}/replay")
def get_match_replay(
    match_id: str = PathParam(..., pattern=MATCH_ID_REGEX),
    db: Session = Depends(get_db),
):
    """
    Streams raw .json.gz bytes per SPEC §4 with headers:
    Content-Type: application/json
    Content-Encoding: gzip
    """
    m = db.get(Match, match_id)
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )

    replay_path = (settings.resolved_replays_dir / f"{match_id}.json.gz").resolve()
    if not replay_path.is_relative_to(settings.resolved_replays_dir.resolve()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid match ID path")

    if not replay_path.exists():
        # Fallback to relative path from root
        alt_path = (settings.resolved_data_dir.parent / m.replay_path).resolve()
        if alt_path.is_relative_to(settings.resolved_data_dir.parent.resolve()):
            replay_path = alt_path

    if not replay_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Replay file for {match_id} not found on disk",
        )

    with open(replay_path, "rb") as f:
        gz_bytes = f.read()

    return Response(
        content=gz_bytes,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "Content-Disposition": f'inline; filename="{match_id}.json"',
        },
    )
