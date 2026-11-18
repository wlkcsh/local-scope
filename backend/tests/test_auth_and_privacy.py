"""
Comprehensive Unit & Integration Tests for User Accounts, Multi-User Privacy,
SteamID64 Match Participant Auto-Sharing, and Short-Lived Upload Tokens.
"""

import time
import uuid
import pytest
import httpx
from sqlalchemy import select

from app.main import app
from app.config import settings
from app.db import SessionLocal, configure_db, init_db
from app.models import User, Match, PlayerMatchStat
from app.auth.security import (
    hash_password,
    verify_password,
    create_token,
    verify_token_str,
    validate_steamid64,
    validate_username,
)


@pytest.fixture(scope="module", autouse=True)
def setup_auth_test_db(tmp_path_factory):
    """Isolate test database and storage directories for auth & privacy tests."""
    base_tmp = tmp_path_factory.mktemp("auth_privacy_test")
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


def test_password_hashing():
    pw = "SuperSecretPassword123!"
    h = hash_password(pw)
    assert h.startswith("scrypt$")
    assert verify_password(pw, h) is True
    assert verify_password("WrongPassword!", h) is False
    assert verify_password("", h) is False

    with pytest.raises(ValueError):
        hash_password("short")


def test_token_signing_and_verification():
    secret = "test-secret-key-123456789012345678"
    token = create_token({"sub": "user-1", "scope": "session"}, ttl_seconds=10, secret=secret)
    assert "." in token

    # Positive verify
    payload = verify_token_str(token, secret, expected_scope="session")
    assert payload is not None
    assert payload["sub"] == "user-1"
    assert payload["scope"] == "session"

    # Wrong scope
    assert verify_token_str(token, secret, expected_scope="upload") is None

    # Wrong secret
    assert verify_token_str(token, "wrong-secret-key-wrong-secret", expected_scope="session") is None

    # Expired token
    expired_token = create_token({"sub": "user-1", "scope": "session"}, ttl_seconds=-5, secret=secret)
    assert verify_token_str(expired_token, secret) is None


def test_input_validators():
    assert validate_steamid64("76561198000000001") == "76561198000000001"
    assert validate_steamid64(None) is None
    assert validate_steamid64("") is None

    with pytest.raises(ValueError):
        validate_steamid64("12345")  # not 17 digits

    with pytest.raises(ValueError):
        validate_steamid64("86561198000000001")  # not starting with 7656119

    assert validate_username("atabek_123") == "atabek_123"
    with pytest.raises(ValueError):
        validate_username("ab")  # too short
    with pytest.raises(ValueError):
        validate_username("user with spaces")


@pytest.mark.asyncio
async def test_auth_registration_login_and_profile_flow(client, monkeypatch):
    monkeypatch.setattr(settings, "invite_code", "squad-secret-2026")
    uid_suffix = uuid.uuid4().hex[:6]
    username = f"user_{uid_suffix}"

    # 1. Config endpoint reports invite required
    cfg_resp = await client.get("/api/auth/config")
    assert cfg_resp.status_code == 200
    assert cfg_resp.json()["invite_required"] is True

    # 2. Register with invalid invite code -> 400
    reg_fail = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "Password123!",
            "invite_code": "wrong-code",
        },
    )
    assert reg_fail.status_code == 400
    assert "invite code" in reg_fail.json()["detail"].lower()

    # 3. Register with correct invite code -> 200 and cookie set
    reg_ok = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "Password123!",
            "display_name": "ProPlayer",
            "steamid": "76561198000000001",
            "invite_code": "squad-secret-2026",
        },
    )
    assert reg_ok.status_code == 200
    user_data = reg_ok.json()
    assert user_data["username"] == username
    assert user_data["display_name"] == "ProPlayer"
    assert user_data["steamid"] == "76561198000000001"
    assert "ls_session" in reg_ok.cookies

    # 4. GET /api/auth/me using session cookie
    me_resp = await client.get("/api/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == username

    # 5. PATCH /api/auth/me to update SteamID64
    patch_resp = await client.patch(
        "/api/auth/me",
        json={"steamid": "76561198000000099", "display_name": "CarryGod"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["steamid"] == "76561198000000099"
    assert patch_resp.json()["display_name"] == "CarryGod"

    # 6. POST /api/auth/upload-token produces valid 5-min upload token
    token_resp = await client.post("/api/auth/upload-token")
    assert token_resp.status_code == 200
    upload_token = token_resp.json()["upload_token"]
    assert upload_token is not None
    payload = verify_token_str(upload_token, settings.auth_secret, expected_scope="upload")
    assert payload is not None
    assert payload["sub"] == user_data["id"]

    # 7. Logout clears session cookie
    logout_resp = await client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    # 8. GET /api/auth/me after logout -> 401
    me_after_logout = await client.get("/api/auth/me")
    assert me_after_logout.status_code == 401


@pytest.mark.asyncio
async def test_match_privacy_isolation_participant_sharing_and_share_link(client, monkeypatch):
    monkeypatch.setattr(settings, "invite_code", None)

    # Register User A (Uploader)
    suffix = uuid.uuid4().hex[:6]
    name_a = f"alice_{suffix}"
    reg_a = await client.post(
        "/api/auth/register",
        json={"username": name_a, "password": "Password123!", "steamid": "76561198000000010"},
    )
    assert reg_a.status_code == 200
    user_a = reg_a.json()
    cookie_a = {"ls_session": reg_a.cookies["ls_session"]}

    # Register User B (Teammate / Participant with SteamID 76561198000000020)
    name_b = f"bob_{suffix}"
    reg_b = await client.post(
        "/api/auth/register",
        json={"username": name_b, "password": "Password123!", "steamid": "76561198000000020"},
    )
    assert reg_b.status_code == 200
    user_b = reg_b.json()
    cookie_b = {"ls_session": reg_b.cookies["ls_session"]}

    # Register User C (Stranger / Unrelated user)
    name_c = f"stranger_{suffix}"
    reg_c = await client.post(
        "/api/auth/register",
        json={"username": name_c, "password": "Password123!", "steamid": "76561198000000030"},
    )
    assert reg_c.status_code == 200
    cookie_c = {"ls_session": reg_c.cookies["ls_session"]}

    # Seed Match 1 owned by Alice where Bob is a participant (SteamID 76561198000000020)
    match_id = f"test-priv-{uuid.uuid4().hex[:8]}"
    with SessionLocal() as db:
        m = Match(
            id=match_id,
            owner_user_id=user_a["id"],
            is_public=False,
            source="upload",
            map="de_mirage",
            duration_s=1800,
            tick_rate=64,
            rounds_total=24,
            team_a_name="Team A",
            team_b_name="Team B",
            score_a=13,
            score_b=11,
            team_a_first_side="CT",
            replay_path=f"data/replays/{match_id}.json.gz",
            replay_bytes=1000,
        )
        # Alice played on Team A (Won 13-11)
        stat_a = PlayerMatchStat(
            match_id=match_id,
            steamid="76561198000000010",
            name="Alice",
            team="A",
            kills=20,
            deaths=14,
            assists=5,
            adr=88.5,
            hs_pct=50.0,
            kast_pct=75.0,
            first_kills=2,
            first_deaths=1,
            trade_kills=3,
            traded_deaths=2,
            k3=1,
            k4=0,
            k5=0,
            clutches_played=1,
            clutches_won=1,
            utility_damage=120,
            enemies_flashed=5,
            flash_assists=2,
            team_flashes=0,
            shots_fired=350,
            ttd_ms_median=320.0,
            ttd_samples=10,
            counter_strafe_pct=85.0,
            counter_strafe_samples=30,
        )
        # Bob played on Team B (Lost 11-13)
        stat_b = PlayerMatchStat(
            match_id=match_id,
            steamid="76561198000000020",
            name="Bob",
            team="B",
            kills=18,
            deaths=16,
            assists=3,
            adr=82.0,
            hs_pct=45.0,
            kast_pct=68.0,
            first_kills=1,
            first_deaths=2,
            trade_kills=2,
            traded_deaths=1,
            k3=0,
            k4=0,
            k5=0,
            clutches_played=0,
            clutches_won=0,
            utility_damage=60,
            enemies_flashed=2,
            flash_assists=1,
            team_flashes=0,
            shots_fired=290,
            ttd_ms_median=350.0,
            ttd_samples=8,
            counter_strafe_pct=80.0,
            counter_strafe_samples=25,
        )
        db.add_all([m, stat_a, stat_b])
        db.commit()

    # --- Test 1: User A (Owner) can see Match 1 in match list and detail
    list_a = await client.get("/api/matches", cookies=cookie_a)
    assert list_a.status_code == 200
    matches_a = list_a.json()
    m_a_entry = next((x for x in matches_a if x["id"] == match_id), None)
    assert m_a_entry is not None
    assert m_a_entry["is_owner"] is True
    assert m_a_entry["result"] == "W"  # Alice won on Team A

    detail_a = await client.get(f"/api/matches/{match_id}", cookies=cookie_a)
    assert detail_a.status_code == 200
    assert detail_a.json()["match"]["is_owner"] is True

    # --- Test 2: User B (Teammate / Participant) automatically sees Match 1 with their own perspective
    list_b = await client.get("/api/matches", cookies=cookie_b)
    assert list_b.status_code == 200
    matches_b = list_b.json()
    m_b_entry = next((x for x in matches_b if x["id"] == match_id), None)
    assert m_b_entry is not None
    assert m_b_entry["is_owner"] is False
    assert m_b_entry["my_steamid"] == "76561198000000020"
    assert m_b_entry["result"] == "L"  # Bob lost on Team B

    detail_b = await client.get(f"/api/matches/{match_id}", cookies=cookie_b)
    assert detail_b.status_code == 200

    # User B cannot toggle visibility or delete
    patch_b = await client.patch(
        f"/api/matches/{match_id}/visibility",
        json={"is_public": True},
        cookies=cookie_b,
    )
    assert patch_b.status_code == 403

    del_b = await client.delete(f"/api/matches/{match_id}", cookies=cookie_b)
    assert del_b.status_code == 403

    # --- Test 3: User C (Stranger) CANNOT see Match 1 (private)
    list_c = await client.get("/api/matches", cookies=cookie_c)
    assert list_c.status_code == 200
    assert not any(x["id"] == match_id for x in list_c.json())

    # Direct detail access by Stranger returns 404 (does not leak existence)
    detail_c = await client.get(f"/api/matches/{match_id}", cookies=cookie_c)
    assert detail_c.status_code == 404

    # Anonymous viewer returns 404
    anon_detail = await client.get(f"/api/matches/{match_id}")
    assert anon_detail.status_code == 404

    # --- Test 4: User A toggles Match 1 to is_public=True
    toggle_resp = await client.patch(
        f"/api/matches/{match_id}/visibility",
        json={"is_public": True},
        cookies=cookie_a,
    )
    assert toggle_resp.status_code == 200
    assert toggle_resp.json()["is_public"] is True

    # Now Stranger C AND Anonymous viewers CAN view Match 1
    detail_c_pub = await client.get(f"/api/matches/{match_id}", cookies=cookie_c)
    assert detail_c_pub.status_code == 200

    anon_detail_pub = await client.get(f"/api/matches/{match_id}")
    assert anon_detail_pub.status_code == 200

    # --- Test 5: User A deletes Match 1
    del_a = await client.delete(f"/api/matches/{match_id}", cookies=cookie_a)
    assert del_a.status_code == 204

    # Now match is completely gone
    assert (await client.get(f"/api/matches/{match_id}")).status_code == 404
