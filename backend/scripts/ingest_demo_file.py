"""
Ingest a local CS2 demo file into Local-Scope database and replays directory.
Usage:
    .venv/bin/python backend/scripts/ingest_demo_file.py demos/dust2-11-13-clutch
"""

import sys
import hashlib
from pathlib import Path
from datetime import datetime, timezone

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.db import SessionLocal
from app.models import Match, PlayerMatchStat, Highlight, Mistake
from app.schemas import MatchMeta, ParsedMatch
from app.parser.parser import parse_demo, serialize_replay_gzip


def ingest_file(dem_path_str: str, custom_match_id: str = None):
    dem_path = Path(dem_path_str).resolve()
    if not dem_path.exists():
        print(f"Error: Demo file not found at {dem_path}")
        sys.exit(1)

    print(f"Reading and calculating SHA1 for {dem_path.name}...")
    sha1 = hashlib.sha1()
    with open(dem_path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            sha1.update(chunk)
    file_hash = sha1.hexdigest()
    match_id = custom_match_id or f"up-{file_hash[:16]}"
    print(f"Assigned Match ID: {match_id}")

    # Check if already in DB
    with SessionLocal() as db:
        existing = db.get(Match, match_id)
        if existing:
            print(f"Match {match_id} already exists in database ({existing.map}, rounds: {existing.rounds_total}).")
            return match_id

    meta = MatchMeta(
        match_id=match_id,
        source="upload",
        demo_url=dem_path.name,
        team_a_name="Team A",
        team_b_name="Team B",
        my_steamid=settings.my_steamid,
    )

    print(f"Parsing demo {dem_path.name} with demoparser2...")
    parsed: ParsedMatch = parse_demo(str(dem_path), meta=meta)
    print(f"Parsed {parsed.match.map} successfully! Rounds total: {parsed.match.rounds_total}")

    gz_bytes = parsed.replay_gz_bytes or serialize_replay_gzip(parsed.replay)
    settings.resolved_replays_dir.mkdir(parents=True, exist_ok=True)
    replay_file = settings.resolved_replays_dir / f"{match_id}.json.gz"
    replay_file.write_bytes(gz_bytes)
    print(f"Saved compressed replay ({len(gz_bytes)} bytes) to {replay_file}")

    rel_replay_path = f"data/replays/{match_id}.json.gz"

    played_at_dt = None
    if parsed.match.played_at:
        try:
            played_at_dt = datetime.fromisoformat(parsed.match.played_at.replace("Z", "+00:00"))
        except Exception:
            pass

    match_dict = parsed.match.model_dump()
    stats_dicts = [s.model_dump() for s in parsed.player_stats]
    hl_dicts = [h.model_dump() for h in parsed.highlights]
    mis_dicts = [m.model_dump() for m in parsed.mistakes]

    with SessionLocal() as db:
        match_obj = Match(
            id=match_id,
            owner_user_id=None,
            is_public=True,
            source="upload",
            demo_url=dem_path.name,
            map=match_dict["map"],
            played_at=played_at_dt,
            duration_s=match_dict["duration_s"],
            tick_rate=match_dict.get("tick_rate", 64),
            rounds_total=match_dict["rounds_total"],
            team_a_name=match_dict["team_a_name"],
            team_b_name=match_dict["team_b_name"],
            score_a=match_dict["score_a"],
            score_b=match_dict["score_b"],
            team_a_first_side=match_dict["team_a_first_side"],
            my_steamid=match_dict.get("my_steamid"),
            my_team=match_dict.get("my_team"),
            result=match_dict.get("result"),
            replay_path=rel_replay_path,
            replay_bytes=len(gz_bytes),
            parser_version=match_dict.get("parser_version", "v1"),
            created_at=datetime.now(timezone.utc),
        )
        db.add(match_obj)

        for ps in stats_dicts:
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

        for hl in hl_dicts:
            hl_obj = Highlight(
                match_id=match_id,
                steamid=hl["steamid"],
                round=hl["round"],
                type=hl["type"],
                start_tick=hl["start_tick"],
                end_tick=hl["end_tick"],
                kill_ticks=hl.get("kill_ticks", []),
                weapon=hl.get("weapon"),
                score=hl.get("score", 0),
                meta=hl.get("meta", {}),
            )
            db.add(hl_obj)

        for mis in mis_dicts:
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
                meta=mis.get("meta", {}),
            )
            db.add(mis_obj)

        db.commit()
        print(f"Persisted match {match_id} to database! Player stats: {len(stats_dicts)}, Highlights: {len(hl_dicts)}, Mistakes: {len(mis_dicts)}")

    return match_id


if __name__ == "__main__":
    demo_arg = sys.argv[1] if len(sys.argv) > 1 else "demos/dust2-11-13-clutch"
    ingest_file(demo_arg)
