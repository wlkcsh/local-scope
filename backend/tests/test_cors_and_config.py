"""
Tests for CORS configuration parsing and FastAPI CORS preflight behavior
for Hybrid Vercel Frontend + AWS Backend deployments.
"""

from fastapi.testclient import TestClient
from app.config import Settings, settings
from app.main import create_app


def test_settings_parses_comma_separated_cors_origins(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://my-app.vercel.app, http://localhost:3000 ")
    s = Settings(_env_file=None)
    assert s.cors_origins == ["https://my-app.vercel.app", "http://localhost:3000"]


def test_settings_parses_json_array_cors_origins(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", '["https://my-app.vercel.app", "http://localhost:3000"]')
    s = Settings(_env_file=None)
    assert s.cors_origins == ["https://my-app.vercel.app", "http://localhost:3000"]


def test_cors_preflight_allows_explicit_and_preview_regex_and_blocks_untrusted(monkeypatch):
    monkeypatch.setattr(settings, "cors_origins", ["https://local-scope.vercel.app"])
    monkeypatch.setattr(
        settings,
        "cors_origin_regex",
        r"^https://local-scope-[a-z0-9-]+\.vercel\.app$",
    )
    app = create_app()
    client = TestClient(app)

    # 1. Explicit production Vercel origin allowed
    resp_prod = client.options(
        "/api/ingest/upload",
        headers={
            "Origin": "https://local-scope.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert resp_prod.status_code == 200
    assert resp_prod.headers.get("access-control-allow-origin") == "https://local-scope.vercel.app"

    # 2. Preview Vercel origin matching regex allowed
    resp_preview = client.options(
        "/api/ingest/upload",
        headers={
            "Origin": "https://local-scope-git-feat-abc123.vercel.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert resp_preview.status_code == 200
    assert (
        resp_preview.headers.get("access-control-allow-origin")
        == "https://local-scope-git-feat-abc123.vercel.app"
    )

    # 3. Untrusted origin rejected
    resp_evil = client.options(
        "/api/ingest/upload",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in resp_evil.headers


def test_cors_blocks_wildcard_regex(monkeypatch):
    monkeypatch.setattr(settings, "cors_origins", ["*"])
    monkeypatch.setattr(settings, "cors_origin_regex", ".*")
    app = create_app()
    client = TestClient(app)

    resp = client.options(
        "/api/ingest/upload",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in resp.headers
