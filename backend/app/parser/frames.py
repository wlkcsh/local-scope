"""
Tick Frame Encoding and Quantization per SPEC §2.2 and §3.8.
Produces ultra-compact columnar delta-encoded tracks, change lists, shots, and kills.
"""

import math
from typing import List, Dict, Tuple, Optional, Any
from app.schemas import (
    Track,
    RoundBomb,
    ReplayRound,
    ReplayPlayer,
    QuantizationConfig,
)
from app.parser.constants import (
    normalize_weapon_name,
    QUANT_POS,
    QUANT_YAW,
)
from app.parser.maps import project


def delta_encode(values: List[int]) -> List[int]:
    """Encode list of absolute integers into delta stream: [abs0, d1, d2, ...]."""
    if not values:
        return []
    deltas = [values[0]]
    for i in range(1, len(values)):
        deltas.append(values[i] - values[i - 1])
    return deltas


def delta_decode(deltas: List[int]) -> List[int]:
    """Inverse of delta_encode for unit testing and verification."""
    if not deltas:
        return []
    vals = [deltas[0]]
    for d in deltas[1:]:
        vals.append(vals[-1] + d)
    return vals


def encode_yaw_deltas(yaws: List[int]) -> List[int]:
    """
    Delta-encodes 120-step yaw values, wrapping differences to [-60, 59]
    so player rotations across 0/360 boundary take the shortest angular arc.
    """
    if not yaws:
        return []
    deltas = [yaws[0]]
    for i in range(1, len(yaws)):
        diff = (yaws[i] - yaws[i - 1]) % 120
        if diff > 59:
            diff -= 120
        elif diff < -60:
            diff += 120
        deltas.append(diff)
    return deltas


def decode_yaw_deltas(deltas: List[int]) -> List[int]:
    """Inverse of encode_yaw_deltas."""
    if not deltas:
        return []
    vals = [deltas[0] % 120]
    for d in deltas[1:]:
        vals.append((vals[-1] + d) % 120)
    return vals


def build_change_list(values: List[int]) -> List[Tuple[int, int]]:
    """Convert per-frame value series to sparse [frame, value] change list."""
    changes = []
    prev_val = None
    for frame_idx, val in enumerate(values):
        if val != prev_val:
            changes.append((frame_idx, val))
            prev_val = val
    return changes


class FrameEncoder:
    def __init__(self, map_name: str, weapons_dict: List[str], q_pos: int = 2, q_yaw: int = 3):
        self.map_name = map_name
        self.weapons = weapons_dict
        self.weapon_to_idx = {w: idx for idx, w in enumerate(weapons_dict)}
        self.q_pos = q_pos
        self.q_yaw = q_yaw

    def get_weapon_idx(self, weapon_name: str) -> int:
        norm = normalize_weapon_name(weapon_name)
        if norm not in self.weapon_to_idx:
            idx = len(self.weapons)
            self.weapons.append(norm)
            self.weapon_to_idx[norm] = idx
            return idx
        return self.weapon_to_idx[norm]

    def encode_player_track(
        self,
        raw_frames: List[Dict[str, Any]],  # ordered by frame 0..nf-1
    ) -> Optional[Track]:
        """Encodes one player's live frames in a round until death."""
        if not raw_frames:
            return None

        # Determine alive length
        alive_frames = []
        for f in raw_frames:
            if not f.get("is_alive", True):
                break
            alive_frames.append(f)

        if not alive_frames:
            return None

        n = len(alive_frames)
        raw_x = []
        raw_y = []
        raw_yaw = []
        raw_hp = []
        raw_w = []
        raw_layer = []
        blind_entries = []

        for f_idx, f in enumerate(alive_frames):
            # Quantize world position
            qx = int(round(float(f.get("X", 0.0) or 0.0) / self.q_pos))
            qy = int(round(float(f.get("Y", 0.0) or 0.0) / self.q_pos))
            raw_x.append(qx)
            raw_y.append(qy)

            # Quantize yaw: round(deg/3) mod 120
            deg = float(f.get("yaw", 0.0) or 0.0) % 360.0
            qyaw = int(round(deg / self.q_yaw)) % 120
            raw_yaw.append(qyaw)

            hp = max(0, min(100, int(f.get("health", 100) or 100)))
            raw_hp.append(hp)

            widx = self.get_weapon_idx(f.get("active_weapon_name", "knife"))
            raw_w.append(widx)

            # Map layer calculation
            pz = float(f.get("Z", 0.0) or 0.0)
            _, _, lyr = project(self.map_name, float(f.get("X", 0.0) or 0.0), float(f.get("Y", 0.0) or 0.0), pz)
            raw_layer.append(lyr)

            # Flash duration
            flash_dur = float(f.get("flash_duration", 0.0) or 0.0)
            if flash_dur > 0.1:
                blind_frames = int(round(flash_dur * 8))  # 8 frames per sec
                blind_entries.append((f_idx, blind_frames))

        delta_x = delta_encode(raw_x)
        delta_y = delta_encode(raw_y)
        delta_yaws = encode_yaw_deltas(raw_yaw)
        hp_changes = build_change_list(raw_hp)
        w_changes = build_change_list(raw_w)
        layer_changes = build_change_list(raw_layer)

        return Track(
            n=n,
            x=delta_x,
            y=delta_y,
            yaw=delta_yaws,
            hp=hp_changes,
            w=w_changes,
            l=layer_changes if any(l != 0 for l in raw_layer) else None,
            fl=blind_entries if blind_entries else None,
        )
