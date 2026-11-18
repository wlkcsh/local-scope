"""
Ingest API Endpoints per SPEC §4 and Phase 2.
Handles URL ingestion and multipart file uploads with streaming decompression.
"""

import uuid
import zlib
import hashlib
import asyncio
from pathlib import Path
from typing import Set, Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import zstandard as zstd

from app.config import settings
from app.db import get_db
from app.models import IngestJob, User
from app.api.deps import verify_token
from app.ingest.pipeline import execute_ingest_job
from app.ingest.download import ZSTD_MAGIC, GZIP_MAGIC, RAW_DEMO_MAGIC

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

# Strong references set to prevent in-flight asyncio tasks from being garbage collected
_active_background_tasks: Set[asyncio.Task] = set()


class IngestRequest(BaseModel):
    source: str = Field(description="FACEIT room URL, match UUID, or demo URL")


class IngestResponse(BaseModel):
    job_id: str


def process_upload_sync(file_obj, target_path: Path, max_bytes: int) -> str:
    """
    Synchronous worker executed in a worker thread via asyncio.to_thread.
    Streams from file_obj, inspects magic bytes, decompresses on the fly,
    writes to target_path, and returns the computed upload match ID (sha1 hash).
    """
    first_chunk = file_obj.read(1024 * 1024)
    if not first_chunk:
        raise ValueError("Uploaded file is empty")

    mode = "raw"
    decompressor = None
    if first_chunk.startswith(ZSTD_MAGIC):
        mode = "zstd"
        decompressor = zstd.ZstdDecompressor().decompressobj()
    elif first_chunk.startswith(GZIP_MAGIC):
        mode = "gzip"
        decompressor = zlib.decompressobj(31)
    elif first_chunk.startswith(RAW_DEMO_MAGIC):
        mode = "raw"
    else:
        raise ValueError("Unsupported demo stream magic bytes (expected CS2 PBDE, Gzip, or Zstandard)")

    total_written = 0
    hasher = hashlib.sha1()

    try:
        with open(target_path, "wb") as f_out:
            if mode in ("zstd", "gzip"):
                unpacked = decompressor.decompress(first_chunk)
            else:
                unpacked = first_chunk

            if unpacked:
                total_written += len(unpacked)
                if total_written > max_bytes:
                    raise ValueError("Decompressed demo exceeds max_dem_bytes")
                f_out.write(unpacked)
                hasher.update(unpacked)

            while True:
                chunk = file_obj.read(1024 * 1024)
                if not chunk:
                    break

                if mode in ("zstd", "gzip"):
                    unpacked = decompressor.decompress(chunk)
                else:
                    unpacked = chunk

                if unpacked:
                    total_written += len(unpacked)
                    if total_written > max_bytes:
                        raise ValueError("Decompressed demo exceeds max_dem_bytes")
                    f_out.write(unpacked)
                    hasher.update(unpacked)

            if mode == "gzip" and decompressor:
                tail = decompressor.flush()
                if tail:
                    total_written += len(tail)
                    if total_written > max_bytes:
                        raise ValueError("Decompressed demo exceeds max_dem_bytes")
                    f_out.write(tail)
                    hasher.update(tail)

    except Exception:
        target_path.unlink(missing_ok=True)
        raise

    return f"up-{hasher.hexdigest()[:16]}"


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=IngestResponse)
async def ingest_source(
    payload: IngestRequest,
    user: Optional[User] = Depends(verify_token),
    db: Session = Depends(get_db),
) -> IngestResponse:
    """Queue ingestion for a FACEIT room URL, match id, or demo URL."""
    job_id = str(uuid.uuid4())
    owner_user_id = user.id if user else None
    job = IngestJob(id=job_id, status="queued", owner_user_id=owner_user_id)
    db.add(job)
    db.commit()

    task = asyncio.create_task(
        execute_ingest_job(
            job_id=job_id,
            source_str=payload.source,
            owner_user_id=owner_user_id,
        )
    )
    _active_background_tasks.add(task)
    task.add_done_callback(_active_background_tasks.discard)

    return IngestResponse(job_id=job_id)


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED, response_model=IngestResponse)
async def upload_demo(
    file: UploadFile = File(...),
    user: Optional[User] = Depends(verify_token),
    db: Session = Depends(get_db),
) -> IngestResponse:
    """Multipart upload for .dem, .dem.gz, or .dem.zst files with on-the-fly decompression."""
    job_id = str(uuid.uuid4())
    owner_user_id = user.id if user else None
    tmp_dir = settings.resolved_tmp_dir
    tmp_dir.mkdir(parents=True, exist_ok=True)
    target_path = tmp_dir / f"{job_id}.dem"

    try:
        upload_match_id = await asyncio.to_thread(
            process_upload_sync,
            file.file,
            target_path,
            settings.max_dem_bytes,
        )
    except ValueError as val_err:
        target_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        target_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Upload processing failed: {exc}",
        )

    # Record job in database
    job = IngestJob(id=job_id, status="queued", owner_user_id=owner_user_id)
    db.add(job)
    db.commit()

    task = asyncio.create_task(
        execute_ingest_job(
            job_id=job_id,
            upload_dem_path=target_path,
            original_filename=file.filename,
            upload_match_id=upload_match_id,
            owner_user_id=owner_user_id,
        )
    )
    _active_background_tasks.add(task)
    task.add_done_callback(_active_background_tasks.discard)

    return IngestResponse(job_id=job_id)
