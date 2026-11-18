"""
Job Status API Endpoint per SPEC §4 and Phase 2.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import IngestJob
from app.api.deps import verify_token

router = APIRouter(prefix="/api/jobs", tags=["jobs"], dependencies=[Depends(verify_token)])


class JobStatusResponse(BaseModel):
    id: str
    status: str
    match_id: Optional[str] = None
    error: Optional[str] = None


@router.get("/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str, db: Session = Depends(get_db)) -> JobStatusResponse:
    """Retrieve processing status of an ingest job."""
    job = db.get(IngestJob, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Job {job_id} not found"
        )
    return JobStatusResponse(
        id=job.id,
        status=job.status,
        match_id=job.match_id,
        error=job.error,
    )
