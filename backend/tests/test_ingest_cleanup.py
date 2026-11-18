"""
Verification Tests for Ingest Pipeline, Auto-Cleanup, and API Endpoints
per SPEC §4 and Phase 2.
"""

import os
import gzip
import time
import uuid
import shutil
import asyncio
from pathlib import Path
from unittest.mock import patch
import pytest
import orjson
import httpx

from app.main import app
from app.config import settings
from app.db import init_db, configure_db, SessionLocal
from app.models import Match, PlayerMatchStat, IngestJob
from app.ingest.pipeline import execute_ingest_job


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment(tmp_path_factory):
    """Isolate test database and storage directories."""
    base_tmp = tmp_path_factory.mktemp("scope_test")
    settings.database_url = f"sqlite:///{base_tmp}/test.db"
    settings.data_dir = base_tmp / "data"
    settings.tmp_dir = base_tmp / "tmp"
    configure_db(settings.database_url)
    init_db()


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health_check(client):
    """Verify /api/health endpoint returns status ok without requiring auth."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_upload_and_get_endpoints_e2e(client):
    """
    1. POST /api/ingest/upload with sample.dem runs to 'done',
    2. Deletes the .dem file from tmp_dir,
    3. Persists match, player stats, highlights, and mistakes,
    4. All GET endpoints return valid responses.
    """
    sample_dem = Path(__file__).parent / "fixtures" / "sample.dem"
    if not sample_dem.exists():
        pytest.skip("sample.dem fixture not found")

    with open(sample_dem, "rb") as f:
        upload_resp = await client.post(
            "/api/ingest/upload",
            files={"file": ("sample.dem", f, "application/octet-stream")},
        )
    assert upload_resp.status_code == 202
    job_id = upload_resp.json()["job_id"]

    # Poll /api/jobs/{job_id} until status is done or error (timeout 45s)
    status = "queued"
    match_id = None
    for _ in range(90):
        await asyncio.sleep(0.5)
        j_resp = await client.get(f"/api/jobs/{job_id}")
        assert j_resp.status_code == 200
        j_data = j_resp.json()
        status = j_data["status"]
        if status in ("done", "error"):
            match_id = j_data.get("match_id")
            break

    assert status == "done", f"Ingest job failed: {j_data.get('error')}"
    assert match_id is not None

    # CRITICAL REQUIREMENT 1: The uploaded .dem must be deleted from tmp_dir
    tmp_dem_file = settings.resolved_tmp_dir / f"{job_id}.dem"
    assert not tmp_dem_file.exists(), f"Temporary demo file {tmp_dem_file} was not deleted!"

    # Verify GET /api/matches
    matches_resp = await client.get("/api/matches")
    assert matches_resp.status_code == 200
    matches_list = matches_resp.json()
    assert any(m["id"] == match_id for m in matches_list)

    # Verify GET /api/matches/{id}
    detail_resp = await client.get(f"/api/matches/{match_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["match"]["id"] == match_id
    assert len(detail["player_stats"]) > 0
    assert len(detail["highlights"]) > 0
    assert len(detail["mistakes"]) > 0

    # Verify GET /api/matches/{id}/highlights
    hl_resp = await client.get(f"/api/matches/{match_id}/highlights")
    assert hl_resp.status_code == 200
    assert len(hl_resp.json()) > 0

    # Verify GET /api/matches/{id}/mistakes
    mis_resp = await client.get(f"/api/matches/{match_id}/mistakes")
    assert mis_resp.status_code == 200
    assert len(mis_resp.json()) > 0

    # Verify GET /api/matches/{id}/replay (streams raw .json.gz bytes)
    replay_resp = await client.get(f"/api/matches/{match_id}/replay")
    assert replay_resp.status_code == 200
    assert "application/json" in replay_resp.headers.get("content-type", "")
    assert replay_resp.headers.get("content-encoding") == "gzip"

    # Verify replay contents
    payload = replay_resp.content
    if payload.startswith(b"\x1f\x8b"):
        payload = gzip.decompress(payload)
    replay_json = orjson.loads(payload)
    assert replay_json["match_id"] == match_id
    assert replay_json["v"] == 1
    assert len(replay_json["rounds"]) > 0


@pytest.mark.asyncio
async def test_duplicate_reupload_returns_existing(client):
    """
    Re-uploading the exact same sample.dem returns the existing match_id
    without duplicating database rows and still deletes the temp .dem file.
    """
    sample_dem = Path(__file__).parent / "fixtures" / "sample.dem"
    if not sample_dem.exists():
        pytest.skip("sample.dem fixture not found")

    with SessionLocal() as db:
        initial_match_count = db.query(Match).count()
        initial_stat_count = db.query(PlayerMatchStat).count()

    with open(sample_dem, "rb") as f:
        upload_resp = await client.post(
            "/api/ingest/upload",
            files={"file": ("sample.dem", f, "application/octet-stream")},
        )
    assert upload_resp.status_code == 202
    job_id = upload_resp.json()["job_id"]

    for _ in range(90):
        await asyncio.sleep(0.5)
        j_resp = await client.get(f"/api/jobs/{job_id}")
        if j_resp.json()["status"] in ("done", "error"):
            break

    j_data = j_resp.json()
    assert j_data["status"] == "done"

    # Temporary demo must be deleted
    tmp_dem_file = settings.resolved_tmp_dir / f"{job_id}.dem"
    assert not tmp_dem_file.exists(), f"Duplicate temp demo {tmp_dem_file} was not deleted!"

    # Verify no duplicate rows were added to the database
    with SessionLocal() as db:
        final_match_count = db.query(Match).count()
        final_stat_count = db.query(PlayerMatchStat).count()
        assert final_match_count == initial_match_count
        assert final_stat_count == initial_stat_count


@pytest.mark.asyncio
async def test_parse_demo_simulated_exception_cleanup():
    """
    When parse_demo raises a simulated RuntimeError, the job transitions to 'error'
    AND the .dem file in tmp_dir is deleted.
    """
    job_id = f"test_err_{uuid.uuid4().hex[:8]}"
    staged_dem = settings.resolved_tmp_dir / f"{job_id}.dem"
    staged_dem.write_bytes(b"FAKEDEMO_INVALID_HEADER_DATA")
    assert staged_dem.exists()

    with SessionLocal() as db:
        job = IngestJob(id=job_id, status="queued")
        db.add(job)
        db.commit()

    with patch("app.ingest.pipeline.parse_demo", side_effect=RuntimeError("Simulated corruption parse error")):
        with pytest.raises(Exception):
            await execute_ingest_job(job_id=job_id, upload_dem_path=staged_dem)

    # Job status must be 'error'
    with SessionLocal() as db:
        persisted_job = db.get(IngestJob, job_id)
        assert persisted_job is not None
        assert persisted_job.status == "error"

    # CRITICAL ASSERTION: The .dem file MUST be deleted despite exception
    assert not staged_dem.exists(), f"Corrupted demo file {staged_dem} was not deleted on error!"


@pytest.mark.asyncio
async def test_download_abort_simulated_exception_cleanup():
    """
    When httpx stream aborts mid-download with an exception, the job transitions
    to 'error' AND the partial .dem file in tmp_dir is deleted.
    """
    job_id = f"test_abort_{uuid.uuid4().hex[:8]}"
    dem_path = settings.resolved_tmp_dir / f"{job_id}.dem"

    with SessionLocal() as db:
        job = IngestJob(id=job_id, status="queued")
        db.add(job)
        db.commit()

    async def mock_abort_stream(url, dest, client, max_bytes):
        # Simulate partial bytes written before connection dropped
        dest.write_bytes(b"PARTIAL_BYTES_STREAMED_BEFORE_CRASH")
        raise ConnectionResetError("FACEIT CDN dropped TCP connection abruptly")

    with patch("app.ingest.pipeline.resolve_source") as mock_resolve, \
         patch("app.ingest.pipeline.stream_and_decompress", side_effect=mock_abort_stream):

        from app.ingest.faceit import IngestTarget
        mock_resolve.return_value = IngestTarget(
            match_id=f"abort-{job_id[:8]}",
            source="faceit",
            faceit_url=None,
            demo_url="https://faceit-cdn.net/fake.dem.gz",
            signed_url="https://faceit-cdn.net/signed.dem.gz",
            team_a_name="A",
            team_b_name="B",
            played_at=None,
            faction_rosters=None,
        )

        with pytest.raises(ConnectionResetError):
            await execute_ingest_job(job_id=job_id, source_str="1-fake-abort-room")

    # Job status must be 'error'
    with SessionLocal() as db:
        persisted_job = db.get(IngestJob, job_id)
        assert persisted_job is not None
        assert persisted_job.status == "error"

    # CRITICAL ASSERTION: The partial .dem file MUST be deleted on abort
    assert not dem_path.exists(), f"Partial demo file {dem_path} was not deleted on stream abort!"
