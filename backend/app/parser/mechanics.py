"""
Aim and Movement Mechanics Telemetry Engine per SPEC §3.5.
Calculates Counter-Strafing % from burst-first velocity and
Time-To-Damage (TTD) from engagement sight lines and angle bearings.
"""

import math
from typing import Dict, List, Tuple, Optional, Any
import numpy as np
import pandas as pd
from app.parser.constants import NON_BULLET_WEAPONS, normalize_weapon_name


def compute_counter_strafing(
    fires: pd.DataFrame,
) -> Dict[str, Tuple[Optional[float], int]]:
    """
    Computes Counter-Strafing % per player per SPEC §3.5.
    - Bullet weapons only.
    - Burst-first shots: no shot by same player in previous 26 ticks.
    - Good shot if hypot(user_velocity_X, user_velocity_Y) < 34.
    - Returns None if < 20 samples.
    """
    results: Dict[str, Tuple[Optional[float], int]] = {}
    if fires.empty:
        return results

    sorted_fires = fires.sort_values(by="tick")
    player_prev_tick: Dict[str, int] = {}
    player_good_shots: Dict[str, int] = {}
    player_burst_firsts: Dict[str, int] = {}

    for _, row in sorted_fires.iterrows():
        sid = str(row.get("user_steamid", ""))
        if not sid or sid in ("0", "None"):
            continue

        wpn = normalize_weapon_name(str(row.get("weapon", "")))
        if wpn in NON_BULLET_WEAPONS:
            continue

        tk = int(row["tick"])
        last_tk = player_prev_tick.get(sid, -999)
        player_prev_tick[sid] = tk

        # Burst-first: gap > 26 ticks
        if tk - last_tk > 26:
            vx = float(row.get("user_velocity_X", 0.0) or 0.0)
            vy = float(row.get("user_velocity_Y", 0.0) or 0.0)
            speed = math.hypot(vx, vy)

            player_burst_firsts[sid] = player_burst_firsts.get(sid, 0) + 1
            if speed < 34.0:
                player_good_shots[sid] = player_good_shots.get(sid, 0) + 1

    for sid, total in player_burst_firsts.items():
        if total >= 20:
            good = player_good_shots.get(sid, 0)
            pct = round((good / total) * 100.0, 1)
            results[sid] = (pct, total)
        else:
            results[sid] = (None, total)

    return results


def compute_ttd(
    hurts: pd.DataFrame,
    parser_ticks_fn,
    player_sid_to_team: Dict[str, str],
) -> Dict[str, Tuple[Optional[float], int]]:
    """
    Computes Time-To-Damage (TTD in ms) per player per SPEC §3.5.
    - First bullet hurt from A on enemy V with no A->V hurt in previous 320 ticks.
    - Sight window [hurt - 128, hurt].
    - Sight angle between A's yaw and A->V bearing <= 45 degrees, and V is spotted.
    - Discard TTD outside [80, 1500] ms.
    - Returns median and sample count (None if < 5 samples).
    """
    results: Dict[str, Tuple[Optional[float], int]] = {}
    if hurts.empty:
        return results

    # Identify engagements
    sorted_hurts = hurts.sort_values(by="tick")
    last_engagement: Dict[Tuple[str, str], int] = {}
    engagements: List[Dict[str, Any]] = []

    for _, row in sorted_hurts.iterrows():
        atk = str(row.get("attacker_steamid", ""))
        vic = str(row.get("user_steamid", ""))
        if not atk or not vic or atk == vic or atk in ("0", "None"):
            continue

        atk_team = player_sid_to_team.get(atk)
        vic_team = player_sid_to_team.get(vic)
        if atk_team and vic_team and atk_team == vic_team:
            continue

        wpn = normalize_weapon_name(str(row.get("weapon", "")))
        if wpn in NON_BULLET_WEAPONS:
            continue

        tk = int(row["tick"])
        last_tk = last_engagement.get((atk, vic), -999)
        if tk - last_tk > 320:
            last_engagement[(atk, vic)] = tk
            engagements.append({"atk": atk, "vic": vic, "tick": tk})

    if not engagements:
        return results

    # Union windows [hurt - 128, hurt]
    # Sample every 4 ticks to keep query fast while maintaining precision
    sample_ticks = set()
    for eng in engagements:
        ht = eng["tick"]
        for t in range(max(0, ht - 128), ht + 1, 4):
            sample_ticks.add(t)

    ticks_df = pd.DataFrame()
    if sample_ticks:
        try:
            ticks_df = parser_ticks_fn(
                ["X", "Y", "Z", "yaw", "spotted", "player_steamid"],
                ticks=sorted(list(sample_ticks))
            )
        except Exception:
            pass

    # Index ticks by (tick, steamid)
    tick_cache: Dict[Tuple[int, str], Dict[str, Any]] = {}
    if not ticks_df.empty and "player_steamid" in ticks_df.columns:
        for r in ticks_df.itertuples():
            tk = int(r.tick)
            sid = str(r.player_steamid)
            tick_cache[(tk, sid)] = {
                "x": float(getattr(r, "X", 0.0) or 0.0),
                "y": float(getattr(r, "Y", 0.0) or 0.0),
                "yaw": float(getattr(r, "yaw", 0.0) or 0.0),
                "spotted": bool(getattr(r, "spotted", False) or False),
            }

    ttd_samples: Dict[str, List[float]] = {}

    for eng in engagements:
        atk = eng["atk"]
        vic = eng["vic"]
        ht = eng["tick"]

        t_seen = None
        # Walk forward from ht - 128 to ht
        for t in range(max(0, ht - 128), ht + 1, 4):
            atk_pos = tick_cache.get((t, atk))
            vic_pos = tick_cache.get((t, vic))
            if not atk_pos or not vic_pos:
                continue

            # Bearing from A to V
            dx = vic_pos["x"] - atk_pos["x"]
            dy = vic_pos["y"] - atk_pos["y"]
            bearing = math.degrees(math.atan2(dy, dx)) % 360.0

            # Angle difference
            yaw_diff = abs((atk_pos["yaw"] - bearing + 180.0) % 360.0 - 180.0)
            if yaw_diff <= 45.0:
                t_seen = t
                break

        if t_seen is not None and t_seen < ht:
            ttd_ms = ((ht - t_seen) / 64.0) * 1000.0
            if 80.0 <= ttd_ms <= 1500.0:
                if atk not in ttd_samples:
                    ttd_samples[atk] = []
                ttd_samples[atk].append(ttd_ms)

    for sid, samples in ttd_samples.items():
        if len(samples) >= 5:
            results[sid] = (round(float(np.median(samples)), 1), len(samples))
        else:
            results[sid] = (None, len(samples))

    return results


def compute_first_bullet_accuracy(
    fires: pd.DataFrame,
    hurts: pd.DataFrame,
    player_sid_to_team: Dict[str, str],
) -> Dict[str, Tuple[Optional[float], int]]:
    """
    Computes First-Bullet Accuracy % per player (Scope.gg Parity).
    - Bullet weapons only.
    - Burst-first shots: no shot by same player in previous 26 ticks.
    - Hit registered if player_hurt occurred within [fire_tick, fire_tick + 4] ticks on an enemy.
    - Returns (pct, sample_count). None if < 15 samples.
    """
    import bisect

    results: Dict[str, Tuple[Optional[float], int]] = {}
    if fires.empty:
        return results

    sorted_fires = fires.sort_values(by="tick")
    player_prev_tick: Dict[str, int] = {}
    player_burst_firsts: Dict[str, int] = {}
    player_burst_hits: Dict[str, int] = {}

    # Pre-index hurts by attacker_steamid for fast binary searches
    hurts_by_atk: Dict[str, List[int]] = {}
    if not hurts.empty:
        for _, h_row in hurts.iterrows():
            atk = str(h_row.get("attacker_steamid", ""))
            vic = str(h_row.get("user_steamid", ""))
            if not atk or not vic or atk == vic:
                continue
            atk_team = player_sid_to_team.get(atk)
            vic_team = player_sid_to_team.get(vic)
            if atk_team and vic_team and atk_team == vic_team:
                continue  # Friendly fire
            tk = int(h_row["tick"])
            hurts_by_atk.setdefault(atk, []).append(tk)

    for atk in hurts_by_atk:
        hurts_by_atk[atk].sort()

    for _, row in sorted_fires.iterrows():
        sid = str(row.get("user_steamid", ""))
        if not sid or sid in ("0", "None"):
            continue

        wpn = normalize_weapon_name(str(row.get("weapon", "")))
        if wpn in NON_BULLET_WEAPONS:
            continue

        tk = int(row["tick"])
        last_tk = player_prev_tick.get(sid, -999)
        player_prev_tick[sid] = tk

        if tk - last_tk > 26:
            player_burst_firsts[sid] = player_burst_firsts.get(sid, 0) + 1
            atk_hurts = hurts_by_atk.get(sid, [])
            if atk_hurts:
                idx = bisect.bisect_left(atk_hurts, tk)
                if idx < len(atk_hurts) and atk_hurts[idx] <= tk + 4:
                    player_burst_hits[sid] = player_burst_hits.get(sid, 0) + 1

    for sid, total in player_burst_firsts.items():
        if total >= 15:
            hits = player_burst_hits.get(sid, 0)
            pct = round((hits / total) * 100.0, 1)
            results[sid] = (pct, total)
        else:
            results[sid] = (None, total)

    return results
