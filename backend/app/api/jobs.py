"""
Job Status API Endpoint per SPEC §4, Phase 2, and Multi-User Isolation.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import IngestJob, User
from app.api.deps import verify_token

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobStatusResponse(BaseModel):
    id: str
    status: str
    match_id: Optional[str] = None
    error: Optional[str] = None


@router.get("/{job_id}", response_model=JobStatusResponse)
def get_job_status(
    job_id: str,
    user: Optional[User] = Depends(verify_token),
    db: Session = Depends(get_db),
) -> JobStatusResponse:
    """Retrieve processing status of an ingest job."""
    job = db.get(IngestJob, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found"
        )

    # Restrict visibility if job is owned by another user (unless admin or static service token)
    if job.owner_user_id and user is not None:
        if job.owner_user_id != user.id and not user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found"
            )

    return JobStatusResponse(
        id=job.id,
        status=job.status,
        match_id=job.match_id,
        error=job.error,
    )
