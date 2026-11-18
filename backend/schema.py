"""
Pydantic Data Contract & Exact JSON Schema for Local-Scope.
Ensures zero field-name mismatches between Python parser/API and Next.js frontend.
"""

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field


class MatchScore(BaseModel):
    ct: int
    t: int


class PlayerStats(BaseModel):
    steamid: str
    name: str
    team: Literal["CT", "T", "SPECTATOR"]
    kills: int
    deaths: int
    assists: int
    adr: float
    kast: float
    hs_pct: float
    entry_kills: int
    entry_deaths: int
    flash_assists: int
    util_damage: int
    avg_ttd_ms: Optional[float] = None
    counter_strafe_pct: Optional[float] = None


class Highlight(BaseModel):
    id: str
    type: Literal["CLUTCH_1V1", "CLUTCH_1V2", "CLUTCH_1V3", "CLUTCH_1V4", "CLUTCH_1V5", "ACE_5K", "MULTI_4K", "MULTI_3K", "FAST_TRANSFER", "CUSTOM"]
    title: str
    player_steamid: str
    round: int
    start_tick: int
    end_tick: int
    console_cmd: str


class Mistake(BaseModel):
    round: int
    tick: int
    player_steamid: str
    type: Literal["UNSPENT_UTILITY", "TEAM_FLASH", "UNTRADED_FIRST_DEATH", "BAD_PEEK", "CROSSHAIR_MISPLACEMENT"]
    detail: str
    x: float
    y: float
    z: Optional[float] = None


class PlayerTick(BaseModel):
    id: str = Field(description="SteamID of the player")
    tm: int = Field(description="Team number: 2=T, 3=CT")
    x: float
    y: float
    yaw: float
    hp: int
    w: str = Field(description="Active weapon short name, e.g. ak47, m4a1_silencer")
    z: Optional[float] = None
    layer: Optional[Literal["upper", "lower"]] = None


class NadeTick(BaseModel):
    type: Literal["smoke", "flash", "he", "molotov", "incendiary", "decoy"]
    x: float
    y: float
    z: Optional[float] = None
    state: Literal["thrown", "active", "exploded", "expired"]


class KillTick(BaseModel):
    t: int = Field(description="Exact kill tick")
    atk: str = Field(description="Attacker SteamID")
    vic: str = Field(description="Victim SteamID")
    w: str = Field(description="Weapon used")
    hs: bool = Field(description="Headshot flag")


class TickFrame(BaseModel):
    t: int = Field(description="Current game tick (sampled at 8 Hz)")
    p: List[PlayerTick] = Field(default_factory=list)
    nades: List[NadeTick] = Field(default_factory=list)
    kills: List[KillTick] = Field(default_factory=list)


class RoundData(BaseModel):
    round_num: int
    winner: Literal["CT", "T"]
    win_reason: str
    start_tick: int
    end_tick: int
    ticks: List[TickFrame] = Field(default_factory=list)


class MatchData(BaseModel):
    match_id: str
    map: str
    played_at: str
    score: MatchScore
    players: List[PlayerStats]
    highlights: List[Highlight]
    mistakes: List[Mistake]
    rounds: List[RoundData]
