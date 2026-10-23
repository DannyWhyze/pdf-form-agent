import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.user_profile import (
    delete_user_profile,
    get_user_profile_path,
    read_user_profile,
    save_user_profile,
)


def test_get_user_profile_path(tmp_path: Path):
    path = get_user_profile_path(tmp_path)
    assert path == tmp_path / "user_profile.txt"


def test_read_user_profile_missing_and_empty(tmp_path: Path):
    profile_path = tmp_path / "user_profile.txt"

    # 1. Missing file
    res1 = read_user_profile(profile_path)
    assert "Kein Nutzerprofil gefunden" in res1
    assert "existiert noch nicht" in res1

    # 2. Empty file
    profile_path.write_text("   \n  ", encoding="utf-8")
    res2 = read_user_profile(profile_path)
    assert "Kein Nutzerprofil gefunden" in res2
    assert "leer" in res2


def test_save_and_read_user_profile(tmp_path: Path):
    profile_path = tmp_path / "user_profile.txt"
    sample_text = "Name: Danny Mustermann\nPLZ: 10115"

    saved_path = save_user_profile(sample_text, profile_path)
    assert saved_path == profile_path
    assert profile_path.exists()

    content = read_user_profile(profile_path)
    assert content == sample_text


def test_delete_user_profile(tmp_path: Path):
    profile_path = tmp_path / "user_profile.txt"
    profile_path.write_text("Some data", encoding="utf-8")
    assert profile_path.exists()

    # Deleting existing
    deleted = delete_user_profile(profile_path)
    assert deleted is True
    assert not profile_path.exists()

    # Deleting non-existing
    deleted_again = delete_user_profile(profile_path)
    assert deleted_again is False
