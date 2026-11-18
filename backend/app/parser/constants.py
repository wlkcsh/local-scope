"""
CS2 Parser Constants, Weapon Categories, and Utility Valuation.
Derived from Valve CS2 game files and SPEC §3.
"""

from typing import Dict, Set

# Tickrate and Sampling Constants
TICK_RATE = 64
PRE_ROLL_TICKS = 192    # 3.0 seconds at 64 tick
POST_ROLL_TICKS = 128   # 2.0 seconds at 64 tick
FRAME_STEP = 8          # 8 ticks per frame = 8 Hz replay resolution

# Quantization Constants (§2.2)
QUANT_POS = 2           # stored_pos = round(world / 2)
QUANT_YAW = 3           # stored_yaw = round(deg / 3) mod 120

# Grenade Prices for Unspent Utility Mistake Detection (§3.4)
GRENADE_PRICES: Dict[str, int] = {
    "smokegrenade": 300,
    "smoke": 300,
    "smoke grenade": 300,
    "flashbang": 200,
    "flash": 200,
    "hegrenade": 300,
    "he": 300,
    "high explosive grenade": 300,
    "molotov": 400,
    "incgrenade": 500,
    "incendiary grenade": 500,
    "decoy": 50,
    "decoy grenade": 50,
}

# Weapons capable of spray transfers (Rifles, SMGs, LMGs)
SPRAY_WEAPONS: Set[str] = {
    "ak47", "m4a1", "m4a1_silencer", "m4a4", "galilar", "famas", "sg556", "aug",
    "mp9", "mac10", "mp7", "mp5sd", "ump45", "p90", "bizon", "negev", "m249",
}

# Sniper rifles requiring scoping for accurate fire
NOSCOPE_WEAPONS: Set[str] = {
    "awp", "ssg08", "scar20", "g3sg1",
}

# All bullet firing weapons (for counter-strafe evaluation)
NON_BULLET_WEAPONS: Set[str] = {
    "knife", "knife_t", "bayonet", "knife_karambit", "knife_m9_bayonet",
    "taser", "c4", "hegrenade", "flashbang", "smokegrenade", "molotov", "incgrenade", "decoy",
}

# Grenade and throwable utility weapons
GRENADE_WEAPONS: Set[str] = {
    "smokegrenade", "flashbang", "hegrenade", "molotov", "incgrenade", "decoy",
}

# Utility, bomb, or melee weapons that leave a player vulnerable if caught in a duel
HOLDING_WEAPONS: Set[str] = {
    "knife", "knife_t", "bayonet", "knife_karambit", "knife_m9_bayonet",
    "smokegrenade", "flashbang", "hegrenade", "molotov", "incgrenade", "decoy", "c4",
}


def normalize_weapon_name(name: str) -> str:
    """Strip 'weapon_' prefix, lowercase, and sanitize."""
    if not name:
        return "unknown"
    n = str(name).lower().strip()
    if n.startswith("weapon_"):
        n = n[len("weapon_"):]
    # Map common display names to canonical keys
    replacements = {
        "m4a1-s": "m4a1_silencer",
        "usp-s": "usp_silencer",
        "desert eagle": "deagle",
        "galil ar": "galilar",
        "cz75-auto": "cz75a",
        "mp5-sd": "mp5sd",
    }
    return replacements.get(n, n)


def get_grenade_cost(name: str) -> int:
    """Retrieve cost of utility item from inventory name."""
    clean = normalize_weapon_name(name)
    return GRENADE_PRICES.get(clean, 0)
