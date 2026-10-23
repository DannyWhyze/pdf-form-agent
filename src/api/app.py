import asyncio
import json
import logging
import shutil
import socket
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel

from src.config import DATA_DIR, PROJECT_ROOT, SESSIONS_DIR, settings
from src.core.agent import PDFFormAgent
from src.core.model_factory import fetch_ollama_chat_models
from src.core.pdf.extractor import read_pdf_form_data, resolve_pdf_path
from src.core.pdf.security import inspect_pdf_security
from src.core.pdf.writer import write_pdf_form
from src.core.tools import read_pdf_form
from src.core.user_profile import delete_user_profile, save_user_profile

logger = logging.getLogger(__name__)

MAX_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 MB
MAX_USER_PROFILE_SIZE = 64 * 1024  # 64 KB


def cleanup_ephemeral_sessions(max_age_seconds: int = 3600) -> int:
    """
    Cleans up session directories that have not been modified for
    longer than max_age_seconds. Scans SESSIONS_DIR (and DATA_DIR for compatibility),
    strictly protecting user profiles and non-directory files.
    Returns the count of deleted session directories.
    """
    scan_dirs = []
    if SESSIONS_DIR.exists():
        scan_dirs.append(SESSIONS_DIR)
    if DATA_DIR.exists() and DATA_DIR not in scan_dirs:
        scan_dirs.append(DATA_DIR)

    now = time.time()
    deleted_count = 0
    scanned_paths = set()

    for base_dir in scan_dirs:
        for item in base_dir.iterdir():
            if item.is_dir() and item != SESSIONS_DIR and item.resolve() not in scanned_paths:
                scanned_paths.add(item.resolve())
                try:
                    latest_mtime = item.stat().st_mtime
                    for sub in item.rglob("*"):
                        try:
                            latest_mtime = max(latest_mtime, sub.stat().st_mtime)
                        except OSError:
                            pass

                    if now - latest_mtime > max_age_seconds:
                        shutil.rmtree(item, ignore_errors=True)
                        deleted_count += 1
                        logger.info("Cleaned up expired ephemeral session dir: %s", item.name)
                except OSError as e:
                    logger.warning("Failed to clean up session dir %s: %s", item.name, e)

    return deleted_count


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_ephemeral_sessions()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Dedicated API for interactive AI-driven PDF form filling",
    lifespan=lifespan,
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'self'"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    response.headers["Pragma"] = "no-cache"
    return response

# CORS Setup (whitelisted origins to prevent localhost cross-origin drive-by attacks)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter(prefix=settings.API_V1_STR, tags=["pdf-form"])

# Agent Singleton & Multi-Model Registry
_shared_memory = MemorySaver()
_agent_instance: PDFFormAgent | None = None
_agent_instances: dict[tuple[str, bool], PDFFormAgent] = {}


def get_agent_instance(
    model_name: str | None = None, think_enabled: bool = False
) -> PDFFormAgent:
    global _agent_instance, _agent_instances
    target_model = (
        model_name.strip() if model_name and model_name.strip() else settings.MODEL_NAME
    )
    cache_key = (target_model, bool(think_enabled))
    if cache_key not in _agent_instances:
        _agent_instances[cache_key] = PDFFormAgent(
            model_name=target_model,
            think_enabled=bool(think_enabled),
            checkpointer=_shared_memory,
        )
    _agent_instance = _agent_instances[cache_key]
    return _agent_instances[cache_key]


class ChatRequest(BaseModel):
    thread_id: str
    message: str
    model_name: str | None = None
    think_enabled: bool = False


class UserProfileResponse(BaseModel):
    exists: bool
    content: str
    updated_at: str | None = None


class UserProfileUpdateRequest(BaseModel):
    content: str


class FormFillRequest(BaseModel):
    filename: str
    field_values: dict[str, Any]


@router.get("/user-profile", response_model=UserProfileResponse)
async def get_user_profile_endpoint():
    """
    Returns the stored user profile / master data notes.
    Protected with Cache-Control: no-store, private.
    """
    profile_path = DATA_DIR / "user_profile.txt"
    if not profile_path.exists():
        return UserProfileResponse(exists=False, content="", updated_at=None)

    try:
        content = profile_path.read_text(encoding="utf-8")
        stat = profile_path.stat()
        updated_at = datetime.fromtimestamp(stat.st_mtime, UTC).isoformat()
        return UserProfileResponse(
            exists=bool(content.strip()), content=content, updated_at=updated_at
        )
    except Exception as e:
        logger.error(f"Error reading user profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to read user profile.")


@router.post("/user-profile")
async def update_user_profile_endpoint(request: UserProfileUpdateRequest):
    """
    Updates or creates the user profile / master data notes.
    Enforces a strict 64 KB payload size limit and performs atomic writes.
    """
    if len(request.content.encode("utf-8")) > MAX_USER_PROFILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Profile content exceeds maximum allowed size of {MAX_USER_PROFILE_SIZE // 1024} KB.",
        )

    try:
        profile_path = DATA_DIR / "user_profile.txt"
        target_path = save_user_profile(request.content, profile_path)

        stat = target_path.stat()
        updated_at = datetime.fromtimestamp(stat.st_mtime, UTC).isoformat()
        return {"status": "success", "updated_at": updated_at}
    except Exception as e:
        logger.error(f"Error saving user profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to save user profile.")


@router.delete("/user-profile")
async def delete_user_profile_endpoint():
    """
    Deletes the stored user profile notes from disk.
    """
    profile_path = DATA_DIR / "user_profile.txt"
    try:
        delete_user_profile(profile_path)
        return {"status": "success", "message": "User profile deleted."}
    except Exception as e:
        logger.error(f"Error deleting user profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user profile.")


@router.get("/download/{thread_id}/{filename}")
async def download_document(
    thread_id: str,
    filename: str,
    download: bool = Query(False, description="Set to true to force download instead of inline preview"),
):
    """
    Serves a document — inline preview by default, download when ?download=1.
    Matching documents.py endpoint signature.
    Searches primary in SESSIONS_DIR, with fallback to DATA_DIR.
    """
    safe_thread_id = Path(thread_id).name
    safe_filename = Path(filename).name

    file_path: Path | None = None
    # 1. Primary lookup in SESSIONS_DIR
    if SESSIONS_DIR.exists():
        candidate = (SESSIONS_DIR / safe_thread_id / safe_filename).resolve()
        if candidate.exists() and candidate.is_relative_to(SESSIONS_DIR.resolve()):
            file_path = candidate

    # 2. Fallback lookup in DATA_DIR
    if not file_path:
        candidate = (DATA_DIR / safe_thread_id / safe_filename).resolve()
        if candidate.exists() and candidate.is_relative_to(DATA_DIR.resolve()):
            file_path = candidate

    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found.")

    content_disposition_type = "attachment" if download else "inline"

    return FileResponse(
        path=str(file_path),
        filename=safe_filename,
        media_type="application/pdf",
        content_disposition_type=content_disposition_type,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",
        },
    )


@router.get("/forms/{thread_id}/{filename}/fields")
async def get_form_fields(thread_id: str, filename: str):
    """
    Returns the extracted AcroForm fields, types, options, tooltips, and current values.
    """
    safe_thread_id = Path(thread_id).name
    safe_filename = Path(filename).name
    if not safe_filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    pdf_path = resolve_pdf_path(safe_filename, thread_id=safe_thread_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Document not found.")

    res = await asyncio.to_thread(read_pdf_form_data, pdf_path)
    if res.get("error"):
        raise HTTPException(status_code=500, detail=res.get("message", "Error reading form fields."))
    return res


@router.post("/forms/{thread_id}/fill")
async def fill_form_direct(thread_id: str, request: FormFillRequest):
    """
    Directly writes values into AcroForm fields without LLM inference,
    synchronizing the session PDF and updating progress metrics.
    """
    safe_thread_id = Path(thread_id).name
    safe_filename = Path(request.filename).name
    if not safe_filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    pdf_path = resolve_pdf_path(safe_filename, thread_id=safe_thread_id)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Document not found.")

    if SESSIONS_DIR.exists() and SESSIONS_DIR.is_relative_to(DATA_DIR):
        session_dir = SESSIONS_DIR / safe_thread_id
    else:
        session_dir = DATA_DIR / safe_thread_id

    output_path = session_dir / safe_filename

    res = await asyncio.to_thread(
        write_pdf_form,
        resolved_path=pdf_path,
        output_path=output_path,
        field_values=request.field_values,
    )
    if res.get("error"):
        raise HTTPException(status_code=500, detail=res.get("message", "Failed to fill PDF form."))
    return res


def _write_upload_file(target_path: Path, content: bytes) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "wb") as f:
        f.write(content)


@router.post("/upload-document")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    thread_id: str = Form(...),
):
    """
    Uploads a fillable PDF form and returns extracted AcroForm fields.
    Offloads heavy CPU/parsing and disk I/O to worker threads (Rule 24).
    """
    background_tasks.add_task(cleanup_ephemeral_sessions)

    safe_filename = Path(file.filename or "form.pdf").name
    if not safe_filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max. 25 MB).")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Invalid PDF file header (magic bytes mismatch).")

    # Active content threat inspection (/Launch, /JavaScript, unsafe attachments) offloaded to thread
    threats = await asyncio.to_thread(inspect_pdf_security, content)
    if threats:
        logger.warning("Rejected uploaded PDF due to security violations: %s", threats)
        raise HTTPException(
            status_code=400,
            detail=f"Security violation: Unsafe active content detected in PDF: {', '.join(threats)}",
        )

    safe_thread_id = Path(thread_id).name
    # Session directory is located in SESSIONS_DIR (with fallback to DATA_DIR when monkeypatched)
    if SESSIONS_DIR.exists() and SESSIONS_DIR.is_relative_to(DATA_DIR):
        session_dir = SESSIONS_DIR / safe_thread_id
    else:
        session_dir = DATA_DIR / safe_thread_id

    target_path = session_dir / safe_filename
    await asyncio.to_thread(_write_upload_file, target_path, content)

    config = {"configurable": {"thread_id": safe_thread_id}}
    fields_result_raw = await asyncio.to_thread(
        read_pdf_form.invoke, {"filepath": safe_filename}, config
    )
    try:
        fields_info = json.loads(fields_result_raw)
    except Exception:
        fields_info = {"raw": fields_result_raw}

    return {
        "status": "ok",
        "message": "Document analyzed successfully.",
        "filename": safe_filename,
        "thread_id": safe_thread_id,
        "local_path": str(target_path),
        "fields_summary": fields_info,
    }


def _probe_socket(host: str, port: int, timeout: float = 0.5) -> bool:
    """
    Checks if a network service is listening on host:port via a fast socket connection probe.
    """
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, TimeoutError):
        return False


_probe_stt_socket = _probe_socket
_probe_tts_socket = _probe_socket


@router.get("/stt-health")
async def get_stt_health():
    """
    Returns live connectivity status of the STT speech-to-text microservice (port 8002).
    """
    online = await asyncio.to_thread(_probe_stt_socket, settings.STT_HOST, settings.STT_PORT)
    return {
        "status": "online" if online else "offline",
        "online": online,
        "host": settings.STT_HOST,
        "port": settings.STT_PORT,
    }


@router.get("/tts-health")
async def get_tts_health():
    """
    Returns live connectivity status of the TTS text-to-speech microservice (port 8005).
    """
    online = await asyncio.to_thread(_probe_tts_socket, settings.TTS_HOST, settings.TTS_PORT)
    return {
        "status": "online" if online else "offline",
        "online": online,
        "host": settings.TTS_HOST,
        "port": settings.TTS_PORT,
    }


@router.get("/models")
async def list_models():
    """
    Lists available Ollama chat models (excluding embedding models).
    """
    models = await fetch_ollama_chat_models()
    return {
        "status": "ok",
        "current_default": settings.MODEL_NAME,
        "models": models,
    }


@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """
    Streams SSE events matching the chat.py event format.
    """
    agent = get_agent_instance(request.model_name, request.think_enabled)

    async def event_generator():
        try:
            async for event in agent.astream_events(request.message, request.thread_id):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            is_connect_error = False
            curr: BaseException | None = exc
            while curr is not None:
                if (
                    isinstance(curr, (httpx.ConnectError, httpx.ConnectTimeout))
                    or "connecterror" in type(curr).__name__.lower()
                    or "all connection attempts failed" in str(curr).lower()
                ):
                    is_connect_error = True
                    break
                curr = curr.__cause__ or curr.__context__

            if is_connect_error:
                logger.error(
                    "Ollama connection failed in thread '%s': %s",
                    request.thread_id,
                    exc,
                )
                err_msg = (
                    "Ollama-Dienst auf Port 11434 nicht erreichbar. "
                    "Bitte 'ollama serve' starten."
                )
            else:
                logger.error(
                    "Chat streaming error in thread '%s': %s",
                    request.thread_id,
                    exc,
                    exc_info=True,
                )
                err_msg = f"Fehler bei der Kommunikation mit dem KI-Modell: {str(exc)}"

            err_payload = {"event": "error", "data": err_msg}
            yield f"data: {json.dumps(err_payload, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


app.include_router(router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "pdf_form_agent"}


# Mount frontend dist directly to root for single-service SPA delivery
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
