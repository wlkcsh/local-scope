"""
Map Calibration and Coordinate Projection per SPEC §3.7.
Loads map_calibration.json and exposes project() to transform 3D world coordinates
into 1024x1024 radar space and determine vertical layers (0=upper/default, 1=lower).
"""

import json
from pathlib import Path
from typing import Dict, Optional, Tuple, Any

CALIBRATION_FILE = Path(__file__).resolve().parent / "map_calibration.json"

FALLBACK_CALIBRATION: Dict[str, Dict[str, Any]] = {
    "de_mirage": {"pos_x": -3230.0, "pos_y": 1713.0, "scale": 5.0, "lower_z_max": None},
    "de_inferno": {"pos_x": -2087.0, "pos_y": 3870.0, "scale": 4.9, "lower_z_max": None},
    "de_dust2": {"pos_x": -2476.0, "pos_y": 3239.0, "scale": 4.4, "lower_z_max": None},
    "de_ancient": {"pos_x": -2953.0, "pos_y": 2164.0, "scale": 5.0, "lower_z_max": None},
    "de_anubis": {"pos_x": -2796.0, "pos_y": 3328.0, "scale": 5.22, "lower_z_max": None},
    "de_overpass": {"pos_x": -4831.0, "pos_y": 1781.0, "scale": 5.20, "lower_z_max": None},
    "de_train": {"pos_x": -2308.0, "pos_y": 2078.0, "scale": 4.082, "lower_z_max": None},
    "de_nuke": {"pos_x": -3453.0, "pos_y": 2887.0, "scale": 7.0, "lower_z_max": -495.0},
    "de_vertigo": {"pos_x": -3168.0, "pos_y": 1762.0, "scale": 4.0, "lower_z_max": 11700.0},
}


def load_calibration() -> Dict[str, Dict[str, Any]]:
    if CALIBRATION_FILE.exists():
        try:
            with open(CALIBRATION_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return FALLBACK_CALIBRATION


_CALIBRATION = load_calibration()


def normalize_map_name(name: str) -> str:
    n = str(name).lower().strip()
    if "/" in n:
        n = n.split("/")[-1]
    if n.endswith(".vpk"):
        n = n[:-4]
    return n


def get_map_meta(map_name: str) -> Dict[str, Any]:
    clean = normalize_map_name(map_name)
    if clean in _CALIBRATION:
        return _CALIBRATION[clean]
    for k, v in _CALIBRATION.items():
        if k in clean:
            return v
    return {"pos_x": 0.0, "pos_y": 0.0, "scale": 5.0, "lower_z_max": None}


def project(
    map_name: str,
    x: float,
    y: float,
    z: float = 0.0,
    canvas_size: float = 1024.0,
) -> Tuple[float, float, int]:
    """
    Project world (X, Y, Z) to radar coordinates per SPEC §3.7.
    
    Formula:
        px = (X - pos_x) / scale
        py = (pos_y - Y) / scale  # in 1024x1024 radar space
        canvas = px * (canvas_size / 1024)
        layer = 1 if (map has lower_z_max and Z < lower_z_max) else 0

    Returns:
        (canvas_x, canvas_y, layer)
    """
    meta = get_map_meta(map_name)
    pos_x = float(meta["pos_x"])
    pos_y = float(meta["pos_y"])
    scale = float(meta["scale"])
    lower_z_max = meta.get("lower_z_max")

    px = (x - pos_x) / scale
    py = (pos_y - y) / scale

    if canvas_size != 1024.0:
        factor = canvas_size / 1024.0
        px *= factor
        py *= factor

    layer = 1 if (lower_z_max is not None and z < float(lower_z_max)) else 0
    return round(px, 1), round(py, 1), layer
