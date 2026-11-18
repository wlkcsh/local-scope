"""
Pydantic Schemas for Local-Scope per SPEC §2.1 and §2.2.
Mirrors the exact JSON contracts for replay files, match models, and database rows.
"""

from typing import List, Optional, Literal, Dict, Any, Tuple, Union
from pydantic import BaseModel, Field

Side = Literal["T", "CT"]
Delta = List[int]
Changes = List[Tuple[int, int]]  # [frame, value]


class QuantizationConfig(BaseModel):
    pos: int = 2
    yaw: int = 3


class ReplayPlayer(BaseModel):
    sid: str
    name: str
    team: Literal["A", "B"]


class Track(BaseModel):
    n: int
    x: Delta
    y: Delta
    yaw: Delta
    hp: Changes
    w: Changes
    l: Optional[Changes] = None
    fl: Optional[List[Tuple[int, int]]] = None


class Nade(BaseModel):
    t: Literal["smoke", "flash", "he", "molotov", "decoy"]
    p: int
    f0: int
    x: Delta
    y: Delta
    det: Optional[Tuple[int, int, int, int]] = None  # [frame, x, y, end_frame]


class RoundBomb(BaseModel):
    plant: Optional[Tuple[int, int, int, int]] = None  # [frame, x, y, pidx]
    defuse: Optional[Tuple[int, int]] = None            # [frame, pidx]
    explode: Optional[int] = None                       # frame


class ReplayRound(BaseModel):
    n: int
    t0: int
    nf: int
    fe: int
    side_a: Side
    winner: Side
    reason: str
    score: Tuple[int, int]
    p: List[Optional[Track]]
    bomb: Optional[RoundBomb] = None
    nades: List[Nade] = Field(default_factory=list)
    kills: List[Tuple[int, int, int, int, int, int]] = Field(default_factory=list)
    shots: Tuple[Delta, List[int]] = Field(default_factory=lambda: ([], []))


class ReplayFile(BaseModel):
    v: int = 1
    match_id: str
    map: str
    tick_rate: int = 64
    frame_step: int = 8
    q: QuantizationConfig = Field(default_factory=QuantizationConfig)
    weapons: List[str]
    players: List[ReplayPlayer]
    rounds: List[ReplayRound]


# Match Metadata and Ingest Schemas (§2.1)
class MatchMeta(BaseModel):
    match_id: Optional[str] = None
    source: Literal["faceit", "upload"] = "upload"
    faceit_url: Optional[str] = None
    demo_url: Optional[str] = None
    team_a_name: Optional[str] = None
    team_b_name: Optional[str] = None
    my_steamid: Optional[str] = None


class MatchRow(BaseModel):
    id: str
    source: Literal["faceit", "upload"]
    faceit_url: Optional[str] = None
    demo_url: Optional[str] = None
    map: str
    played_at: Optional[str] = None
    duration_s: int
    tick_rate: int = 64
    rounds_total: int
    team_a_name: str
    team_b_name: str
    score_a: int
    score_b: int
    team_a_first_side: Side
    my_steamid: Optional[str] = None
    my_team: Optional[Literal["A", "B"]] = None
    result: Optional[Literal["W", "L", "D"]] = None
    replay_path: str
    replay_bytes: int
    parser_version: str = "v1"
    owner_user_id: Optional[str] = None
    is_public: bool = False
    is_owner: bool = False


class PlayerMatchStatsRow(BaseModel):
    match_id: str
    steamid: str
    name: str
    team: Literal["A", "B"]
    kills: int
    deaths: int
    assists: int
    adr: float
    hs_pct: float
    kast_pct: float
    first_kills: int
    first_deaths: int
    trade_kills: int
    traded_deaths: int
    k3: int
    k4: int
    k5: int
    clutches_played: int
    clutches_won: int
    utility_damage: int
    enemies_flashed: int
    flash_assists: int
    team_flashes: int
    shots_fired: int
    ttd_ms_median: Optional[float] = None
    ttd_samples: int = 0
    counter_strafe_pct: Optional[float] = None
    counter_strafe_samples: int = 0
    first_bullet_acc_pct: Optional[float] = None
    first_bullet_acc_samples: int = 0


class HighlightRow(BaseModel):
    id: Optional[int] = None
    match_id: str
    steamid: str
    round: int
    type: Literal["3k", "4k", "ace", "clutch", "spray_transfer", "wallbang", "smoke_kill", "noscope", "blind_kill"]
    start_tick: int
    end_tick: int
    kill_ticks: List[int]
    weapon: Optional[str] = None
    score: float
    meta: Dict[str, Any]


class MistakeRow(BaseModel):
    id: Optional[int] = None
    match_id: str
    steamid: str
    round: int
    type: Literal[
        "unspent_utility",
        "team_flash",
        "untraded_early_death",
        "died_holding_utility",
        "self_flash_death",
    ]
    tick: int
    x: float
    y: float
    z: float
    layer: int = 0
    severity: int
    meta: Dict[str, Any]


class ParsedMatch(BaseModel):
    match: MatchRow
    player_stats: List[PlayerMatchStatsRow]
    highlights: List[HighlightRow]
    mistakes: List[MistakeRow]
    replay: ReplayFile
    replay_gz_bytes: Optional[bytes] = None
