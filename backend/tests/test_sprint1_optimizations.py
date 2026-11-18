"""
Unit tests for Sprint 1 Performance, Concurrency, and Database Optimizations.
Tests SQLite WAL Pragmas, Composite Index definitions, Gzip/IPC pruning,
and N+1 eager query hydration.
"""

import tempfile
from pathlib import Path
import pytest
from sqlalchemy import inspect, text, select
from sqlalchemy.orm import selectinload

import app.db
from app.db import configure_db, SessionLocal
from app.models import Base, Match, PlayerMatchStat, Highlight, Mistake, IngestJob
from app.schemas import MatchRow, PlayerMatchStatsRow, HighlightRow, MistakeRow, ReplayFile, ParsedMatch
from app.ingest.pipeline import _run_parse_worker


def test_sqlite_pragmas_and_indices():
    """Verify WAL pragmas (busy_timeout, synchronous) and composite indexes."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_db_path = Path(tmpdir) / "test_sprint1.db"
        configure_db(f"sqlite:///{test_db_path}")

        # Create all tables on active engine
        Base.metadata.create_all(bind=app.db.engine)

        with SessionLocal() as db:
            # Check PRAGMA journal_mode
            res_wal = db.execute(text("PRAGMA journal_mode;")).scalar()
            assert str(res_wal).upper() == "WAL"

            # Check PRAGMA busy_timeout
            res_timeout = db.execute(text("PRAGMA busy_timeout;")).scalar()
            assert res_timeout == 30000

            # Check PRAGMA synchronous (1 is NORMAL)
            res_sync = db.execute(text("PRAGMA synchronous;")).scalar()
            assert res_sync == 1

        # Check Indexes via inspector
        inspector = inspect(app.db.engine)

        # matches table index
        match_indexes = {idx["name"]: idx["column_names"] for idx in inspector.get_indexes("matches")}
        assert "ix_matches_played_created" in match_indexes
        assert match_indexes["ix_matches_played_created"] == ["played_at", "created_at"]

        # player_match_stats table index
        player_indexes = {idx["name"]: idx["column_names"] for idx in inspector.get_indexes("player_match_stats")}
        assert "ix_player_stats_steamid" in player_indexes
        assert "steamid" in player_indexes["ix_player_stats_steamid"]

        # ingest_jobs table index
        job_indexes = {idx["name"]: idx["column_names"] for idx in inspector.get_indexes("ingest_jobs")}
        assert "ix_ingest_jobs_status" in job_indexes
        assert "status" in job_indexes["ix_ingest_jobs_status"]


def test_eager_selectinload_hydration():
    """Verify selectinload hydration of Match with child entities in single batch query."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_db_path = Path(tmpdir) / "test_eager.db"
        configure_db(f"sqlite:///{test_db_path}")
        Base.metadata.create_all(bind=app.db.engine)

        with SessionLocal() as db:
            m = Match(
                id="test-match-123",
                source="upload",
                map="de_mirage",
                duration_s=1800,
                tick_rate=64,
                rounds_total=12,
                team_a_name="Team A",
                team_b_name="Team B",
                score_a=7,
                score_b=5,
                team_a_first_side="CT",
                replay_path="data/replays/test-match-123.json.gz",
                replay_bytes=50000,
            )
            p = PlayerMatchStat(
                match_id="test-match-123",
                steamid="76561198000000001",
                name="Player1",
                team="A",
                kills=10,
                deaths=5,
                assists=2,
                adr=85.5,
                hs_pct=50.0,
                kast_pct=75.0,
                first_kills=2,
                first_deaths=1,
                trade_kills=1,
                traded_deaths=1,
                k3=1,
                k4=0,
                k5=0,
                clutches_played=1,
                clutches_won=1,
                utility_damage=120,
                enemies_flashed=5,
                flash_assists=1,
                team_flashes=0,
                shots_fired=150,
            )
            h = Highlight(
                match_id="test-match-123",
                steamid="76561198000000001",
                round=3,
                type="3k",
                start_tick=1000,
                end_tick=1500,
                kill_ticks=[1100, 1200, 1300],
                weapon="ak47",
                score=3.5,
                meta={},
            )
            mi = Mistake(
                match_id="test-match-123",
                steamid="76561198000000001",
                round=4,
                type="team_flash",
                tick=2000,
                x=10.0,
                y=20.0,
                z=30.0,
                layer=0,
                severity=2,
                meta={},
            )
            db.add_all([m, p, h, mi])
            db.commit()

        # Re-query in a fresh session using selectinload
        with SessionLocal() as db:
            stmt = (
                select(Match)
                .options(
                    selectinload(Match.player_stats),
                    selectinload(Match.highlights),
                    selectinload(Match.mistakes),
                )
                .where(Match.id == "test-match-123")
            )
            loaded_match = db.scalars(stmt).first()
            assert loaded_match is not None
            assert len(loaded_match.player_stats) == 1
            assert loaded_match.player_stats[0].steamid == "76561198000000001"
            assert len(loaded_match.highlights) == 1
            assert loaded_match.highlights[0].type == "3k"
            assert len(loaded_match.mistakes) == 1
            assert loaded_match.mistakes[0].type == "team_flash"


def test_ipc_worker_payload_pruning():
    """Verify _run_parse_worker prunes heavy replay object from IPC payload."""
    fixture_demo = Path(__file__).resolve().parent / "fixtures" / "sample.dem"
    if not fixture_demo.exists():
        pytest.skip("sample.dem fixture not found")

    result = _run_parse_worker(str(fixture_demo), None)
    assert "parsed" in result
    assert "replay_bytes" in result
    assert isinstance(result["replay_bytes"], bytes)
    assert len(result["replay_bytes"]) > 0

    # Verify that 'replay' object is pruned from IPC 'parsed' dictionary
    parsed_payload = result["parsed"]
    assert "replay" not in parsed_payload
    assert "match" in parsed_payload
    assert "player_stats" in parsed_payload
    assert "highlights" in parsed_payload
    assert "mistakes" in parsed_payload
