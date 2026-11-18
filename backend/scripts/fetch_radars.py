"""
Script to fetch authoritative CS2 radar overview textures and calibration data.
Places 1024x1024 PNGs into frontend/public/maps/ and writes backend/app/parser/map_calibration.json.
Per SPEC §3.7.
"""

import os
import json
import logging
from pathlib import Path
import requests
from PIL import Image
import io

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("fetch_radars")

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_MAPS_DIR = ROOT_DIR / "frontend" / "public" / "maps"
CALIBRATION_JSON = ROOT_DIR / "backend" / "app" / "parser" / "map_calibration.json"

# Authoritative MurkyYT repository extracted from official CS2 game depot
BASE_IMG_URL = "https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/images/radars"

# Map definitions per SPEC §3.7 with authoritative coordinates
MAP_ENTRIES = {
    "de_mirage": {
        "pos_x": -3230.0,
        "pos_y": 1713.0,
        "scale": 5.0,
        "lower_z_max": None,
        "remote_upper": "de_mirage_radar_psd.png",
        "remote_lower": None,
    },
    "de_inferno": {
        "pos_x": -2087.0,
        "pos_y": 3870.0,
        "scale": 4.9,
        "lower_z_max": None,
        "remote_upper": "de_inferno_radar_psd.png",
        "remote_lower": None,
    },
    "de_dust2": {
        "pos_x": -2476.0,
        "pos_y": 3239.0,
        "scale": 4.4,
        "lower_z_max": None,
        "remote_upper": "de_dust2_radar_psd.png",
        "remote_lower": None,
    },
    "de_ancient": {
        "pos_x": -2953.0,
        "pos_y": 2164.0,
        "scale": 5.0,
        "lower_z_max": None,
        "remote_upper": "de_ancient_radar_psd.png",
        "remote_lower": None,
    },
    "de_anubis": {
        "pos_x": -2796.0,
        "pos_y": 3328.0,
        "scale": 5.22,
        "lower_z_max": None,
        "remote_upper": "de_anubis_radar_psd.png",
        "remote_lower": None,
    },
    "de_overpass": {
        "pos_x": -4831.0,
        "pos_y": 1781.0,
        "scale": 5.20,
        "lower_z_max": None,
        "remote_upper": "de_overpass_radar_psd.png",
        "remote_lower": None,
    },
    "de_train": {
        "pos_x": -2308.0,
        "pos_y": 2078.0,
        "scale": 4.082,
        "lower_z_max": None,
        "remote_upper": "de_train_radar_psd.png",
        "remote_lower": None,
    },
    "de_nuke": {
        "pos_x": -3453.0,
        "pos_y": 2887.0,
        "scale": 7.0,
        "lower_z_max": -495.0,
        "remote_upper": "de_nuke_radar_psd.png",
        "remote_lower": "de_nuke_lower_radar_psd.png",
    },
    "de_vertigo": {
        "pos_x": -3168.0,
        "pos_y": 1762.0,
        "scale": 4.0,
        "lower_z_max": 11700.0,
        "remote_upper": "de_vertigo_radar_psd.png",
        "remote_lower": "de_vertigo_lower_radar_psd.png",
    },
}


def download_image(url: str, dest_path: Path):
    if dest_path.exists() and dest_path.stat().st_size > 10000:
        logger.info("Radar already exists: %s", dest_path.name)
        return

    logger.info("Downloading %s -> %s", url, dest_path.name)
    try:
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            img = Image.open(io.BytesIO(resp.content))
            img = img.resize((1024, 1024))
            img.save(dest_path, "PNG")
            logger.info("Saved %s (1024x1024)", dest_path.name)
        else:
            logger.warning("Failed to fetch %s (HTTP %d)", url, resp.status_code)
    except Exception as e:
        logger.error("Error downloading %s: %s", url, e)


def fetch_all():
    FRONTEND_MAPS_DIR.mkdir(parents=True, exist_ok=True)
    CALIBRATION_JSON.parent.mkdir(parents=True, exist_ok=True)

    calibration_out = {}

    for map_key, meta in MAP_ENTRIES.items():
        # Destination names: <map>.png and <map>_lower.png per SPEC §3.7
        dest_upper = FRONTEND_MAPS_DIR / f"{map_key}.png"
        download_image(f"{BASE_IMG_URL}/{meta['remote_upper']}", dest_upper)

        if meta["remote_lower"]:
            dest_lower = FRONTEND_MAPS_DIR / f"{map_key}_lower.png"
            download_image(f"{BASE_IMG_URL}/{meta['remote_lower']}", dest_lower)

        calibration_out[map_key] = {
            "pos_x": meta["pos_x"],
            "pos_y": meta["pos_y"],
            "scale": meta["scale"],
            "lower_z_max": meta["lower_z_max"],
            "upper_radar": f"/maps/{map_key}.png",
            "lower_radar": f"/maps/{map_key}_lower.png" if meta["remote_lower"] else None,
        }

    with open(CALIBRATION_JSON, "w", encoding="utf-8") as f:
        json.dump(calibration_out, f, indent=2)

    logger.info("Saved map calibration table to %s", CALIBRATION_JSON)


if __name__ == "__main__":
    fetch_all()
