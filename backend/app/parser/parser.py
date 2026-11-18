"""
Master CS2 Demo Parser per SPEC §3 and §6.
Coordinates round extraction, frames, grenades, highlights, mistakes, mechanics,
stats calculation, and ReplayFile generation under the 1.5MB budget.
"""

import sys
import os
import gzip
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import orjson
import pandas as pd
from demoparser2 import DemoParser

from app.schemas import (
    ParsedMatch,
    MatchRow,
    PlayerMatchStatsRow,
    HighlightRow,
    MistakeRow,
    MatchMeta,
    ReplayFile,
    ReplayRound,
    ReplayPlayer,
    RoundBomb,
    QuantizationConfig,
)
from app.parser.constants import (
    normalize_weapon_name,
    TICK_RATE,
    FRAME_STEP,
    QUANT_POS,
    QUANT_YAW,
)
from app.parser.maps import normalize_map_name
from app.parser.rounds import extract_rounds_and_teams, RoundDescriptor, TeamRoster
from app.parser.frames import FrameEncoder, delta_encode
from app.parser.grenades import process_round_grenades
from app.parser.highlights import detect_highlights
from app.parser.mistakes import detect_mistakes
from app.parser.mechanics import compute_counter_strafing, compute_ttd, compute_first_bullet_accuracy
from app.parser.stats import compute_player_stats

logger = logging.getLogger("parser")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def serialize_replay_gzip(replay: ReplayFile, level: int = 9) -> bytes:
    """Serializes ReplayFile with orjson and compresses with gzip level 9."""
    raw_json = orjson.dumps(replay.model_dump(exclude_none=True))
    return gzip.compress(raw_json, compresslevel=level)


def parse_demo(
    demo_path: str,
    meta: Optional[MatchMeta] = None,
    q_pos: int = QUANT_POS,
    q_yaw: int = QUANT_YAW,
    frame_step: int = FRAME_STEP,
) -> ParsedMatch:
    """
    Parses a CS2 demo file into a ParsedMatch object containing
    database rows and the ReplayFile.
    """
    p_path = Path(demo_path)
    if not p_path.exists():
        raise FileNotFoundError(f"Demo file not found at {demo_path}")

    demo_parser = DemoParser(str(p_path))

    # 1. Header Information
    header = demo_parser.parse_header()
    raw_map = header.get("map_name", "unknown")
    map_name = normalize_map_name(raw_map)
    tick_rate = int(header.get("tick_rate", TICK_RATE) or TICK_RATE)

    # 2. Extract Events in Bulk per SPEC §3.1
    event_names = [
        "round_announce_match_start",
        "round_freeze_end",
        "round_end",
        "player_death",
        "player_hurt",
        "weapon_fire",
        "player_blind",
        "bomb_planted",
        "bomb_defused",
        "bomb_exploded",
        "smokegrenade_detonate",
        "smokegrenade_expired",
        "inferno_startburn",
        "inferno_expire",
        "flashbang_detonate",
        "hegrenade_detonate",
        "decoy_started",
    ]
    raw_events = demo_parser.parse_events(
        event_names,
        player=["X", "Y", "Z", "team_num", "velocity_X", "velocity_Y", "is_scoped"],
        other=["total_rounds_played", "is_warmup_period"],
    )
    events: Dict[str, pd.DataFrame] = {name: df for name, df in raw_events}

    # 3. Rounds and Teams Extraction (§3.2)
    rounds, roster, replay_players_list = extract_rounds_and_teams(
        events, demo_parser.parse_ticks
    )
    
    # Mapping steamid -> team ('A' or 'B') and steamid -> pidx (0..9)
    player_sid_to_team: Dict[str, str] = {}
    player_sid_to_pidx: Dict[str, int] = {}
    for idx, p in enumerate(replay_players_list):
        sid = p["sid"]
        player_sid_to_team[sid] = p["team"]
        player_sid_to_pidx[sid] = idx

    # 4. Grenades
    grenades_df = pd.DataFrame()
    try:
        grenades_df = demo_parser.parse_grenades()
    except Exception as e:
        logger.warning("parse_grenades error: %s", e)

    # 5. Highlights Detection (§3.3)
    deaths = events.get("player_death", pd.DataFrame())
    hurts = events.get("player_hurt", pd.DataFrame())
    blinds = events.get("player_blind", pd.DataFrame())
    fires = events.get("weapon_fire", pd.DataFrame())

    match_id = (meta and meta.match_id) or f"up-{p_path.stem[:16]}"
    highlights = detect_highlights(match_id, rounds, deaths, player_sid_to_team)

    # 6. Mistakes Detection (§3.4)
    mistakes = detect_mistakes(
        match_id, map_name, rounds, deaths, blinds, demo_parser.parse_ticks, player_sid_to_team
    )

    # 7. Mechanics: Counter-strafing, TTD, and First-Bullet Accuracy (§3.5 & Scope.gg Parity)
    cs_results = compute_counter_strafing(fires)
    ttd_results = compute_ttd(hurts, demo_parser.parse_ticks, player_sid_to_team)
    fba_results = compute_first_bullet_accuracy(fires, hurts, player_sid_to_team)

    # 8. Stats Computation (§3.6)
    player_stats = compute_player_stats(
        match_id,
        rounds,
        roster,
        deaths,
        hurts,
        blinds,
        fires,
        highlights,
        cs_results,
        ttd_results,
        first_bullet_acc_results=fba_results,
    )

    # 9. Replay Frames Construction (§3.8 & §2.2)
    # Collect all frame ticks for all rounds
    all_frame_ticks = set()
    for r in rounds:
        for t in range(r.t0, r.t0 + r.nf * frame_step, frame_step):
            all_frame_ticks.add(t)

    sorted_frame_ticks = sorted(list(all_frame_ticks))
    frame_ticks_df = pd.DataFrame()
    if sorted_frame_ticks:
        frame_props = [
            "X", "Y", "Z", "yaw", "health", "is_alive", "team_num",
            "active_weapon_name", "flash_duration", "player_steamid",
        ]
        try:
            frame_ticks_df = demo_parser.parse_ticks(frame_props, ticks=sorted_frame_ticks)
        except Exception as e:
            logger.error("parse_ticks failed for replay frames: %s", e)

    # Index frame ticks by (tick, steamid)
    ticks_cache: Dict[Tuple[int, str], Dict[str, Any]] = {}
    if not frame_ticks_df.empty and "player_steamid" in frame_ticks_df.columns:
        for r in frame_ticks_df.itertuples():
            tk = int(r.tick)
            sid = str(r.player_steamid)
            ticks_cache[(tk, sid)] = {
                "X": getattr(r, "X", 0.0),
                "Y": getattr(r, "Y", 0.0),
                "Z": getattr(r, "Z", 0.0),
                "yaw": getattr(r, "yaw", 0.0),
                "health": getattr(r, "health", 100),
                "is_alive": getattr(r, "is_alive", True),
                "active_weapon_name": getattr(r, "active_weapon_name", "knife"),
                "flash_duration": getattr(r, "flash_duration", 0.0),
            }

    weapons_dict: List[str] = ["knife", "ak47", "m4a1_silencer", "usp_silencer", "glock", "deagle", "awp"]
    encoder = FrameEncoder(map_name, weapons_dict, q_pos=q_pos, q_yaw=q_yaw)

    replay_rounds: List[ReplayRound] = []

    # Bomb events
    bomb_plants = events.get("bomb_planted", pd.DataFrame())
    bomb_defuses = events.get("bomb_defused", pd.DataFrame())
    bomb_explodes = events.get("bomb_exploded", pd.DataFrame())

    for r in rounds:
        t0 = r.t0
        nf = r.nf

        # Encode tracks for each player (pidx 0..9)
        player_tracks = []
        for p_info in replay_players_list:
            sid = p_info["sid"]
            raw_player_frames = []
            for f_idx in range(nf):
                f_tick = t0 + f_idx * frame_step
                frame_data = ticks_cache.get((f_tick, sid), {"is_alive": False})
                raw_player_frames.append(frame_data)

            track = encoder.encode_player_track(raw_player_frames)
            player_tracks.append(track)

        # Process Bomb events for this round
        round_bomb = None
        r_plants = bomb_plants[(bomb_plants["tick"] >= r.start_tick) & (bomb_plants["tick"] <= r.end_tick)] if not bomb_plants.empty else pd.DataFrame()
        r_defuses = bomb_defuses[(bomb_defuses["tick"] >= r.start_tick) & (bomb_defuses["tick"] <= r.end_tick)] if not bomb_defuses.empty else pd.DataFrame()
        r_explodes = bomb_explodes[(bomb_explodes["tick"] >= r.start_tick) & (bomb_explodes["tick"] <= r.end_tick)] if not bomb_explodes.empty else pd.DataFrame()

        b_plant_tuple = None
        b_defuse_tuple = None
        b_explode_frame = None

        if not r_plants.empty:
            p_row = r_plants.iloc[0]
            p_frame = max(0, (int(p_row["tick"]) - t0) // frame_step)
            px = int(round(float(p_row.get("user_X", 0.0) or 0.0) / q_pos))
            py = int(round(float(p_row.get("user_Y", 0.0) or 0.0) / q_pos))
            planter_sid = str(p_row.get("user_steamid", ""))
            planter_pidx = player_sid_to_pidx.get(planter_sid, 0)
            b_plant_tuple = (p_frame, px, py, planter_pidx)

        if not r_defuses.empty:
            d_row = r_defuses.iloc[0]
            d_frame = max(0, (int(d_row["tick"]) - t0) // frame_step)
            defuser_sid = str(d_row.get("user_steamid", ""))
            defuser_pidx = player_sid_to_pidx.get(defuser_sid, 0)
            b_defuse_tuple = (d_frame, defuser_pidx)

        if not r_explodes.empty:
            e_row = r_explodes.iloc[0]
            b_explode_frame = max(0, (int(e_row["tick"]) - t0) // frame_step)

        if b_plant_tuple or b_defuse_tuple or b_explode_frame:
            round_bomb = RoundBomb(
                plant=b_plant_tuple,
                defuse=b_defuse_tuple,
                explode=b_explode_frame,
            )

        # Process round nades
        round_nades = process_round_grenades(
            t0, nf, player_sid_to_pidx, grenades_df, events, q_pos=q_pos
        )

        # Process round kills
        # [frame, killer pidx | -1, victim pidx, assister pidx | -1, widx, flags]
        round_kills: List[Tuple[int, int, int, int, int, int]] = []
        if not deaths.empty:
            r_deaths = deaths[(deaths["tick"] >= r.start_tick) & (deaths["tick"] <= r.end_tick)].sort_values(by="tick")
            for _, d_row in r_deaths.iterrows():
                d_frame = max(0, (int(d_row["tick"]) - t0) // frame_step)
                atk_sid = str(d_row.get("attacker_steamid", ""))
                vic_sid = str(d_row.get("user_steamid", ""))
                ass_sid = str(d_row.get("assister_steamid", ""))

                k_pidx = player_sid_to_pidx.get(atk_sid, -1)
                v_pidx = player_sid_to_pidx.get(vic_sid, 0)
                a_pidx = player_sid_to_pidx.get(ass_sid, -1)

                w_name = normalize_weapon_name(str(d_row.get("weapon", "ak47")))
                widx = encoder.get_weapon_idx(w_name)

                # Flags: 1 headshot, 2 wallbang, 4 through-smoke, 8 noscope, 16 attacker-blind, 32 flash-assist
                flags = 0
                if bool(d_row.get("headshot", False)):
                    flags |= 1
                if int(d_row.get("penetrated", 0) or 0) > 0:
                    flags |= 2
                if bool(d_row.get("thrusmoke", False)):
                    flags |= 4
                if bool(d_row.get("noscope", False)):
                    flags |= 8
                if bool(d_row.get("attackerblind", False)):
                    flags |= 16
                if bool(d_row.get("assistedflash", False)):
                    flags |= 32

                round_kills.append((d_frame, k_pidx, v_pidx, a_pidx, widx, flags))

        # Process round shots: [Delta_encoded_frames, pidx_list]
        shot_frames = []
        shot_pidxs = []
        if not fires.empty:
            r_fires = fires[(fires["tick"] >= r.start_tick) & (fires["tick"] <= r.end_tick)].sort_values(by="tick")
            for _, f_row in r_fires.iterrows():
                f_sid = str(f_row.get("user_steamid", ""))
                f_pidx = player_sid_to_pidx.get(f_sid)
                if f_pidx is not None:
                    fr_idx = max(0, (int(f_row["tick"]) - t0) // frame_step)
                    shot_frames.append(fr_idx)
                    shot_pidxs.append(f_pidx)

        delta_shots = delta_encode(shot_frames)
        shots_tuple = (delta_shots, shot_pidxs)

        replay_rounds.append(ReplayRound(
            n=r.round_num,
            t0=t0,
            nf=nf,
            fe=r.fe,
            side_a=r.side_a,
            winner=r.winner,
            reason=r.reason,
            score=r.score_before,
            p=player_tracks,
            bomb=round_bomb,
            nades=round_nades,
            kills=round_kills,
            shots=shots_tuple,
        ))

    # Assemble ReplayFile
    replay_obj = ReplayFile(
        v=1,
        match_id=match_id,
        map=map_name,
        tick_rate=tick_rate,
        frame_step=frame_step,
        q=QuantizationConfig(pos=q_pos, yaw=q_yaw),
        weapons=weapons_dict,
        players=[ReplayPlayer(sid=p["sid"], name=p["name"], team=p["team"]) for p in replay_players_list],
        rounds=replay_rounds,
    )

    # Calculate match duration and scores
    total_ticks = (rounds[-1].end_tick - rounds[0].t0) if rounds else 0
    duration_s = max(1, total_ticks // tick_rate)
    final_score_a = rounds[-1].score_before[0] + (1 if rounds[-1].winner == rounds[-1].side_a else 0)
    final_score_b = rounds[-1].score_before[1] + (1 if rounds[-1].winner != rounds[-1].side_a else 0)

    # My team and result
    my_sid = meta.my_steamid if meta else None
    my_team = player_sid_to_team.get(my_sid) if my_sid else None
    result = None
    if my_team == "A":
        result = "W" if final_score_a > final_score_b else ("L" if final_score_a < final_score_b else "D")
    elif my_team == "B":
        result = "W" if final_score_b > final_score_a else ("L" if final_score_b < final_score_a else "D")

    match_row = MatchRow(
        id=match_id,
        source=meta.source if meta else "upload",
        faceit_url=meta.faceit_url if meta else None,
        demo_url=meta.demo_url if meta else None,
        map=map_name,
        played_at=header.get("demo_version_name", "2026-11-13T14:00:00Z"),
        duration_s=duration_s,
        tick_rate=tick_rate,
        rounds_total=len(rounds),
        team_a_name=(meta and meta.team_a_name) or "Team A",
        team_b_name=(meta and meta.team_b_name) or "Team B",
        score_a=final_score_a,
        score_b=final_score_b,
        team_a_first_side="CT",
        my_steamid=my_sid,
        my_team=my_team,
        result=result,
        replay_path=f"data/replays/{match_id}.json.gz",
        replay_bytes=0,  # updated after compression
        parser_version="v1",
    )

    parsed_match = ParsedMatch(
        match=match_row,
        player_stats=player_stats,
        highlights=highlights,
        mistakes=mistakes,
        replay=replay_obj,
    )

    # Replay size budget check (§2.2): <= 1,500,000 bytes
    gz_bytes = serialize_replay_gzip(replay_obj)
    if len(gz_bytes) > 1_500_000 and q_pos == 2:
        logger.warning("Replay size %d exceeds 1.5MB; retrying with q={pos:4, yaw:6}", len(gz_bytes))
        return parse_demo(demo_path, meta=meta, q_pos=4, q_yaw=6, frame_step=frame_step)
    elif len(gz_bytes) > 1_500_000 and frame_step == 8:
        logger.warning("Replay size %d still exceeds 1.5MB; retrying with frame_step=16", len(gz_bytes))
        return parse_demo(demo_path, meta=meta, q_pos=4, q_yaw=6, frame_step=16)

    parsed_match.match.replay_bytes = len(gz_bytes)
    parsed_match.replay_gz_bytes = gz_bytes
    return parsed_match


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m app.parser.parser <path_to_demo> [output_dir]")
        sys.exit(1)

    in_demo = sys.argv[1]
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/replays")
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Parsing demo: {in_demo}")
    parsed = parse_demo(in_demo)
    
    # Save replay file
    gz_data = serialize_replay_gzip(parsed.replay)
    out_file = out_dir / f"{parsed.match.id}.json.gz"
    with open(out_file, "wb") as f:
        f.write(gz_data)

    print(f"\n=== Parse Complete ===")
    print(f"Match ID: {parsed.match.id}")
    print(f"Map: {parsed.match.map}")
    print(f"Score: {parsed.match.team_a_name} {parsed.match.score_a} - {parsed.match.score_b} {parsed.match.team_b_name}")
    print(f"Rounds: {parsed.match.rounds_total}")
    print(f"Players: {len(parsed.player_stats)}")
    print(f"Highlights: {len(parsed.highlights)}")
    print(f"Mistakes: {len(parsed.mistakes)}")
    print(f"Replay File: {out_file} ({len(gz_data):,} bytes)")
    if len(gz_data) <= 1_500_000:
        print("Replay size budget check: PASSED (under 1,500,000 bytes)")
    else:
        print("Replay size budget check: FAILED (exceeds 1,500,000 bytes)")
