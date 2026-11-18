"""
Highlight Detection Engine per SPEC §3.3.
Detects multi-kills (3k, 4k, ace), 1vX clutches, spray transfers, wallbangs,
smoke kills, noscopes, and blind kills with [-192, +128] tick padding.
"""

from typing import List, Dict, Tuple, Optional, Any, Set
import pandas as pd
from app.schemas import HighlightRow
from app.parser.constants import (
    PRE_ROLL_TICKS,
    POST_ROLL_TICKS,
    SPRAY_WEAPONS,
    NOSCOPE_WEAPONS,
    normalize_weapon_name,
)
from app.parser.rounds import RoundDescriptor


def detect_highlights(
    match_id: str,
    rounds: List[RoundDescriptor],
    deaths: pd.DataFrame,
    player_sid_to_team: Dict[str, str],  # sid -> 'A' or 'B'
) -> List[HighlightRow]:
    highlights: List[HighlightRow] = []

    if deaths.empty:
        return highlights

    for r in rounds:
        st = r.start_tick
        et = r.end_tick
        r_num = r.round_num
        winner_side = r.winner

        r_deaths = deaths[(deaths["tick"] >= st) & (deaths["tick"] <= et)].sort_values(by="tick")
        if r_deaths.empty:
            continue

        # 1. Multi-kill Detection (3k, 4k, ace)
        round_multikill_spans: Dict[str, Tuple[int, int]] = {}  # sid -> (start_tick, end_tick)
        
        # Valid kills only: attacker != victim and teams differ
        valid_kills_per_attacker: Dict[str, List[Dict[str, Any]]] = {}
        for _, krow in r_deaths.iterrows():
            atk = str(krow.get("attacker_steamid", ""))
            vic = str(krow.get("user_steamid", ""))
            if not atk or atk == vic or atk in ("0", "None"):
                continue
            
            atk_team = player_sid_to_team.get(atk)
            vic_team = player_sid_to_team.get(vic)
            if atk_team and vic_team and atk_team == vic_team:
                continue  # Friendly fire

            if atk not in valid_kills_per_attacker:
                valid_kills_per_attacker[atk] = []
            valid_kills_per_attacker[atk].append({
                "tick": int(krow["tick"]),
                "weapon": normalize_weapon_name(str(krow.get("weapon", ""))),
                "headshot": bool(krow.get("headshot", False)),
                "penetrated": int(krow.get("penetrated", 0) or 0),
                "thrusmoke": bool(krow.get("thrusmoke", False)),
                "noscope": bool(krow.get("noscope", False)),
                "attackerblind": bool(krow.get("attackerblind", False)),
            })

        for atk, pkills in valid_kills_per_attacker.items():
            kcount = len(pkills)
            first_tick = pkills[0]["tick"]
            last_tick = pkills[-1]["tick"]
            kticks = [k["tick"] for k in pkills]
            
            win_start = max(st, first_tick - PRE_ROLL_TICKS)
            win_end = min(et, last_tick + POST_ROLL_TICKS)

            if kcount >= 3:
                hl_type = "ace" if kcount >= 5 else ("4k" if kcount == 4 else "3k")
                score = 10.0 if kcount >= 5 else (5.0 if kcount == 4 else 3.0)
                round_multikill_spans[atk] = (win_start, win_end)

                highlights.append(HighlightRow(
                    match_id=match_id,
                    steamid=atk,
                    round=r_num,
                    type=hl_type,
                    start_tick=win_start,
                    end_tick=win_end,
                    kill_ticks=kticks,
                    weapon=pkills[-1]["weapon"],
                    score=score,
                    meta={"kills": kcount, "spray": False},
                ))

            # 2. Spray Transfer Detection (gap <= 128 ticks, same weapon in SPRAY_WEAPONS)
            if kcount >= 2:
                for i in range(len(pkills) - 1):
                    k1 = pkills[i]
                    k2 = pkills[i + 1]
                    gap = k2["tick"] - k1["tick"]
                    if gap <= 128 and k1["weapon"] in SPRAY_WEAPONS and k1["weapon"] == k2["weapon"]:
                        span_ms = int(round((gap / 64.0) * 1000.0))
                        # Check if absorbed by multi-kill
                        if atk in round_multikill_spans:
                            # Mark spray=True in the multi-kill row
                            for hl in highlights:
                                if hl.steamid == atk and hl.round == r_num and hl.type in ("3k", "4k", "ace"):
                                    hl.meta["spray"] = True
                        else:
                            st_start = max(st, k1["tick"] - PRE_ROLL_TICKS)
                            st_end = min(et, k2["tick"] + POST_ROLL_TICKS)
                            highlights.append(HighlightRow(
                                match_id=match_id,
                                steamid=atk,
                                round=r_num,
                                type="spray_transfer",
                                start_tick=st_start,
                                end_tick=st_end,
                                kill_ticks=[k1["tick"], k2["tick"]],
                                weapon=k1["weapon"],
                                score=2.0 + 2,
                                meta={"span_ms": span_ms},
                            ))

            # 3. Solo kill highlights (wallbang, noscope, smoke_kill, blind_kill)
            for k in pkills:
                kt = k["tick"]
                k_start = max(st, kt - PRE_ROLL_TICKS)
                k_end = min(et, kt + POST_ROLL_TICKS)

                if k["penetrated"] > 0:
                    highlights.append(HighlightRow(
                        match_id=match_id,
                        steamid=atk,
                        round=r_num,
                        type="wallbang",
                        start_tick=k_start,
                        end_tick=k_end,
                        kill_ticks=[kt],
                        weapon=k["weapon"],
                        score=2.0,
                        meta={"penetrated": k["penetrated"]},
                    ))
                if k["thrusmoke"]:
                    highlights.append(HighlightRow(
                        match_id=match_id,
                        steamid=atk,
                        round=r_num,
                        type="smoke_kill",
                        start_tick=k_start,
                        end_tick=k_end,
                        kill_ticks=[kt],
                        weapon=k["weapon"],
                        score=2.0,
                        meta={},
                    ))
                if k["noscope"] and k["weapon"] in NOSCOPE_WEAPONS:
                    highlights.append(HighlightRow(
                        match_id=match_id,
                        steamid=atk,
                        round=r_num,
                        type="noscope",
                        start_tick=k_start,
                        end_tick=k_end,
                        kill_ticks=[kt],
                        weapon=k["weapon"],
                        score=3.0,
                        meta={},
                    ))
                if k["attackerblind"]:
                    highlights.append(HighlightRow(
                        match_id=match_id,
                        steamid=atk,
                        round=r_num,
                        type="blind_kill",
                        start_tick=k_start,
                        end_tick=k_end,
                        kill_ticks=[kt],
                        weapon=k["weapon"],
                        score=2.0,
                        meta={},
                    ))

        # 4. Clutch Detection (§3.3)
        # Walk round deaths in order, track alive set per side.
        # First time a side has exactly 1 player alive and other has X >= 1, record (player, X, tick)
        ct_alive: Set[str] = {sid for sid, tm in player_sid_to_team.items() if (tm == "A" and r.side_a == "CT") or (tm == "B" and r.side_a == "T")}
        t_alive: Set[str] = {sid for sid, tm in player_sid_to_team.items() if (tm == "A" and r.side_a == "T") or (tm == "B" and r.side_a == "CT")}
        
        clutch_recorded = False
        for _, krow in r_deaths.iterrows():
            vic = str(krow.get("user_steamid", ""))
            ct_alive.discard(vic)
            t_alive.discard(vic)

            if not clutch_recorded:
                if len(ct_alive) == 1 and len(t_alive) >= 1:
                    lone_player = next(iter(ct_alive))
                    vs_count = len(t_alive)
                    c_tick = int(krow["tick"])
                    clutch_recorded = True
                    # Check if won
                    if winner_side == "CT":
                        highlights.append(HighlightRow(
                            match_id=match_id,
                            steamid=lone_player,
                            round=r_num,
                            type="clutch",
                            start_tick=max(st, c_tick - PRE_ROLL_TICKS),
                            end_tick=et,
                            kill_ticks=[int(krow["tick"])],
                            weapon=None,
                            score=2.0 + 2.0 * vs_count,
                            meta={"vs": vs_count},
                        ))
                elif len(t_alive) == 1 and len(ct_alive) >= 1:
                    lone_player = next(iter(t_alive))
                    vs_count = len(ct_alive)
                    c_tick = int(krow["tick"])
                    clutch_recorded = True
                    if winner_side == "T":
                        highlights.append(HighlightRow(
                            match_id=match_id,
                            steamid=lone_player,
                            round=r_num,
                            type="clutch",
                            start_tick=max(st, c_tick - PRE_ROLL_TICKS),
                            end_tick=et,
                            kill_ticks=[int(krow["tick"])],
                            weapon=None,
                            score=2.0 + 2.0 * vs_count,
                            meta={"vs": vs_count},
                        ))

    return highlights
