"""
Round and Team Management per SPEC §3.2.
Identifies live match rounds, handles MR12 half-time swaps by sampling sides,
and locks team A/B rosters by steamid.
"""

from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import pandas as pd


@dataclass
class RoundDescriptor:
    round_num: int            # 1-based
    start_tick: int           # tick of freeze_end
    end_tick: int             # tick of round_end
    t0: int                   # freeze_end - 128
    nf: int                   # number of frames: covers t0 to round_end + 192
    fe: int                   # frame index of freeze_end (16)
    side_a: str               # "CT" or "T"
    winner: str               # "CT" or "T"
    reason: str               # round_end reason string
    score_before: Tuple[int, int]  # (score_a, score_b)


@dataclass
class TeamRoster:
    team_a_pids: Dict[str, str]  # steamid -> player_name
    team_b_pids: Dict[str, str]  # steamid -> player_name
    team_a_first_side: str       # "CT" or "T"


def extract_rounds_and_teams(
    events: Dict[str, pd.DataFrame],
    parser_ticks_fn,
) -> Tuple[List[RoundDescriptor], TeamRoster, List[Dict[str, str]]]:
    """
    Extracts valid regulation rounds and locks Team A and Team B by steamid.
    """
    round_announces = events.get("round_announce_match_start", pd.DataFrame())
    freeze_ends = events.get("round_freeze_end", pd.DataFrame())
    round_ends = events.get("round_end", pd.DataFrame())

    # 1. Live start tick is the last round_announce_match_start
    live_start = 0
    if not round_announces.empty:
        live_start = int(round_announces["tick"].max())

    # 2. Pair each round_end after live_start with the latest preceding round_freeze_end
    valid_pairs: List[Tuple[int, int, str, str]] = []  # (freeze_end, round_end, winner, reason)

    if not round_ends.empty:
        # Filter round_ends after live_start and not warmup
        filtered_ends = round_ends[round_ends["tick"] > live_start]
        if "is_warmup_period" in filtered_ends.columns:
            filtered_ends = filtered_ends[filtered_ends["is_warmup_period"] == False]

        for _, r_end in filtered_ends.iterrows():
            end_tick = int(r_end["tick"])
            winner_raw = str(r_end.get("winner", ""))
            winner = "CT" if winner_raw in ("3", "CT") else ("T" if winner_raw in ("2", "T") else "")
            if not winner:
                continue

            reason = str(r_end.get("reason", "normal"))

            # Find latest preceding freeze_end
            if not freeze_ends.empty:
                candidates = freeze_ends[(freeze_ends["tick"] < end_tick) & (freeze_ends["tick"] >= live_start)]
                if not candidates.empty:
                    fe_tick = int(candidates.iloc[-1]["tick"])
                    valid_pairs.append((fe_tick, end_tick, winner, reason))

    if not valid_pairs:
        # Fallback if no freeze_end events: estimate from round_end ticks
        if not round_ends.empty:
            prev = live_start
            for _, r_end in round_ends.iterrows():
                et = int(r_end["tick"])
                w = "CT" if str(r_end.get("winner", "")) in ("3", "CT") else "T"
                valid_pairs.append((prev + 128, et, w, "normal"))
                prev = et

    # 3. Sample Round 1 freeze_end to establish Team A and Team B by steamid
    if not valid_pairs:
        raise ValueError("No valid match rounds found in demo.")

    r1_fe = valid_pairs[0][0]
    r1_ticks = parser_ticks_fn(["team_num", "player_name", "player_steamid"], ticks=[r1_fe])

    team_a_sids: Dict[str, str] = {}
    team_b_sids: Dict[str, str] = {}

    if not r1_ticks.empty and "player_steamid" in r1_ticks.columns:
        for row in r1_ticks.itertuples():
            sid = str(row.player_steamid)
            if not sid or sid in ("0", "None"):
                continue
            name = str(getattr(row, "player_name", f"Player_{sid[-4:]}"))
            tnum = getattr(row, "team_num", 0)
            if tnum == 3:  # CT is Team A initially
                team_a_sids[sid] = name
            elif tnum == 2:  # T is Team B initially
                team_b_sids[sid] = name

    # In case round 1 had missing data, probe subsequent rounds
    if not team_a_sids or not team_b_sids:
        all_fe_ticks = [p[0] for p in valid_pairs]
        multi_ticks = parser_ticks_fn(["team_num", "player_name", "player_steamid"], ticks=all_fe_ticks[:3])
        if not multi_ticks.empty:
            for row in multi_ticks.itertuples():
                sid = str(row.player_steamid)
                if not sid or sid in ("0", "None") or sid in team_a_sids or sid in team_b_sids:
                    continue
                name = str(getattr(row, "player_name", f"Player_{sid[-4:]}"))
                tnum = getattr(row, "team_num", 0)
                if tnum == 3 and len(team_a_sids) < 5:
                    team_a_sids[sid] = name
                elif tnum == 2 and len(team_b_sids) < 5:
                    team_b_sids[sid] = name

    roster = TeamRoster(
        team_a_pids=team_a_sids,
        team_b_pids=team_b_sids,
        team_a_first_side="CT",
    )

    # 4. Sample side of Team A at each round's freeze_end
    fe_ticks_list = [p[0] for p in valid_pairs]
    sides_ticks_df = parser_ticks_fn(["team_num", "player_steamid"], ticks=fe_ticks_list)

    rounds_out: List[RoundDescriptor] = []
    score_a = 0
    score_b = 0

    for idx, (fe_tick, end_tick, winner_side, reason) in enumerate(valid_pairs):
        r_num = idx + 1
        t0 = fe_tick - 128
        total_ticks = (end_tick + 192) - t0
        nf = max(1, (total_ticks // 8) + 1)
        fe_idx = 16  # 128 / 8 = 16

        # Determine side_a by majority of team A players at fe_tick
        side_a = "CT"
        if not sides_ticks_df.empty:
            sub = sides_ticks_df[sides_ticks_df["tick"] == fe_tick]
            team_a_tnums = []
            for _, srow in sub.iterrows():
                sid = str(srow.get("player_steamid", ""))
                if sid in team_a_sids:
                    team_a_tnums.append(srow.get("team_num"))
            if team_a_tnums:
                ct_count = sum(1 for t in team_a_tnums if t == 3)
                t_count = sum(1 for t in team_a_tnums if t == 2)
                side_a = "CT" if ct_count >= t_count else "T"
            else:
                # Heuristic: MR12 swap after round 12
                side_a = "CT" if r_num <= 12 else "T"

        score_before = (score_a, score_b)

        # Update scores based on which side won
        if winner_side == side_a:
            score_a += 1
        else:
            score_b += 1

        rounds_out.append(RoundDescriptor(
            round_num=r_num,
            start_tick=fe_tick,
            end_tick=end_tick,
            t0=t0,
            nf=nf,
            fe=fe_idx,
            side_a=side_a,
            winner=winner_side,
            reason=reason,
            score_before=score_before,
        ))

    # Construct ordered players list: Team A then Team B (pidx 0..9)
    players_list = []
    for sid, name in team_a_sids.items():
        players_list.append({"sid": sid, "name": name, "team": "A"})
    for sid, name in team_b_sids.items():
        players_list.append({"sid": sid, "name": name, "team": "B"})

    return rounds_out, roster, players_list
