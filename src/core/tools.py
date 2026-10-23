import json
import logging
from pathlib import Path
from typing import Any

from langchain.tools import tool
from langchain_core.runnables.config import RunnableConfig

from src.config import DATA_DIR, SESSIONS_DIR
from src.core.pdf.extractor import (
    _clean_unicode_escapes,
    _discover_choice_options,
    _extract_choice_options,
    extract_pdf_page_text,
    read_pdf_form_data,
    resolve_pdf_path,
)
from src.core.pdf.normalizer import (
    _discover_btn_on_keys,
    _discover_radio_groups,
    _normalize_field_values,
)
from src.core.pdf.security import inspect_pdf_security
from src.core.pdf.writer import write_pdf_form
from src.core.user_profile import read_user_profile

logger = logging.getLogger(__name__)


def _resolve_pdf_path(filepath: str, config: RunnableConfig | None = None) -> Path:
    """
    Resolves a PDF filepath. Always tries session_docs first (via thread_id),
    then falls back to the literal path if it exists locally.
    Enforces strict path-traversal sanitization.
    Respects monkeypatched DATA_DIR in tests.
    """
    return resolve_pdf_path(filepath, config=config, base_dir=DATA_DIR)


@tool
def read_pdf_form(filepath: str, config: RunnableConfig) -> str:
    """
    Reads all AcroForm fields from a PDF. Returns field name, type, description (tooltip), and current value.
    Use this to understand what information is required in a form.
    """
    resolved_path = _resolve_pdf_path(filepath, config)
    if not resolved_path.exists():
        return f"FEHLER: Datei '{filepath}' nicht gefunden."

    result = read_pdf_form_data(resolved_path)
    if result.get("error"):
        return json.dumps(result, ensure_ascii=False)
    return json.dumps(result, ensure_ascii=False, indent=2)


@tool
def read_pdf_text_for_form(filepath: str, config: RunnableConfig) -> str:
    """
    Extracts visible text from all PDF pages. Use this when AcroForm field names are cryptic (e.g. 'Text1')
    to deduce field meanings from surrounding page text (e.g. 'Text1' is next to 'Name:').
    """
    resolved_path = _resolve_pdf_path(filepath, config)
    if not resolved_path.exists():
        return f"FEHLER: Datei '{filepath}' nicht gefunden."
    return extract_pdf_page_text(resolved_path)


@tool
def fill_pdf_form(
    filepath: str,
    field_values: dict[str, Any],
    output_filename: str,
    config: RunnableConfig,
) -> str:
    """
    Writes values into AcroForm fields of a PDF and saves the updated file.
    field_values must be a dictionary (object) with field_name -> value mapping.
    Returns JSON containing the filepath of the generated PDF file.
    """
    resolved_path = _resolve_pdf_path(filepath, config)
    if not resolved_path.exists():
        return f"FEHLER: Original-PDF '{filepath}' nicht gefunden."

    if not isinstance(field_values, dict):
        return "FEHLER: field_values muss ein Dictionary (Objekt) sein."

    try:
        thread_id = config.get("configurable", {}).get("thread_id", "default") if config else "default"
        safe_thread_id = Path(thread_id).name
        safe_output_filename = Path(output_filename).name

        if SESSIONS_DIR.exists() and SESSIONS_DIR.is_relative_to(DATA_DIR):
            session_dir = SESSIONS_DIR / safe_thread_id
        else:
            session_dir = DATA_DIR / safe_thread_id
        session_dir.mkdir(parents=True, exist_ok=True)
        full_output_path = session_dir / safe_output_filename

        result = write_pdf_form(resolved_path, full_output_path, field_values)
        if result.get("error"):
            return json.dumps(result, ensure_ascii=False)

        result["download_url"] = f"/api/v1/download/{safe_thread_id}/{safe_output_filename}"
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Error filling PDF form: {e}")
        return json.dumps({"error": True, "message": str(e)}, ensure_ascii=False)


@tool
def get_user_profile() -> str:
    """
    Reads the stored user profile and master data (Stammdaten) from disk.

    Returns the user profile text notes (e.g. personal details, address, IBAN, tax ID, etc.)
    if available, or an informative message if no profile has been saved yet.
    Use this profile to automatically pre-fill standard form fields without asking the user.
    """
    profile_path = DATA_DIR / "user_profile.txt"
    return read_user_profile(profile_path)


AVAILABLE_PDF_FORM_TOOLS = [
    read_pdf_form,
    read_pdf_text_for_form,
    fill_pdf_form,
    get_user_profile,
]

# Backwards-compatible re-exports for existing tests and consumers
from src.prompts import PDF_FORM_PROMPT  # noqa: E402

__all__ = [
    "DATA_DIR",
    "AVAILABLE_PDF_FORM_TOOLS",
    "read_pdf_form",
    "read_pdf_text_for_form",
    "fill_pdf_form",
    "get_user_profile",
    "inspect_pdf_security",
    "_clean_unicode_escapes",
    "_resolve_pdf_path",
    "_extract_choice_options",
    "_discover_radio_groups",
    "_discover_btn_on_keys",
    "_discover_choice_options",
    "_normalize_field_values",
    "PDF_FORM_PROMPT",
]
