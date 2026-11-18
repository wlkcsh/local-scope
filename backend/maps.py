"""
CS2 Map Metadata and 2D Radar Coordinate Projection.
Contains official map bounds, scaling factors, and multi-level Z-layer definitions
for all active competitive Counter-Strike 2 maps.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple, Literal


@dataclass(frozen=True)
class VerticalSection:
    altitude_min: float
    altitude_max: float
    radar_layer: str  # e.g., "upper", "lower"
    radar_file: str   # e.g., "de_nuke_radar_psd.png", "de_nuke_lower_radar_psd.png"


@dataclass(frozen=True)
class MapConfig:
    name: str
    display_name: str
    pos_x: float
    pos_y: float
    scale: float
    radar_size: int = 1024
    vertical_sections: Optional[Dict[str, VerticalSection]] = None
    default_radar_file: str = ""

    def get_layer_and_file(self, z: float) -> Tuple[str, str]:
        """
        Determines whether player is on upper or lower floor based on Z-coordinate.
        Crucial for multi-level maps like de_nuke and de_vertigo.
        """
        if not self.vertical_sections:
            return "upper", self.default_radar_file

        for section_name, section in self.vertical_sections.items():
            if section.altitude_min <= z <= section.altitude_max:
                return section.radar_layer, section.radar_file

        return "upper", self.default_radar_file


# CS2 Active Duty & Competitive Map Radar Configurations
# pos_x and pos_y represent top-left world coordinate origin.
# scale is Hammer units per radar pixel.
MAP_CONFIGS: Dict[str, MapConfig] = {
    "de_mirage": MapConfig(
        name="de_mirage",
        display_name="Mirage",
        pos_x=-3230.0,
        pos_y=1713.0,
        scale=5.0,
        default_radar_file="de_mirage_radar_psd.png",
    ),
    "de_inferno": MapConfig(
        name="de_inferno",
        display_name="Inferno",
        pos_x=-2087.0,
        pos_y=3870.0,
        scale=4.9,
        default_radar_file="de_inferno_radar_psd.png",
    ),
    "de_nuke": MapConfig(
        name="de_nuke",
        display_name="Nuke",
        pos_x=-3453.0,
        pos_y=2887.0,
        scale=7.0,
        default_radar_file="de_nuke_radar_psd.png",
        vertical_sections={
            "upper": VerticalSection(
                altitude_min=-495.0,
                altitude_max=10000.0,
                radar_layer="upper",
                radar_file="de_nuke_radar_psd.png",
            ),
            "lower": VerticalSection(
                altitude_min=-10000.0,
                altitude_max=-495.0,
                radar_layer="lower",
                radar_file="de_nuke_lower_radar_psd.png",
            ),
        },
    ),
    "de_vertigo": MapConfig(
        name="de_vertigo",
        display_name="Vertigo",
        pos_x=-3168.0,
        pos_y=1762.0,
        scale=4.0,
        default_radar_file="de_vertigo_radar_psd.png",
        vertical_sections={
            "upper": VerticalSection(
                altitude_min=11700.0,
                altitude_max=20000.0,
                radar_layer="upper",
                radar_file="de_vertigo_radar_psd.png",
            ),
            "lower": VerticalSection(
                altitude_min=-10000.0,
                altitude_max=11700.0,
                radar_layer="lower",
                radar_file="de_vertigo_lower_radar_psd.png",
            ),
        },
    ),
    "de_dust2": MapConfig(
        name="de_dust2",
        display_name="Dust II",
        pos_x=-2476.0,
        pos_y=3239.0,
        scale=4.4,
        default_radar_file="de_dust2_radar_psd.png",
    ),
    "de_ancient": MapConfig(
        name="de_ancient",
        display_name="Ancient",
        pos_x=-2953.0,
        pos_y=2164.0,
        scale=5.0,
        default_radar_file="de_ancient_radar_psd.png",
    ),
    "de_anubis": MapConfig(
        name="de_anubis",
        display_name="Anubis",
        pos_x=-2796.0,
        pos_y=3328.0,
        scale=5.22,
        default_radar_file="de_anubis_radar_psd.png",
    ),
}


def get_map_config(map_name: str) -> Optional[MapConfig]:
    """Retrieve MapConfig with fuzzy fallback for workshop / full path variants."""
    clean_name = map_name.lower().strip()
    if "/" in clean_name:
        clean_name = clean_name.split("/")[-1]
    if clean_name.endswith(".vpk"):
        clean_name = clean_name[:-4]

    for key, cfg in MAP_CONFIGS.items():
        if key == clean_name or key in clean_name:
            return cfg
    return None


def world_to_radar(
    map_name: str,
    x: float,
    y: float,
    z: float = 0.0,
    radar_dim: int = 1024,
) -> Tuple[float, float, str, str]:
    """
    Converts 3D CS2 in-game world coordinates (X, Y, Z) into 2D radar image pixel coordinates.
    
    Formula:
        Pixel_X = (World_X - pos_x) / scale
        Pixel_Y = (pos_y - World_Y) / scale

    Returns:
        (pixel_x, pixel_y, layer_name, radar_filename)
        e.g., (412.5, 518.2, "upper", "de_nuke_radar_psd.png")
    """
    cfg = get_map_config(map_name)
    if not cfg:
        # Fallback linear mapping if map is unknown
        return x, y, "upper", "unknown_radar.png"

    pixel_x = (x - cfg.pos_x) / cfg.scale
    pixel_y = (cfg.pos_y - y) / cfg.scale

    # Scale proportionally if canvas radar dimension differs from native 1024
    if radar_dim != cfg.radar_size and cfg.radar_size > 0:
        factor = radar_dim / cfg.radar_size
        pixel_x *= factor
        pixel_y *= factor

    layer_name, radar_file = cfg.get_layer_and_file(z)
    return round(pixel_x, 1), round(pixel_y, 1), layer_name, radar_file


def world_to_normalized(
    map_name: str,
    x: float,
    y: float,
    z: float = 0.0,
) -> Tuple[float, float, str, str]:
    """
    Converts 3D CS2 world coordinates to normalized [0.0, 1.0] coordinates
    for responsive web UI rendering on arbitrary canvas sizes.
    """
    px, py, layer, file = world_to_radar(map_name, x, y, z, radar_dim=1024)
    norm_x = max(0.0, min(1.0, px / 1024.0))
    norm_y = max(0.0, min(1.0, py / 1024.0))
    return round(norm_x, 4), round(norm_y, 4), layer, file
