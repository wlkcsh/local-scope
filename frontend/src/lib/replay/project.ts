import { MapCalibration } from "../types";

export const MAP_CALIBRATION: Record<string, MapCalibration> = {
  de_mirage: {
    pos_x: -3230.0,
    pos_y: 1713.0,
    scale: 5.0,
    lower_z_max: null,
    upper_radar: "/maps/de_mirage.png",
    lower_radar: null,
  },
  de_inferno: {
    pos_x: -2087.0,
    pos_y: 3870.0,
    scale: 4.9,
    lower_z_max: null,
    upper_radar: "/maps/de_inferno.png",
    lower_radar: null,
  },
  de_dust2: {
    pos_x: -2476.0,
    pos_y: 3239.0,
    scale: 4.4,
    lower_z_max: null,
    upper_radar: "/maps/de_dust2.png",
    lower_radar: null,
  },
  de_ancient: {
    pos_x: -2953.0,
    pos_y: 2164.0,
    scale: 5.0,
    lower_z_max: null,
    upper_radar: "/maps/de_ancient.png",
    lower_radar: null,
  },
  de_anubis: {
    pos_x: -2796.0,
    pos_y: 3328.0,
    scale: 5.22,
    lower_z_max: null,
    upper_radar: "/maps/de_anubis.png",
    lower_radar: null,
  },
  de_overpass: {
    pos_x: -4831.0,
    pos_y: 1781.0,
    scale: 5.2,
    lower_z_max: null,
    upper_radar: "/maps/de_overpass.png",
    lower_radar: null,
  },
  de_train: {
    pos_x: -2308.0,
    pos_y: 2078.0,
    scale: 4.082,
    lower_z_max: null,
    upper_radar: "/maps/de_train.png",
    lower_radar: null,
  },
  de_nuke: {
    pos_x: -3453.0,
    pos_y: 2887.0,
    scale: 7.0,
    lower_z_max: -495.0,
    upper_radar: "/maps/de_nuke.png",
    lower_radar: "/maps/de_nuke_lower.png",
  },
  de_vertigo: {
    pos_x: -3168.0,
    pos_y: 1762.0,
    scale: 4.0,
    lower_z_max: 11700.0,
    upper_radar: "/maps/de_vertigo.png",
    lower_radar: "/maps/de_vertigo_lower.png",
  },
};

/**
 * Project world coordinates (X, Y, Z) to 1024x1024 radar pixel coordinates and layer.
 * per SPEC §3.7:
 * px = (X - pos_x) / scale
 * py = (pos_y - Y) / scale
 */
export function projectWorldToRadar(
  mapName: string,
  x: number,
  y: number,
  z: number = 0
): { px: number; py: number; layer: number; percentX: number; percentY: number } {
  const cal = MAP_CALIBRATION[mapName] || MAP_CALIBRATION["de_mirage"];
  const px = (x - cal.pos_x) / cal.scale;
  const py = (cal.pos_y - y) / cal.scale;
  const layer =
    cal.lower_z_max != null && z < cal.lower_z_max ? 1 : 0;

  return {
    px,
    py,
    layer,
    percentX: (px / 1024) * 100,
    percentY: (py / 1024) * 100,
  };
}

export function getRadarImageUrl(mapName: string, layer: number = 0): string {
  const cal = MAP_CALIBRATION[mapName];
  if (!cal) return "/maps/de_mirage.png";
  if (layer === 1 && cal.lower_radar) {
    return cal.lower_radar;
  }
  return cal.upper_radar;
}

export function hasMultiLayer(mapName: string): boolean {
  return MAP_CALIBRATION[mapName]?.lower_radar != null;
}

export const project = projectWorldToRadar;

