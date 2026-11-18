"""
Radar PNG Asset and Coordinate Metadata Downloader.
Downloads high-resolution 1024x1024 radar overviews and vertical section layers
directly from official CS2 extracted depot, storing them locally for the 2D replay player.
"""

import os
import json
import logging
from pathlib import Path
import requests
from PIL import Image
import io

from backend.maps import MAP_CONFIGS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("radar_downloader")

BASE_RAW_URL = "https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/images/radars"
ASSETS_DIR = Path(__file__).resolve().parent / "assets"
RADARS_DIR = ASSETS_DIR / "radars"

RADAR_FILES = [
    "de_mirage_radar_psd.png",
    "de_inferno_radar_psd.png",
    "de_nuke_radar_psd.png",
    "de_nuke_lower_radar_psd.png",
    "de_vertigo_radar_psd.png",
    "de_vertigo_lower_radar_psd.png",
    "de_dust2_radar_psd.png",
    "de_ancient_radar_psd.png",
    "de_anubis_radar_psd.png",
]


def download_radar_assets(target_dir: Path = RADARS_DIR) -> Dict[str, bool]:
    """Download all required 1024x1024 radar PNGs."""
    target_dir.mkdir(parents=True, exist_ok=True)
    results = {}

    for filename in RADAR_FILES:
        target_path = target_dir / filename
        if target_path.exists() and target_path.stat().st_size > 10000:
            logger.info("Radar already exists: %s (%d bytes)", filename, target_path.stat().st_size)
            results[filename] = True
            continue

        url = f"{BASE_RAW_URL}/{filename}"
        logger.info("Downloading %s from %s ...", filename, url)
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200 and len(resp.content) > 1000:
                # Verify it is a valid PNG image
                img = Image.open(io.BytesIO(resp.content))
                img.verify()
                
                with open(target_path, "wb") as f:
                    f.write(resp.content)
                logger.info("Saved %s [%dx%d, %d bytes]", filename, img.width, img.height, len(resp.content))
                results[filename] = True
            else:
                logger.error("Failed to download %s: HTTP %d", filename, resp.status_code)
                results[filename] = False
        except Exception as exc:
            logger.error("Error downloading %s: %s", filename, exc)
            results[filename] = False

    return results


def export_metadata_json(output_path: Path = ASSETS_DIR / "map_metadata.json") -> None:
    """Export complete map coordinate metadata for frontend and backend usage."""
    data = {}
    for map_name, cfg in MAP_CONFIGS.items():
        entry = {
            "name": cfg.name,
            "display_name": cfg.display_name,
            "pos_x": cfg.pos_x,
            "pos_y": cfg.pos_y,
            "scale": cfg.scale,
            "radar_size": cfg.radar_size,
            "default_radar": cfg.default_radar_file,
            "vertical_sections": {},
        }
        if cfg.vertical_sections:
            for s_name, sec in cfg.vertical_sections.items():
                entry["vertical_sections"][s_name] = {
                    "altitude_min": sec.altitude_min,
                    "altitude_max": sec.altitude_max,
                    "radar_layer": sec.radar_layer,
                    "radar_file": sec.radar_file,
                }
        data[map_name] = entry

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    logger.info("Saved map metadata to %s", output_path)


if __name__ == "__main__":
    download_radar_assets()
    export_metadata_json()
