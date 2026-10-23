import io
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import httpx
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, TextStringObject

from src.api.app import app, cleanup_ephemeral_sessions, get_agent_instance
from src.core.tools import fill_pdf_form


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_health_check(client):
    """Verify health check endpoint returns 200 and service status."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "pdf_form_agent"}


def test_get_agent_instance_singleton():
    """Verify get_agent_instance caches by (model_name, think_enabled)."""
    with patch("src.api.app.PDFFormAgent") as mock_agent_class:
        mock_instance_a = MagicMock()
        mock_instance_b = MagicMock()
        mock_agent_class.side_effect = [mock_instance_a, mock_instance_b]

        # Reset global singleton state for test isolation
        import src.api.app as app_module

        app_module._agent_instance = None
        app_module._agent_instances.clear()

        first = get_agent_instance("modelA", False)
        second = get_agent_instance("modelA", False)
        third = get_agent_instance("modelA", True)

        assert first is mock_instance_a
        assert second is mock_instance_a
        assert third is mock_instance_b
        assert mock_agent_class.call_count == 2


def test_download_document_inline(tmp_path, monkeypatch, client):
    """Verify document download endpoint serves inline preview by default."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)

    thread_id = "session_download_test"
    filename = "form_preview.pdf"
    session_dir = tmp_path / thread_id
    session_dir.mkdir(parents=True, exist_ok=True)
    pdf_file = session_dir / filename
    pdf_file.write_bytes(b"%PDF-1.4 sample content")

    response = client.get(f"/api/v1/download/{thread_id}/{filename}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "inline" in response.headers.get("content-disposition", "")
    assert response.content == b"%PDF-1.4 sample content"


def test_download_document_attachment(tmp_path, monkeypatch, client):
    """Verify document download endpoint forces attachment when download=true."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)

    thread_id = "session_attachment_test"
    filename = "form_download.pdf"
    session_dir = tmp_path / thread_id
    session_dir.mkdir(parents=True, exist_ok=True)
    pdf_file = session_dir / filename
    pdf_file.write_bytes(b"%PDF-1.4 attachment content")

    response = client.get(f"/api/v1/download/{thread_id}/{filename}?download=true")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers.get("content-disposition", "")


def test_download_document_not_found(tmp_path, monkeypatch, client):
    """Verify 404 response when requested document does not exist."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)

    response = client.get("/api/v1/download/non_existent_session/missing.pdf")
    assert response.status_code == 404
    assert response.json() == {"detail": "Document not found."}


def _make_dummy_pdf_bytes() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_upload_document_success(tmp_path, monkeypatch, client):
    """Verify uploading a valid PDF saves the file and returns extracted form fields."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)

    fake_fields = {
        "error": False,
        "total_fields": 1,
        "fields": [{"name": "Vorname", "type": "/Tx", "description": "", "value": ""}],
    }

    mock_tool = MagicMock()
    mock_tool.invoke.return_value = json.dumps(fake_fields)

    valid_pdf_bytes = _make_dummy_pdf_bytes()
    with patch("src.api.app.read_pdf_form", mock_tool):
        pdf_payload = io.BytesIO(valid_pdf_bytes)
        response = client.post(
            "/api/v1/upload-document",
            data={"thread_id": "test_upload_thread"},
            files={"file": ("test_form.pdf", pdf_payload, "application/pdf")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["filename"] == "test_form.pdf"
        assert data["thread_id"] == "test_upload_thread"
        assert data["fields_summary"] == fake_fields

        saved_file = tmp_path / "test_upload_thread" / "test_form.pdf"
        assert saved_file.exists()
        assert saved_file.read_bytes() == valid_pdf_bytes


def test_upload_document_invalid_extension(client):
    """Verify 400 error when uploaded file is not a PDF."""
    txt_payload = io.BytesIO(b"not a pdf")
    response = client.post(
        "/api/v1/upload-document",
        data={"thread_id": "test_invalid_thread"},
        files={"file": ("invalid.txt", txt_payload, "text/plain")},
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Only PDF files are allowed."}


def test_upload_document_non_json_read_result(tmp_path, monkeypatch, client):
    """Verify upload handles non-JSON output from read_pdf_form gracefully."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)

    mock_tool = MagicMock()
    mock_tool.invoke.return_value = "Non-JSON plain error text"

    valid_pdf_bytes = _make_dummy_pdf_bytes()
    with patch("src.api.app.read_pdf_form", mock_tool):
        pdf_payload = io.BytesIO(valid_pdf_bytes)
        response = client.post(
            "/api/v1/upload-document",
            data={"thread_id": "test_raw_thread"},
            files={"file": ("raw_form.pdf", pdf_payload, "application/pdf")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["fields_summary"] == {"raw": "Non-JSON plain error text"}


def test_chat_stream_endpoint(client):
    """Verify /chat endpoint streams SSE events and ends with [DONE]."""
    mock_events = [
        {"event": "thought", "data": "Checking required fields..."},
        {"event": "token", "data": "Please enter your name."},
    ]

    async def mock_astream_events(message, thread_id):
        for ev in mock_events:
            yield ev

    mock_agent = MagicMock()
    mock_agent.astream_events = mock_astream_events

    with patch("src.api.app.get_agent_instance", return_value=mock_agent):
        response = client.post(
            "/api/v1/chat",
            json={"thread_id": "chat_session_1", "message": "Hello"},
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        lines = response.text.strip().split("\n\n")
        assert len(lines) == 3
        assert json.loads(lines[0].replace("data: ", "")) == mock_events[0]
        assert json.loads(lines[1].replace("data: ", "")) == mock_events[1]
        assert lines[2] == "data: [DONE]"


def test_chat_stream_ollama_connect_error(client):
    """Verify /chat returns clean SSE error when Ollama service is unreachable."""
    async def mock_astream_events(message, thread_id):
        raise httpx.ConnectError("All connection attempts failed")
        yield {}  # unreachable

    mock_agent = MagicMock()
    mock_agent.astream_events = mock_astream_events

    with patch("src.api.app.get_agent_instance", return_value=mock_agent):
        response = client.post(
            "/api/v1/chat",
            json={"thread_id": "chat_session_err", "message": "Hello"},
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        lines = response.text.strip().split("\n\n")
        assert len(lines) == 2
        payload = json.loads(lines[0].replace("data: ", ""))
        assert payload["event"] == "error"
        assert "Ollama-Dienst auf Port 11434 nicht erreichbar" in payload["data"]
        assert lines[1] == "data: [DONE]"


def test_chat_stream_generic_error(client):
    """Verify /chat returns clean SSE error on unexpected agent exception."""
    async def mock_astream_events(message, thread_id):
        raise RuntimeError("Unexpected agent crash")
        yield {}

    mock_agent = MagicMock()
    mock_agent.astream_events = mock_astream_events

    with patch("src.api.app.get_agent_instance", return_value=mock_agent):
        response = client.post(
            "/api/v1/chat",
            json={"thread_id": "chat_session_generic_err", "message": "Hello"},
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        lines = response.text.strip().split("\n\n")
        assert len(lines) == 2
        payload = json.loads(lines[0].replace("data: ", ""))
        assert payload["event"] == "error"
        assert "Fehler bei der Kommunikation mit dem KI-Modell" in payload["data"]
        assert "Unexpected agent crash" in payload["data"]
        assert lines[1] == "data: [DONE]"


def test_root_spa_mount(client):
    """Verify root / serves index.html when frontend/dist exists."""
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert '<div id="root"></div>' in response.text


def test_list_models_success(client):
    """Verify /models endpoint filters embedding models and returns chat models."""
    mock_ollama_data = {
        "models": [
            {
                "name": "gemma4:e4b",
                "size": 4920755200,
                "details": {
                    "family": "gemma",
                    "families": ["gemma"],
                    "parameter_size": "4B",
                },
            },
            {
                "name": "llama3.1:8b",
                "size": 4700000000,
                "details": {
                    "family": "llama",
                    "families": ["llama"],
                    "parameter_size": "8B",
                },
            },
            {
                "name": "nomic-embed-text:latest",
                "size": 274302450,
                "details": {
                    "family": "nomic-bert",
                    "families": ["nomic-bert"],
                },
            },
            {
                "name": "bge-m3:latest",
                "size": 1100000000,
                "details": {
                    "family": "bert",
                    "families": ["bert"],
                },
            },
        ]
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_ollama_data

    with patch("httpx.AsyncClient.get", return_value=mock_response):
        response = client.get("/api/v1/models")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        model_names = [m["name"] for m in data["models"]]
        assert "gemma4:e4b" in model_names
        assert "llama3.1:8b" in model_names
        # Ensure embedding models were filtered out
        assert "nomic-embed-text:latest" not in model_names
        assert "bge-m3:latest" not in model_names


def test_list_models_fallback_when_offline(client):
    """Verify /models falls back to settings.MODEL_NAME when Ollama is unreachable."""
    with patch("httpx.AsyncClient.get", side_effect=Exception("Connection refused")):
        response = client.get("/api/v1/models")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert len(data["models"]) == 1
        assert data["models"][0]["name"] == "gemma4:e4b"
        assert data["models"][0]["is_current"] is True


def test_chat_stream_with_custom_model_propagation(client):
    """Verify custom model_name in ChatRequest is forwarded to get_agent_instance."""
    mock_events = [{"event": "token", "data": "Model test response"}]

    async def mock_astream_events(message, thread_id):
        for ev in mock_events:
            yield ev

    mock_agent = MagicMock()
    mock_agent.astream_events = mock_astream_events

    with patch("src.api.app.get_agent_instance", return_value=mock_agent) as mock_get_agent:
        response = client.post(
            "/api/v1/chat",
            json={
                "thread_id": "chat_session_custom_model",
                "message": "Hi",
                "model_name": "llama3.1:8b",
                "think_enabled": False,
            },
        )
        assert response.status_code == 200
        mock_get_agent.assert_called_with("llama3.1:8b", False)


def test_chat_stream_with_thinking_mode_propagation(client):
    """Verify think_enabled in ChatRequest is forwarded to get_agent_instance."""
    mock_events = [{"event": "thought", "data": "Thinking..."}, {"event": "token", "data": "Answer"}]

    async def mock_astream_events(message, thread_id):
        for ev in mock_events:
            yield ev

    mock_agent = MagicMock()
    mock_agent.astream_events = mock_astream_events

    with patch("src.api.app.get_agent_instance", return_value=mock_agent) as mock_get_agent:
        response = client.post(
            "/api/v1/chat",
            json={
                "thread_id": "chat_session_thinking",
                "message": "Solve this",
                "model_name": "gemma4:e4b",
                "think_enabled": True,
            },
        )
        assert response.status_code == 200
        mock_get_agent.assert_called_with("gemma4:e4b", True)


def test_security_headers(client):
    """Verify security headers are applied to HTTP responses."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers.get("X-Frame-Options") == "SAMEORIGIN"
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("Content-Security-Policy") == "frame-ancestors 'self'"
    assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert response.headers.get("Cache-Control") == "no-store, no-cache, must-revalidate, private"
    assert response.headers.get("Pragma") == "no-cache"


def test_upload_document_file_too_large(tmp_path, monkeypatch, client):
    """Verify 413 error when uploaded file exceeds MAX_UPLOAD_SIZE."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)
    monkeypatch.setattr("src.api.app.MAX_UPLOAD_SIZE", 50)

    oversized_payload = io.BytesIO(b"%PDF-" + b"A" * 60)
    response = client.post(
        "/api/v1/upload-document",
        data={"thread_id": "test_oversized_thread"},
        files={"file": ("large.pdf", oversized_payload, "application/pdf")},
    )
    assert response.status_code == 413
    assert "File too large" in response.json()["detail"]


def test_upload_document_invalid_magic_bytes(tmp_path, monkeypatch, client):
    """Verify 400 error when uploaded PDF does not start with %PDF- header."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)

    invalid_payload = io.BytesIO(b"NOT_A_PDF_MAGIC_BYTES_12345")
    response = client.post(
        "/api/v1/upload-document",
        data={"thread_id": "test_magic_bytes_thread"},
        files={"file": ("fake.pdf", invalid_payload, "application/pdf")},
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid PDF file header (magic bytes mismatch)."}


def test_cleanup_ephemeral_sessions(tmp_path, monkeypatch):
    """Verify ephemeral session directories older than TTL are removed."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)

    # 1. Old session directory (older than 1 hour)
    old_dir = tmp_path / "old_session"
    old_dir.mkdir()
    old_file = old_dir / "old_doc.pdf"
    old_file.write_bytes(b"%PDF-1.4 old")

    two_hours_ago = time.time() - 7200
    os.utime(old_file, (two_hours_ago, two_hours_ago))
    os.utime(old_dir, (two_hours_ago, two_hours_ago))

    # 2. Recent session directory
    recent_dir = tmp_path / "recent_session"
    recent_dir.mkdir()
    recent_file = recent_dir / "recent_doc.pdf"
    recent_file.write_bytes(b"%PDF-1.4 recent")

    cleaned = cleanup_ephemeral_sessions(max_age_seconds=3600)
    assert cleaned == 1
    assert not old_dir.exists()
    assert recent_dir.exists()


def test_stt_health_endpoint(client):
    """Verify /api/v1/stt-health returns online and offline status correctly."""
    with patch("src.api.app._probe_stt_socket", return_value=True):
        response = client.get("/api/v1/stt-health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert data["online"] is True
        assert data["port"] == 8002

    with patch("src.api.app._probe_stt_socket", return_value=False):
        response = client.get("/api/v1/stt-health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "offline"
        assert data["online"] is False


def test_tts_health_endpoint(client):
    """Verify /api/v1/tts-health returns online and offline status correctly."""
    with patch("src.api.app._probe_tts_socket", return_value=True):
        response = client.get("/api/v1/tts-health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert data["online"] is True
        assert data["port"] == 8005

    with patch("src.api.app._probe_tts_socket", return_value=False):
        response = client.get("/api/v1/tts-health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "offline"
        assert data["online"] is False


def test_cors_origins_whitelisting(client):
    """Verify CORS headers allow whitelisted origins and deny untrusted origins."""
    # 1. Allowed origin
    res_allowed = client.get("/health", headers={"Origin": "http://localhost:8001"})
    assert res_allowed.status_code == 200
    assert res_allowed.headers.get("access-control-allow-origin") == "http://localhost:8001"

    # 2. Disallowed origin (cross-origin drive-by attempt from third-party site)
    res_denied = client.get("/health", headers={"Origin": "http://malicious-website.com"})
    assert res_denied.status_code == 200
    assert "access-control-allow-origin" not in res_denied.headers


def test_download_document_cache_control_headers(tmp_path, monkeypatch, client):
    """Verify document download returns no-store and no-cache privacy headers."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)
    session_dir = tmp_path / "cache_test_thread"
    session_dir.mkdir(parents=True, exist_ok=True)
    pdf_file = session_dir / "test.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 sample content")

    response = client.get("/api/v1/download/cache_test_thread/test.pdf")
    assert response.status_code == 200
    assert response.headers.get("Cache-Control") == "no-store, no-cache, must-revalidate, private"
    assert response.headers.get("Pragma") == "no-cache"


def test_upload_document_rejects_unsafe_active_content(tmp_path, monkeypatch, client):
    """Verify upload_document rejects PDFs with unsafe active content (/Launch action)."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)

    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    launch_action = DictionaryObject()
    launch_action[NameObject("/S")] = NameObject("/Launch")
    launch_action[NameObject("/F")] = TextStringObject("cmd.exe")
    writer.root_object[NameObject("/OpenAction")] = launch_action

    buf = io.BytesIO()
    writer.write(buf)
    malicious_bytes = buf.getvalue()

    response = client.post(
        "/api/v1/upload-document",
        data={"thread_id": "test_active_content_thread"},
        files={"file": ("malicious.pdf", io.BytesIO(malicious_bytes), "application/pdf")},
    )
    assert response.status_code == 400
    assert "Security violation: Unsafe active content detected in PDF" in response.json()["detail"]
    assert "Unsafe /OpenAction (/Launch)" in response.json()["detail"]


def test_upload_fill_and_download_flow(tmp_path, monkeypatch, client):
    """
    Verify complete round-trip flow:
    Upload document -> fill AcroForm via fill_pdf_form -> download via REST endpoint.
    Guarantees that filled fields are present in the downloaded PDF (no session isolation desync).
    """
    sessions_dir = tmp_path / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)
    monkeypatch.setattr("src.api.app.SESSIONS_DIR", sessions_dir)
    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)
    monkeypatch.setattr("src.core.tools.SESSIONS_DIR", sessions_dir)
    monkeypatch.setattr("src.core.pdf.extractor.DATA_DIR", tmp_path)
    monkeypatch.setattr("src.core.pdf.extractor.SESSIONS_DIR", sessions_dir)

    from tests.test_pdf_writer import _create_sample_form
    sample_pdf = tmp_path / "original_sample.pdf"
    _create_sample_form(sample_pdf)

    thread_id = "test_roundtrip_thread"
    filename = "sample_form.pdf"

    # 1. Upload
    with open(sample_pdf, "rb") as f:
        res_upload = client.post(
            "/api/v1/upload-document",
            data={"thread_id": thread_id},
            files={"file": (filename, f, "application/pdf")},
        )
    assert res_upload.status_code == 200

    # 2. Fill
    config = {"configurable": {"thread_id": thread_id}}
    res_fill_raw = fill_pdf_form.invoke(
        {
            "filepath": filename,
            "field_values": {"Vorname": "Erika Mustermann"},
            "output_filename": filename,
        },
        config=config,
    )
    fill_data = json.loads(res_fill_raw)
    assert fill_data["error"] is False

    # 3. Download
    res_download = client.get(f"/api/v1/download/{thread_id}/{filename}")
    assert res_download.status_code == 200

    # 4. Verify downloaded content has filled field
    reader = PdfReader(io.BytesIO(res_download.content))
    fields = reader.get_fields()
    assert fields is not None
    assert fields["Vorname"]["/V"] == "Erika Mustermann"


def test_get_form_fields_and_direct_fill(tmp_path, monkeypatch, client):
    """
    Verify GET /forms/{thread_id}/{filename}/fields and POST /forms/{thread_id}/fill
    endpoints for Plan 045 Form Inspector.
    """
    sessions_dir = tmp_path / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)
    monkeypatch.setattr("src.api.app.SESSIONS_DIR", sessions_dir)
    monkeypatch.setattr("src.core.pdf.extractor.DATA_DIR", tmp_path)
    monkeypatch.setattr("src.core.pdf.extractor.SESSIONS_DIR", sessions_dir)

    from tests.test_pdf_writer import _create_sample_form
    sample_pdf = tmp_path / "sample_orig.pdf"
    _create_sample_form(sample_pdf)

    thread_id = "test_form_inspector_session"
    filename = "form_to_inspect.pdf"
    session_dir = sessions_dir / thread_id
    session_dir.mkdir(parents=True, exist_ok=True)
    target_pdf = session_dir / filename
    target_pdf.write_bytes(sample_pdf.read_bytes())

    # 1. GET fields -> 200
    res_fields = client.get(f"/api/v1/forms/{thread_id}/{filename}/fields")
    assert res_fields.status_code == 200
    data = res_fields.json()
    assert data["error"] is False
    assert data["total_fields"] > 0
    field_names = [f["name"] for f in data["fields"]]
    assert "Vorname" in field_names

    # 2. POST fill direct -> 200
    res_fill = client.post(
        f"/api/v1/forms/{thread_id}/fill",
        json={"filename": filename, "field_values": {"Vorname": "Inspector Hans"}},
    )
    assert res_fill.status_code == 200
    fill_data = res_fill.json()
    assert fill_data["status"] == "success"
    assert fill_data["filled_fields"] >= 1

    # 3. GET fields again -> check updated value
    res_fields_updated = client.get(f"/api/v1/forms/{thread_id}/{filename}/fields")
    assert res_fields_updated.status_code == 200
    updated_data = res_fields_updated.json()
    vorname_entry = next(f for f in updated_data["fields"] if f["name"] == "Vorname")
    assert vorname_entry["value"] == "Inspector Hans"

    # 4. Error cases
    # Non-existent file
    assert client.get(f"/api/v1/forms/{thread_id}/missing.pdf/fields").status_code == 404
    assert client.post(
        f"/api/v1/forms/{thread_id}/fill",
        json={"filename": "missing.pdf", "field_values": {}},
    ).status_code == 404

    # Non-PDF file
    assert client.get(f"/api/v1/forms/{thread_id}/notes.txt/fields").status_code == 400
    assert client.post(
        f"/api/v1/forms/{thread_id}/fill",
        json={"filename": "notes.txt", "field_values": {}},
    ).status_code == 400






