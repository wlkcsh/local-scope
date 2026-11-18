"""
Matches and Replay API Endpoints per SPEC §4, Phase 2, and Multi-User Privacy.
Provides match listings, detailed scoreboard, highlights, mistakes, visibility toggling,
deletion, and raw replay streaming with owner + participant SteamID64 access control.
"""

from typing import List, Optional, Dict, Any, Tuple
import gzip
import json
import logging
import secrets
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status, Path as PathParam
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import desc, or_, select

from app.config import settings
from app.db import get_db
from app.models import Match, PlayerMatchStat, Highlight, Mistake, User
from app.api.deps import get_optional_user, require_user, verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/matches", tags=["matches"])

MATCH_ID_REGEX = r"^[a-zA-Z0-9_\-]+$"


class MatchDetailResponse(BaseModel):
    match: Dict[str, Any]
    player_stats: List[Dict[str, Any]]
    highlights: List[Dict[str, Any]]
    mistakes: List[Dict[str, Any]]
    rounds: List[Dict[str, Any]] = []


class MatchVisibilityRequest(BaseModel):
    is_public: bool


class MatchVisibilityResponse(BaseModel):
    id: str
    is_public: bool


def _has_valid_service_token(authorization: Optional[str]) -> bool:
    """Checks whether the request carries the static server-side API_TOKEN."""
    if not authorization or not settings.api_token or not settings.api_token.strip():
        return False
    parts = authorization.split()
    return (
        len(parts) == 2
        and parts[0].lower() == "bearer"
        and secrets.compare_digest(parts[1].strip(), settings.api_token.strip())
    )


def _is_match_owner(m: Match, user: Optional[User]) -> bool:
    if not user:
        return False
    if m.owner_user_id == user.id:
        return True
    if user.is_admin and m.owner_user_id is None:
        return True
    return False


def _can_view_match(
    m: Match,
    user: Optional[User],
    has_service_token: bool,
    db: Session,
) -> bool:
    if m.is_public or has_service_token:
        return True
    if not user:
        return False
    if _is_match_owner(m, user):
        return True
    if user.steamid:
        participant_exists = db.scalar(
            select(PlayerMatchStat.steamid)
            .where(
                PlayerMatchStat.match_id == m.id,
                PlayerMatchStat.steamid == user.steamid,
            )
            .limit(1)
        )
        if participant_exists:
            return True
    return False


def _resolve_user_perspective(
    m: Match, user: Optional[User], stats_list: List[PlayerMatchStat]
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Computes (my_steamid, my_team, result) from the viewing user's SteamID64 if they played
    in this match; otherwise falls back to stored match defaults.
    """
    if user and user.steamid:
        for s in stats_list:
            if s.steamid == user.steamid:
                team = s.team
                if team == "A":
                    res = "W" if m.score_a > m.score_b else ("L" if m.score_a < m.score_b else "D")
                else:
                    res = "W" if m.score_b > m.score_a else ("L" if m.score_b < m.score_a else "D")
                return (user.steamid, team, res)
    return (m.my_steamid, m.my_team, m.result)


@router.get("", response_model=List[Dict[str, Any]])
def list_matches(
    user: Optional[User] = Depends(verify_token),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> List[Dict[str, Any]]:
    """
    List match summaries visible to the authenticated user:
    owned matches + matches where the user's linked SteamID64 participated.
    """
    stmt = (
        select(Match)
        .options(selectinload(Match.player_stats))
        .order_by(desc(Match.played_at), desc(Match.created_at))
    )

    if user is not None:
        conditions = [Match.owner_user_id == user.id]
        if user.steamid:
            conditions.append(
                Match.id.in_(
                    select(PlayerMatchStat.match_id).where(PlayerMatchStat.steamid == user.steamid)
                )
            )
        if user.is_admin:
            conditions.append(Match.owner_user_id.is_(None))
        stmt = stmt.where(or_(*conditions))

    stmt = stmt.offset(offset).limit(limit)
    matches = db.scalars(stmt).all()

    results = []
    for m in matches:
        my_sid, my_team, result = _resolve_user_perspective(m, user, m.player_stats)
        results.append({
            "id": m.id,
            "source": m.source,
            "faceit_url": m.faceit_url,
            "demo_url": m.demo_url,
            "map": m.map,
            "played_at": m.played_at.isoformat() if m.played_at else None,
            "duration_s": m.duration_s,
            "tick_rate": m.tick_rate,
            "rounds_total": m.rounds_total,
            "team_a_name": m.team_a_name,
            "team_b_name": m.team_b_name,
            "score_a": m.score_a,
            "score_b": m.score_b,
            "team_a_first_side": m.team_a_first_side,
            "my_steamid": my_sid,
            "my_team": my_team,
            "result": result,
            "replay_bytes": m.replay_bytes,
            "is_public": bool(m.is_public),
            "is_owner": _is_match_owner(m, user),
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return results


@router.get("/{match_id}", response_model=MatchDetailResponse)
def get_match_detail(
    match_id: str,
    user: Optional[User] = Depends(get_optional_user),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> MatchDetailResponse:
    """Retrieve full match metadata, player statistics, highlights, and mistakes."""
    stmt = (
        select(Match)
        .options(
            selectinload(Match.player_stats),
            selectinload(Match.highlights),
            selectinload(Match.mistakes),
        )
        .where(Match.id == match_id)
    )
    m = db.scalars(stmt).first()
    if not m or not _can_view_match(m, user, _has_valid_service_token(authorization), db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )

    stats = [
        {
            "match_id": s.match_id,
            "steamid": s.steamid,
            "name": s.name,
            "team": s.team,
            "kills": s.kills,
            "deaths": s.deaths,
            "assists": s.assists,
            "adr": s.adr,
            "hs_pct": s.hs_pct,
            "kast_pct": s.kast_pct,
            "first_kills": s.first_kills,
            "first_deaths": s.first_deaths,
            "trade_kills": s.trade_kills,
            "traded_deaths": s.traded_deaths,
            "k3": s.k3,
            "k4": s.k4,
            "k5": s.k5,
            "clutches_played": s.clutches_played,
            "clutches_won": s.clutches_won,
            "utility_damage": s.utility_damage,
            "enemies_flashed": s.enemies_flashed,
            "flash_assists": s.flash_assists,
            "team_flashes": s.team_flashes,
            "shots_fired": s.shots_fired,
            "ttd_ms_median": s.ttd_ms_median,
            "ttd_samples": s.ttd_samples,
            "counter_strafe_pct": s.counter_strafe_pct,
            "counter_strafe_samples": s.counter_strafe_samples,
            "first_bullet_acc_pct": s.first_bullet_acc_pct,
            "first_bullet_acc_samples": s.first_bullet_acc_samples,
        }
        for s in m.player_stats
    ]

    hls = [
        {
            "id": h.id,
            "match_id": h.match_id,
            "steamid": h.steamid,
            "round": h.round,
            "type": h.type,
            "start_tick": h.start_tick,
            "end_tick": h.end_tick,
            "kill_ticks": h.kill_ticks,
            "weapon": h.weapon,
            "score": h.score,
            "meta": h.meta,
        }
        for h in m.highlights
    ]

    mis = [
        {
            "id": mi.id,
            "match_id": mi.match_id,
            "steamid": mi.steamid,
            "round": mi.round,
            "type": mi.type,
            "tick": mi.tick,
            "x": mi.x,
            "y": mi.y,
            "z": mi.z,
            "layer": mi.layer,
            "severity": mi.severity,
            "meta": mi.meta,
        }
        for mi in m.mistakes
    ]

    my_sid, my_team, result = _resolve_user_perspective(m, user, m.player_stats)

    match_dict = {
        "id": m.id,
        "source": m.source,
        "faceit_url": m.faceit_url,
        "demo_url": m.demo_url,
        "map": m.map,
        "played_at": m.played_at.isoformat() if m.played_at else None,
        "duration_s": m.duration_s,
        "tick_rate": m.tick_rate,
        "rounds_total": m.rounds_total,
        "team_a_name": m.team_a_name,
        "team_b_name": m.team_b_name,
        "score_a": m.score_a,
        "score_b": m.score_b,
        "team_a_first_side": m.team_a_first_side,
        "my_steamid": my_sid,
        "my_team": my_team,
        "result": result,
        "replay_path": m.replay_path,
        "replay_bytes": m.replay_bytes,
        "is_public": bool(m.is_public),
        "is_owner": _is_match_owner(m, user),
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }

    # Extract lightweight round summary for chronological UI telemetry
    rounds_summary = []
    replay_path = (settings.resolved_replays_dir / f"{match_id}.json.gz").resolve()
    if not replay_path.exists():
        alt_path = (settings.resolved_data_dir.parent / m.replay_path).resolve()
        if alt_path.is_relative_to(settings.resolved_data_dir.parent.resolve()):
            replay_path = alt_path

    if replay_path.exists():
        try:
            with gzip.open(replay_path, "rt", encoding="utf-8") as f:
                rep_data = json.load(f)
            for r in rep_data.get("rounds", []):
                side_a = r.get("side_a", "CT")
                winner_side = r.get("winner", "CT")
                winner_team = "A" if winner_side == side_a else "B"
                rounds_summary.append({
                    "round_num": r.get("n", 1),
                    "winner_team": winner_team,
                    "winner_side": winner_side,
                    "reason": r.get("reason", "normal"),
                    "score_a": r.get("score", [0, 0])[0],
                    "score_b": r.get("score", [0, 0])[1],
                })
        except Exception as e:
            logger.warning(f"Failed to extract round summaries for {match_id}: {e}")

    return MatchDetailResponse(
        match=match_dict,
        player_stats=stats,
        highlights=hls,
        mistakes=mis,
        rounds=rounds_summary,
    )


@router.patch("/{match_id}/visibility", response_model=MatchVisibilityResponse)
def update_match_visibility(
    req: MatchVisibilityRequest,
    match_id: str = PathParam(..., pattern=MATCH_ID_REGEX),
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
) -> MatchVisibilityResponse:
    """Allows the match owner to toggle whether a match is shareable via public link."""
    m = db.get(Match, match_id)
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )
    if not _is_match_owner(m, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the match owner can change sharing settings",
        )

    m.is_public = req.is_public
    db.add(m)
    db.commit()
    db.refresh(m)
    return MatchVisibilityResponse(id=m.id, is_public=bool(m.is_public))


@router.delete("/{match_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_match(
    match_id: str = PathParam(..., pattern=MATCH_ID_REGEX),
    user: Optional[User] = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Deletes match from database (cascading to stats, highlights, mistakes) and unlinks replay file."""
    m = db.get(Match, match_id)
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )

    if user is not None and not _is_match_owner(m, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the match owner can delete this match",
        )

    target_replay = (settings.resolved_replays_dir / f"{match_id}.json.gz").resolve()
    if not target_replay.is_relative_to(settings.resolved_replays_dir.resolve()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid match ID path")

    db.delete(m)
    db.commit()

    # Unlink replay file on disk after DB commit succeeds
    target_replay.unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{match_id}/highlights", response_model=List[Dict[str, Any]])
def get_match_highlights(
    match_id: str,
    steamid: Optional[str] = Query(None),
    user: Optional[User] = Depends(get_optional_user),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Retrieve highlights for a match, optionally filtered by player steamid."""
    m = db.get(Match, match_id)
    if not m or not _can_view_match(m, user, _has_valid_service_token(authorization), db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )

    stmt = select(Highlight).where(Highlight.match_id == match_id)
    if steamid:
        stmt = stmt.where(Highlight.steamid == steamid)
    stmt = stmt.order_by(desc(Highlight.score))
    hls = db.scalars(stmt).all()
    return [
        {
            "id": h.id,
            "match_id": h.match_id,
            "steamid": h.steamid,
            "round": h.round,
            "type": h.type,
            "start_tick": h.start_tick,
            "end_tick": h.end_tick,
            "kill_ticks": h.kill_ticks,
            "weapon": h.weapon,
            "score": h.score,
            "meta": h.meta,
        }
        for h in hls
    ]


@router.get("/{match_id}/mistakes", response_model=List[Dict[str, Any]])
def get_match_mistakes(
    match_id: str,
    steamid: Optional[str] = Query(None),
    user: Optional[User] = Depends(get_optional_user),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Retrieve mistake cards for a match, optionally filtered by player steamid."""
    m = db.get(Match, match_id)
    if not m or not _can_view_match(m, user, _has_valid_service_token(authorization), db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )

    stmt = select(Mistake).where(Mistake.match_id == match_id)
    if steamid:
        stmt = stmt.where(Mistake.steamid == steamid)
    stmt = stmt.order_by(desc(Mistake.severity), Mistake.round)
    mis = db.scalars(stmt).all()
    return [
        {
            "id": mi.id,
            "match_id": mi.match_id,
            "steamid": mi.steamid,
            "round": mi.round,
            "type": mi.type,
            "tick": mi.tick,
            "x": mi.x,
            "y": mi.y,
            "z": mi.z,
            "layer": mi.layer,
            "severity": mi.severity,
            "meta": mi.meta,
        }
        for mi in mis
    ]


@router.get("/{match_id}/replay")
def get_match_replay(
    match_id: str = PathParam(..., pattern=MATCH_ID_REGEX),
    user: Optional[User] = Depends(get_optional_user),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Streams raw .json.gz bytes per SPEC §4 with headers:
    Content-Type: application/json
    Content-Encoding: gzip
    """
    m = db.get(Match, match_id)
    if not m or not _can_view_match(m, user, _has_valid_service_token(authorization), db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )

    replay_path = (settings.resolved_replays_dir / f"{match_id}.json.gz").resolve()
    if not replay_path.is_relative_to(settings.resolved_replays_dir.resolve()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid match ID path")

    if not replay_path.exists():
        # Fallback to relative path from root
        alt_path = (settings.resolved_data_dir.parent / m.replay_path).resolve()
        if alt_path.is_relative_to(settings.resolved_data_dir.parent.resolve()):
            replay_path = alt_path

    if not replay_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Replay file for {match_id} not found on disk",
        )

    with open(replay_path, "rb") as f:
        gz_bytes = f.read()

    return Response(
        content=gz_bytes,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "Content-Disposition": f'inline; filename="{match_id}.json"',
        },
    )
