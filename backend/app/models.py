"""
SQLAlchemy 2.0 Typed Models per SPEC §2.1.
Implements matches, player_match_stats, highlights, mistakes, and ingest_jobs.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import (
    String,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    CheckConstraint,
    Index,
    JSON,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    pass


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (
        CheckConstraint("source IN ('faceit', 'upload')", name="chk_matches_source"),
        CheckConstraint("team_a_first_side IN ('T', 'CT')", name="chk_matches_team_a_side"),
        CheckConstraint("my_team IN ('A', 'B')", name="chk_matches_my_team"),
        CheckConstraint("result IN ('W', 'L', 'D')", name="chk_matches_result"),
        Index("ix_matches_played_created", "played_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    faceit_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    demo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    map: Mapped[str] = mapped_column(String, nullable=False)
    played_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_s: Mapped[int] = mapped_column(Integer, nullable=False)
    tick_rate: Mapped[int] = mapped_column(Integer, nullable=False, default=64)
    rounds_total: Mapped[int] = mapped_column(Integer, nullable=False)
    team_a_name: Mapped[str] = mapped_column(String, nullable=False)
    team_b_name: Mapped[str] = mapped_column(String, nullable=False)
    score_a: Mapped[int] = mapped_column(Integer, nullable=False)
    score_b: Mapped[int] = mapped_column(Integer, nullable=False)
    team_a_first_side: Mapped[str] = mapped_column(String, nullable=False)
    my_steamid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    my_team: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    result: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    replay_path: Mapped[str] = mapped_column(String, nullable=False)
    replay_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    parser_version: Mapped[str] = mapped_column(String, nullable=False, default="v1")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())

    player_stats: Mapped[List["PlayerMatchStat"]] = relationship(
        "PlayerMatchStat", back_populates="match", cascade="all, delete-orphan", passive_deletes=True
    )
    highlights: Mapped[List["Highlight"]] = relationship(
        "Highlight", back_populates="match", cascade="all, delete-orphan", passive_deletes=True
    )
    mistakes: Mapped[List["Mistake"]] = relationship(
        "Mistake", back_populates="match", cascade="all, delete-orphan", passive_deletes=True
    )


class PlayerMatchStat(Base):
    __tablename__ = "player_match_stats"
    __table_args__ = (
        CheckConstraint("team IN ('A', 'B')", name="chk_player_stats_team"),
        Index("ix_player_stats_steamid", "steamid"),
    )

    match_id: Mapped[str] = mapped_column(
        String, ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True
    )
    steamid: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    team: Mapped[str] = mapped_column(String, nullable=False)
    kills: Mapped[int] = mapped_column(Integer, nullable=False)
    deaths: Mapped[int] = mapped_column(Integer, nullable=False)
    assists: Mapped[int] = mapped_column(Integer, nullable=False)
    adr: Mapped[float] = mapped_column(Float, nullable=False)
    hs_pct: Mapped[float] = mapped_column(Float, nullable=False)
    kast_pct: Mapped[float] = mapped_column(Float, nullable=False)
    first_kills: Mapped[int] = mapped_column(Integer, nullable=False)
    first_deaths: Mapped[int] = mapped_column(Integer, nullable=False)
    trade_kills: Mapped[int] = mapped_column(Integer, nullable=False)
    traded_deaths: Mapped[int] = mapped_column(Integer, nullable=False)
    k3: Mapped[int] = mapped_column(Integer, nullable=False)
    k4: Mapped[int] = mapped_column(Integer, nullable=False)
    k5: Mapped[int] = mapped_column(Integer, nullable=False)
    clutches_played: Mapped[int] = mapped_column(Integer, nullable=False)
    clutches_won: Mapped[int] = mapped_column(Integer, nullable=False)
    utility_damage: Mapped[int] = mapped_column(Integer, nullable=False)
    enemies_flashed: Mapped[int] = mapped_column(Integer, nullable=False)
    flash_assists: Mapped[int] = mapped_column(Integer, nullable=False)
    team_flashes: Mapped[int] = mapped_column(Integer, nullable=False)
    shots_fired: Mapped[int] = mapped_column(Integer, nullable=False)
    ttd_ms_median: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ttd_samples: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    counter_strafe_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    counter_strafe_samples: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    first_bullet_acc_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    first_bullet_acc_samples: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    match: Mapped["Match"] = relationship("Match", back_populates="player_stats")


class Highlight(Base):
    __tablename__ = "highlights"
    __table_args__ = (
        CheckConstraint(
            "type IN ('3k', '4k', 'ace', 'clutch', 'spray_transfer', 'wallbang', 'smoke_kill', 'noscope', 'blind_kill')",
            name="chk_highlights_type",
        ),
        Index("ix_highlights_match", "match_id", "steamid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(
        String, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    steamid: Mapped[str] = mapped_column(String, nullable=False)
    round: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    start_tick: Mapped[int] = mapped_column(Integer, nullable=False)
    end_tick: Mapped[int] = mapped_column(Integer, nullable=False)
    kill_ticks: Mapped[List[int]] = mapped_column(JSON, nullable=False)
    weapon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    meta: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)

    match: Mapped["Match"] = relationship("Match", back_populates="highlights")


class Mistake(Base):
    __tablename__ = "mistakes"
    __table_args__ = (
        CheckConstraint(
            "type IN ('unspent_utility', 'team_flash', 'untraded_early_death', 'died_holding_utility', 'self_flash_death')",
            name="chk_mistakes_type",
        ),
        CheckConstraint("severity BETWEEN 1 AND 3", name="chk_mistakes_severity"),
        Index("ix_mistakes_match", "match_id", "steamid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(
        String, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False
    )
    steamid: Mapped[str] = mapped_column(String, nullable=False)
    round: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    tick: Mapped[int] = mapped_column(Integer, nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    z: Mapped[float] = mapped_column(Float, nullable=False)
    layer: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    meta: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)

    match: Mapped["Match"] = relationship("Match", back_populates="mistakes")


class IngestJob(Base):
    __tablename__ = "ingest_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'downloading', 'parsing', 'done', 'error')",
            name="chk_ingest_jobs_status",
        ),
        Index("ix_ingest_jobs_status", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    match_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="queued")
    error: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=func.now(), onupdate=func.now()
    )
