import logging
import uuid
from pathlib import Path

from src.config import DATA_DIR

logger = logging.getLogger(__name__)

USER_PROFILE_FILENAME = "user_profile.txt"


def get_user_profile_path(base_dir: Path | None = None) -> Path:
    """
    Returns the resolved path to the user profile text file.
    """
    return (base_dir or DATA_DIR) / USER_PROFILE_FILENAME


def read_user_profile(profile_path: Path | None = None) -> str:
    """
    Reads the stored user profile and master data (Stammdaten) from disk.

    Returns the user profile text notes if available, or an informative message
    if no profile has been saved yet or if the file is empty.
    """
    path = profile_path or get_user_profile_path()
    try:
        if not path.exists():
            return "Kein Nutzerprofil gefunden. Die Datei data/user_profile.txt ist leer oder existiert noch nicht."
        content = path.read_text(encoding="utf-8").strip()
        if not content:
            return "Kein Nutzerprofil gefunden. Die Datei data/user_profile.txt ist leer."
        return content
    except Exception as e:
        logger.error("Error reading user profile from %s: %s", path, e)
        return f"Fehler beim Lesen des Nutzerprofils: {e}"


def save_user_profile(content: str, profile_path: Path | None = None) -> Path:
    """
    Saves user profile content to disk using an atomic replace operation
    to prevent partially written files.
    """
    target_path = profile_path or get_user_profile_path()
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target_path.parent / f"user_profile_{uuid.uuid4().hex}.tmp"
    temp_path.write_text(content, encoding="utf-8")
    temp_path.replace(target_path)
    return target_path


def delete_user_profile(profile_path: Path | None = None) -> bool:
    """
    Deletes the user profile file from disk if it exists.
    Returns True if a file was deleted, False if no file existed.
    """
    target_path = profile_path or get_user_profile_path()
    if target_path.exists():
        target_path.unlink()
        return True
    return False
