"""
Grenade Trajectory and Detonation Processing per SPEC §2.2 and §3.8.
Groups parse_grenades() by entity id, snaps to 8 Hz frames, and pairs with detonation events.
"""

import math
from typing import List, Dict, Tuple, Optional, Any
import pandas as pd
from app.schemas import Nade
from app.parser.frames import delta_encode


GRENADE_TYPE_MAP = {
    "csmokegrenadeprojectile": "smoke",
    "smokegrenade": "smoke",
    "cflashbangprojectile": "flash",
    "flashbang": "flash",
    "chegrenadeprojectile": "he",
    "hegrenade": "he",
    "cmolotovprojectile": "molotov",
    "cinferno": "molotov",
    "molotov": "molotov",
    "cdecoyprojectile": "decoy",
    "decoy": "decoy",
}

NADE_EVENT_MATCH = {
    "smoke": ["smoke", "smokegrenade"],
    "flash": ["flash", "flashbang"],
    "he": ["he", "hegrenade"],
    "molotov": ["inferno", "molotov", "incendiary"],
    "decoy": ["decoy"],
}


def normalize_nade_type(raw_type: str) -> str:
    clean = str(raw_type).lower().strip()
    for k, v in GRENADE_TYPE_MAP.items():
        if k in clean:
            return v
    return "he"


def process_round_grenades(
    round_t0: int,
    round_nf: int,
    player_sid_to_pidx: Dict[str, int],
    grenades_df: pd.DataFrame,
    events: Dict[str, pd.DataFrame],
    q_pos: int = 2,
) -> List[Nade]:
    """Processes flight trajectories and detonations for a round."""
    nades_out: List[Nade] = []
    if grenades_df.empty:
        return nades_out

    round_end_tick = round_t0 + round_nf * 8
    # Filter grenades occurring in this round's tick window and drop NaN coordinates
    sub_gn = grenades_df[(grenades_df["tick"] >= round_t0) & (grenades_df["tick"] <= round_end_tick)].dropna(subset=["x", "y"])
    if sub_gn.empty:
        return nades_out

    # Group by entity id if present, else by thrower & type
    group_col = "grenade_entity_id" if "grenade_entity_id" in sub_gn.columns else "steamid"

    # Pre-extract detonation events for this round
    detonations = []
    for ev_name in ["smokegrenade_detonate", "inferno_startburn", "flashbang_detonate", "hegrenade_detonate"]:
        if ev_name in events and not events[ev_name].empty:
            df = events[ev_name]
            r_sub = df[(df["tick"] >= round_t0) & (df["tick"] <= round_end_tick)]
            for _, row in r_sub.iterrows():
                detonations.append({
                    "event": ev_name,
                    "tick": int(row["tick"]),
                    "x": float(row.get("x", 0.0) or 0.0),
                    "y": float(row.get("y", 0.0) or 0.0),
                    "entityid": row.get("entityid"),
                })

    # Pre-extract expiration events
    expirations = []
    for ev_name in ["smokegrenade_expired", "inferno_expire"]:
        if ev_name in events and not events[ev_name].empty:
            df = events[ev_name]
            r_sub = df[(df["tick"] >= round_t0) & (df["tick"] <= round_end_tick)]
            for _, row in r_sub.iterrows():
                expirations.append({
                    "event": ev_name,
                    "tick": int(row["tick"]),
                    "entityid": row.get("entityid"),
                })

    for gid, group in sub_gn.groupby(group_col):
        sorted_g = group.sort_values(by="tick")
        first_tick = int(sorted_g.iloc[0]["tick"])
        last_tick = int(sorted_g.iloc[-1]["tick"])

        thrower_sid = str(sorted_g.iloc[0].get("steamid", ""))
        pidx = player_sid_to_pidx.get(thrower_sid, 0)
        nade_type = normalize_nade_type(sorted_g.iloc[0].get("grenade_type", "he"))

        f0 = max(0, (first_tick - round_t0) // 8)

        # 1. Match with detonation event
        # Priority A: exact entity ID match
        matched_det = None
        for det in detonations:
            if det.get("entityid") is not None and det["entityid"] == gid:
                matched_det = det
                break

        # Priority B: match by event type and time window (thrown before detonation, det within entity lifetime + 32 ticks)
        allowed_events = NADE_EVENT_MATCH.get(nade_type, [nade_type])
        if not matched_det:
            for det in detonations:
                ev_type = det["event"].split("_")[0].lower()
                if any(a in ev_type or ev_type in a for a in allowed_events):
                    if (first_tick - 16) <= det["tick"] <= (last_tick + 32):
                        matched_det = det
                        break

        # Priority C: match by proximity to last_tick (e.g. for flash/HE/molotov where entity despawns at explosion)
        if not matched_det:
            for det in detonations:
                ev_type = det["event"].split("_")[0].lower()
                if any(a in ev_type or ev_type in a for a in allowed_events):
                    if abs(det["tick"] - last_tick) < 48:
                        matched_det = det
                        break

        # 2. Flight ends when the grenade detonates (or when entity disappears)
        flight_end_tick = min(last_tick, matched_det["tick"]) if matched_det else last_tick
        f_flight_end = max(f0, min(round_nf, ((flight_end_tick - round_t0) // 8) + 1))

        # Sample trajectory every 8 ticks during in-flight phase only
        frame_pts_x = []
        frame_pts_y = []
        for f_idx in range(f0, f_flight_end):
            target_tk = round_t0 + f_idx * 8
            # Find closest sample in group
            closest_idx = (sorted_g["tick"] - target_tk).abs().idxmin()
            pt = sorted_g.loc[closest_idx]
            vx = float(pt.get("x", 0.0) or 0.0)
            vy = float(pt.get("y", 0.0) or 0.0)
            if math.isnan(vx) or math.isnan(vy):
                continue
            px = int(round(vx / q_pos))
            py = int(round(vy / q_pos))
            frame_pts_x.append(px)
            frame_pts_y.append(py)

        if not frame_pts_x:
            continue

        det_tuple = None
        if matched_det:
            dx = float(matched_det["x"])
            dy = float(matched_det["y"])
            if not math.isnan(dx) and not math.isnan(dy):
                det_frame = max(0, (matched_det["tick"] - round_t0) // 8)
                qx = int(round(dx / q_pos))
                qy = int(round(dy / q_pos))

                # Expiration calculation
                if nade_type == "smoke":
                    # Check for explicit smokegrenade_expired event
                    exp_tick = None
                    for exp in expirations:
                        if exp.get("entityid") is not None and exp["entityid"] == gid:
                            exp_tick = exp["tick"]
                            break
                    if exp_tick is None and last_tick > matched_det["tick"] + 128:
                        exp_tick = last_tick
                    if exp_tick is not None:
                        end_frame = max(det_frame + 2, (exp_tick - round_t0) // 8)
                    else:
                        end_frame = det_frame + 144  # CS2 smokes last ~18s (144 frames at 8 Hz)
                elif nade_type == "molotov":
                    exp_tick = None
                    for exp in expirations:
                        if exp.get("entityid") is not None and exp["entityid"] == gid:
                            exp_tick = exp["tick"]
                            break
                    if exp_tick is not None:
                        end_frame = max(det_frame + 2, (exp_tick - round_t0) // 8)
                    else:
                        end_frame = det_frame + 56   # Molotovs last ~7s (56 frames at 8 Hz)
                else:
                    end_frame = det_frame + 8  # Flash / HE shockwave lasts ~1s (8 frames at 8 Hz)

                det_tuple = (det_frame, qx, qy, min(round_nf, end_frame))
        elif nade_type in ("he", "flash", "molotov", "smoke") and len(frame_pts_x) >= 2:
            # Trajectory landing detection fallback if demo dropped detonation event
            land_idx = len(frame_pts_x) - 1
            for k in range(1, len(frame_pts_x) - 2):
                if frame_pts_x[k] == frame_pts_x[k + 1] == frame_pts_x[k + 2] and frame_pts_y[k] == frame_pts_y[k + 1] == frame_pts_y[k + 2]:
                    land_idx = k
                    break
            det_frame = f0 + land_idx
            qx = frame_pts_x[land_idx]
            qy = frame_pts_y[land_idx]
            if nade_type == "smoke":
                dur = 144
            elif nade_type == "molotov":
                dur = 56
            else:
                dur = 8
            det_tuple = (det_frame, qx, qy, min(round_nf, det_frame + dur))
            frame_pts_x = frame_pts_x[:land_idx + 1]
            frame_pts_y = frame_pts_y[:land_idx + 1]

        nades_out.append(Nade(
            t=nade_type,
            p=pidx,
            f0=f0,
            x=delta_encode(frame_pts_x),
            y=delta_encode(frame_pts_y),
            det=det_tuple,
        ))

    return nades_out
