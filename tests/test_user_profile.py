import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from fastapi.testclient import TestClient

from src.api.app import app
from src.config import DATA_DIR
from src.core.tools import AVAILABLE_PDF_FORM_TOOLS, get_user_profile


@pytest.fixture
def profile_file():
    profile_path = DATA_DIR / "user_profile.txt"
    backup = None
    if profile_path.exists():
        backup = profile_path.read_text(encoding="utf-8")
        profile_path.unlink()

    yield profile_path

    if profile_path.exists():
        profile_path.unlink()
    if backup is not None:
        profile_path.write_text(backup, encoding="utf-8")


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_get_user_profile_empty_when_not_exists(client, profile_file):
    response = client.get("/api/v1/user-profile")
    assert response.status_code == 200
    data = response.json()
    assert data["exists"] is False
    assert data["content"] == ""
    assert data["updated_at"] is None
    assert "no-store" in response.headers.get("Cache-Control", "")


def test_post_and_get_user_profile(client, profile_file):
    test_content = "Name: Erika Mustermann\nGeburtsdatum: 01.01.1990\nIBAN: DE12345678901234567890"
    post_res = client.post("/api/v1/user-profile", json={"content": test_content})
    assert post_res.status_code == 200
    post_data = post_res.json()
    assert post_data["status"] == "success"
    assert "updated_at" in post_data

    get_res = client.get("/api/v1/user-profile")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["exists"] is True
    assert get_data["content"] == test_content
    assert get_data["updated_at"] == post_data["updated_at"]


def test_delete_user_profile(client, profile_file):
    # Setup profile first
    client.post("/api/v1/user-profile", json={"content": "Test Profile"})
    assert profile_file.exists()

    del_res = client.delete("/api/v1/user-profile")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"
    assert not profile_file.exists()

    # Re-fetch should be empty
    get_res = client.get("/api/v1/user-profile")
    assert get_res.status_code == 200
    assert get_res.json()["exists"] is False

    # Deleting again should not crash
    del_res2 = client.delete("/api/v1/user-profile")
    assert del_res2.status_code == 200


def test_post_user_profile_payload_limit_64kb(client, profile_file):
    large_content = "A" * (65536 + 10)  # > 64 KB
    response = client.post("/api/v1/user-profile", json={"content": large_content})
    assert response.status_code == 413
    assert "64 KB" in response.json()["detail"]


def test_get_user_profile_tool(profile_file):
    # 1. Check tool is registered
    assert get_user_profile in AVAILABLE_PDF_FORM_TOOLS

    # 2. When empty
    tool_out_empty = get_user_profile.invoke({})
    assert "Kein Nutzerprofil gefunden" in tool_out_empty

    # 3. When populated
    profile_content = "Name: Max Mustermann\nPLZ: 10115 Berlin"
    profile_file.write_text(profile_content, encoding="utf-8")
    tool_out_filled = get_user_profile.invoke({})
    assert tool_out_filled == profile_content
