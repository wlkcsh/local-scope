"""
FACEIT API Client & Match Resolver per SPEC §4 and Phase 2.
Extracts match ID, queries FACEIT Data API, and retrieves signed download URLs via Downloads API.
Never logs or echoes secret keys.
"""

import re
import socket
import hashlib
import ipaddress
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Dict, List, Literal
from urllib.parse import urlparse
import httpx

from app.config import settings

logger = logging.getLogger("ingest.faceit")

FACEIT_MATCH_ID_REGEX = re.compile(
    r"1-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}", re.IGNORECASE
)


def validate_public_url(url_str: str) -> None:
    """
    Validates that a URL resolves exclusively to public, non-reserved IP addresses.
    Raises ValueError if the URL points to private, loopback, or cloud metadata addresses (anti-SSRF).
    """
    parsed = urlparse(url_str)
    if parsed.scheme.lower() not in ("http", "https"):
        raise ValueError("Invalid URL scheme: only HTTP and HTTPS are permitted")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise ValueError("Invalid URL: missing hostname")

    # Reject common localhost and link-local names
    if hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0", "169.254.169.254"):
        raise ValueError(f"Access to {hostname} is blocked for security")

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise ValueError(f"Could not resolve host: {hostname}")

    for addr in addr_infos:
        ip_str = addr[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                raise ValueError(f"Access to private/internal IP ({ip_str}) is blocked")
        except ValueError as err:
            if "is blocked" in str(err):
                raise
            pass


@dataclass
class IngestTarget:
    match_id: str
    source: Literal["faceit", "upload"]
    faceit_url: Optional[str]
    demo_url: Optional[str]
    signed_url: Optional[str]
    team_a_name: Optional[str]
    team_b_name: Optional[str]
    played_at: Optional[datetime]
    faction_rosters: Optional[Dict[str, List[str]]]


def extract_faceit_match_id(source: str) -> Optional[str]:
    """Extracts FACEIT match UUID from room URL or raw ID."""
    match = FACEIT_MATCH_ID_REGEX.search(source)
    if match:
        return match.group(0)
    return None


async def sign_demo_url(demo_resource_url: str, client: httpx.AsyncClient) -> str:
    """
    Calls FACEIT Downloads API to obtain temporary signed download URL.
    Per SPEC §4: Raises RuntimeError("download scope missing — use /api/ingest/upload") on 401/403.
    """
    auth_key = settings.faceit_download_key or settings.faceit_api_key
    if not auth_key:
        raise RuntimeError("download scope missing — use /api/ingest/upload")

    api_url = "https://open.faceit.com/download/v2/demos/download"
    headers = {
        "Authorization": f"Bearer {auth_key}",
        "Content-Type": "application/json",
    }
    payload = {"resource_url": demo_resource_url}

    resp = await client.post(api_url, headers=headers, json=payload, timeout=15.0)
    if resp.status_code in (401, 403):
        raise RuntimeError("download scope missing — use /api/ingest/upload")
    resp.raise_for_status()

    data = resp.json()
    download_url = data.get("payload", {}).get("download_url")
    if not download_url:
        raise RuntimeError("FACEIT Downloads API did not return payload.download_url")

    return download_url


async def resolve_source(source: str, client: httpx.AsyncClient) -> IngestTarget:
    """
    Resolves input source string to an IngestTarget per Phase 2 specifications.
    """
    clean_src = source.strip()
    match_id = extract_faceit_match_id(clean_src)

    # 1. Direct FACEIT CDN URL (e.g., https://...faceit-cdn.net/.../<match_id>.dem.gz)
    parsed_url = urlparse(clean_src)
    hostname = (parsed_url.hostname or "").lower()
    if hostname == "faceit-cdn.net" or hostname.endswith(".faceit-cdn.net"):
        fname = parsed_url.path.split("/")[-1]
        extracted_id = extract_faceit_match_id(fname) or f"faceit-{fname.split('.')[0]}"
        signed_url = await sign_demo_url(clean_src, client)
        return IngestTarget(
            match_id=extracted_id,
            source="faceit",
            faceit_url=None,
            demo_url=clean_src,
            signed_url=signed_url,
            team_a_name=None,
            team_b_name=None,
            played_at=None,
            faction_rosters=None,
        )

    # 2. FACEIT Match ID or Room URL
    if match_id:
        room_url = f"https://www.faceit.com/en/cs2/room/{match_id}"
        if not settings.faceit_api_key:
            raise ValueError("FACEIT_API_KEY not configured")

        headers = {"Authorization": f"Bearer {settings.faceit_api_key}"}
        url = f"https://open.faceit.com/data/v4/matches/{match_id}"

        resp = await client.get(url, headers=headers, timeout=15.0)
        if resp.status_code == 404:
            raise ValueError(f"FACEIT match {match_id} not found")
        resp.raise_for_status()
        data = resp.json()

        demo_urls = data.get("demo_url", [])
        if not demo_urls:
            raise ValueError(f"Demo file not yet available for FACEIT match {match_id}")
        unsigned_demo_url = demo_urls[0]

        # Extract teams and rosters
        teams_data = data.get("teams", {})
        faction1 = teams_data.get("faction1", {})
        faction2 = teams_data.get("faction2", {})
        team_a_name = faction1.get("name", "Team A")
        team_b_name = faction2.get("name", "Team B")

        rosters = {
            "faction1": [str(p.get("game_player_id", "")) for p in faction1.get("roster", []) if p.get("game_player_id")],
            "faction2": [str(p.get("game_player_id", "")) for p in faction2.get("roster", []) if p.get("game_player_id")],
        }

        # Parse started_at
        played_at = None
        started_at = data.get("started_at")
        if started_at:
            try:
                played_at = datetime.fromtimestamp(started_at, tz=timezone.utc)
            except Exception:
                pass

        # Sign download URL
        signed_url = await sign_demo_url(unsigned_demo_url, client)

        return IngestTarget(
            match_id=match_id,
            source="faceit",
            faceit_url=room_url,
            demo_url=unsigned_demo_url,
            signed_url=signed_url,
            team_a_name=team_a_name,
            team_b_name=team_b_name,
            played_at=played_at,
            faction_rosters=rosters,
        )

    # 3. Direct HTTP(S) URL (fallback with anti-SSRF validation)
    if clean_src.startswith("http://") or clean_src.startswith("https://"):
        validate_public_url(clean_src)
        segments = [p for p in parsed_url.path.split("/") if p]
        fname = segments[-1] if segments else ""
        if fname:
            base_id = fname.split(".")[0][:16]
            gen_id = f"up-{base_id}"
        else:
            url_hash = hashlib.sha256(clean_src.encode("utf-8")).hexdigest()[:16]
            gen_id = f"up-{url_hash}"

        return IngestTarget(
            match_id=gen_id,
            source="upload",
            faceit_url=None,
            demo_url=clean_src,
            signed_url=clean_src,
            team_a_name="Team A",
            team_b_name="Team B",
            played_at=None,
            faction_rosters=None,
        )

    raise ValueError(f"Could not resolve input source: {source}")
