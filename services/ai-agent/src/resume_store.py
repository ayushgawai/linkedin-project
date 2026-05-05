"""Resume persistence — S3 (primary) + MongoDB metadata.

Upload flow:
    1. Store raw bytes in S3 under resumes/<member_id>/<resume_id>.<ext>
    2. Write metadata + extracted text to MongoDB resumes collection.
    3. Return a presigned download URL (valid 7 days) so the frontend
       can show a download link immediately.

When S3 is not configured (local dev), raw bytes are stored as base64
in MongoDB only and the returned URL is None.
"""
from __future__ import annotations

import base64
import uuid
from datetime import datetime
from typing import Any

from loguru import logger

from .config import get_settings
from .db import get_resumes


def store_resume(
    member_id: str,
    filename: str,
    raw_bytes: bytes,
    extracted_text: str,
    application_id: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Persist a resume and return metadata including a download URL.

    Returns a dict with:
        resume_id, member_id, filename, s3_key, download_url, created_at
    """
    settings = get_settings()
    resume_id = str(uuid.uuid4())
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "pdf"
    s3_key: str | None = None
    download_url: str | None = None

    # --- S3 upload ---
    if settings.resume_s3_bucket:
        try:
            import boto3
            s3 = boto3.client("s3", region_name=settings.aws_region)
            s3_key = f"{settings.resume_s3_prefix}/{member_id}/{resume_id}.{ext}"
            content_types = {"pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "txt": "text/plain"}
            s3.put_object(
                Bucket=settings.resume_s3_bucket,
                Key=s3_key,
                Body=raw_bytes,
                ContentType=content_types.get(ext, "application/octet-stream"),
                ContentDisposition=f'attachment; filename="{filename}"',
            )
            download_url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.resume_s3_bucket, "Key": s3_key},
                ExpiresIn=7 * 24 * 3600,  # 7 days
            )
            logger.info("Resume uploaded to S3 key={} member={}", s3_key, member_id)
        except Exception as exc:
            logger.warning("S3 resume upload failed, falling back to Mongo-only: {}", exc)
            s3_key = None
            download_url = None

    # --- MongoDB metadata ---
    doc: dict[str, Any] = {
        "resume_id": resume_id,
        "member_id": member_id,
        "application_id": application_id,
        "job_id": job_id,
        "filename": filename,
        "s3_key": s3_key,
        "download_url": download_url,
        "extracted_text": extracted_text,
        "created_at": datetime.utcnow(),
    }
    if not s3_key:
        # Store raw bytes in Mongo when S3 is unavailable (dev/local)
        doc["raw_bytes_b64"] = base64.b64encode(raw_bytes).decode()

    try:
        get_resumes().insert_one(doc)
        logger.info("Resume metadata saved to Mongo resume_id={} member={}", resume_id, member_id)
    except Exception as exc:
        logger.error("Mongo resume insert failed: {}", exc)

    return {
        "resume_id": resume_id,
        "member_id": member_id,
        "filename": filename,
        "s3_key": s3_key,
        "download_url": download_url,
        "created_at": doc["created_at"].isoformat(),
    }


def get_resume_metadata(resume_id: str) -> dict[str, Any] | None:
    """Fetch resume metadata from MongoDB by resume_id."""
    try:
        doc = get_resumes().find_one({"resume_id": resume_id}, {"raw_bytes_b64": 0, "_id": 0})
        if doc:
            if isinstance(doc.get("created_at"), datetime):
                doc["created_at"] = doc["created_at"].isoformat()
            return doc
    except Exception as exc:
        logger.error("get_resume_metadata failed resume_id={}: {}", resume_id, exc)
    return None


def list_resumes_for_member(member_id: str) -> list[dict[str, Any]]:
    """List all resumes uploaded by a member, newest first."""
    try:
        cursor = get_resumes().find(
            {"member_id": member_id},
            {"raw_bytes_b64": 0, "extracted_text": 0, "_id": 0},
        ).sort("created_at", -1).limit(20)
        results = []
        for doc in cursor:
            if isinstance(doc.get("created_at"), datetime):
                doc["created_at"] = doc["created_at"].isoformat()
            # Refresh presigned URL if S3 key exists
            settings = get_settings()
            if doc.get("s3_key") and settings.resume_s3_bucket:
                try:
                    import boto3
                    s3 = boto3.client("s3", region_name=settings.aws_region)
                    doc["download_url"] = s3.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": settings.resume_s3_bucket, "Key": doc["s3_key"]},
                        ExpiresIn=7 * 24 * 3600,
                    )
                except Exception:
                    pass
            results.append(doc)
        return results
    except Exception as exc:
        logger.error("list_resumes_for_member failed member_id={}: {}", member_id, exc)
        return []


def get_download_url(resume_id: str) -> str | None:
    """Return a fresh presigned download URL for a resume."""
    settings = get_settings()
    try:
        doc = get_resumes().find_one({"resume_id": resume_id}, {"s3_key": 1, "raw_bytes_b64": 1, "filename": 1})
        if not doc:
            return None
        if doc.get("s3_key") and settings.resume_s3_bucket:
            import boto3
            s3 = boto3.client("s3", region_name=settings.aws_region)
            return s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.resume_s3_bucket, "Key": doc["s3_key"]},
                ExpiresIn=7 * 24 * 3600,
            )
        # Mongo-only fallback: return data URI
        if doc.get("raw_bytes_b64"):
            return f"data:application/octet-stream;base64,{doc['raw_bytes_b64']}"
    except Exception as exc:
        logger.error("get_download_url failed resume_id={}: {}", resume_id, exc)
    return None
