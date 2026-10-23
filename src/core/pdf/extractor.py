import codecs
import logging
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from pypdf.generic import ArrayObject

from src.config import DATA_DIR, SESSIONS_DIR

logger = logging.getLogger(__name__)


def _clean_unicode_escapes(val: Any) -> Any:
    """
    Cleans raw unicode escape sequences (e.g. 'Erwerbsunf\\u00e4hig' -> 'Erwerbsunfähig').
    """
    if not isinstance(val, str):
        return val
    if "\\u" in val or "\\U" in val:
        try:
            return codecs.decode(val, "unicode_escape")
        except Exception:
            return val
    return val


clean_unicode_escapes = _clean_unicode_escapes


def resolve_pdf_path(
    filepath: str,
    thread_id: str | None = None,
    config: Any | None = None,
    base_dir: Path | None = None,
) -> Path:
    """
    Resolves a PDF filepath. Always tries session_docs first (via thread_id),
    then falls back to the literal path if it exists locally.
    Enforces strict path-traversal sanitization.
    """
    effective_base_dir = base_dir or DATA_DIR
    safe_filename = Path(filepath).name

    # Extract thread_id from config if not provided directly
    if not thread_id and config and isinstance(config, dict):
        thread_id = config.get("configurable", {}).get("thread_id") or config.get("thread_id")

    # 1. Always check session_docs first (both in SESSIONS_DIR and effective_base_dir)
    if thread_id:
        safe_thread_id = Path(str(thread_id)).name
        # Check SESSIONS_DIR / safe_thread_id / safe_filename
        if SESSIONS_DIR.exists():
            session_path = SESSIONS_DIR / safe_thread_id / safe_filename
            if session_path.exists() and session_path.resolve().is_relative_to(SESSIONS_DIR.resolve()):
                return session_path

        session_path = effective_base_dir / safe_thread_id / safe_filename
        if session_path.exists() and session_path.resolve().is_relative_to(effective_base_dir.resolve()):
            return session_path

    # 2. Fallback: file is located directly in effective_base_dir
    direct_data_path = effective_base_dir / safe_filename
    if direct_data_path.exists() and direct_data_path.resolve().is_relative_to(effective_base_dir.resolve()):
        return direct_data_path

    # 3. Fallback: local file
    local_path = Path(filepath)
    if local_path.exists():
        return local_path

    if thread_id:
        safe_thread_id = Path(str(thread_id)).name
        if SESSIONS_DIR.exists() and SESSIONS_DIR.is_relative_to(effective_base_dir):
            return SESSIONS_DIR / safe_thread_id / safe_filename
        return effective_base_dir / safe_thread_id / safe_filename

    return effective_base_dir / safe_filename


_resolve_pdf_path = resolve_pdf_path


def extract_choice_options(field_info: dict[str, Any]) -> list[str]:
    """
    Extracts human-readable choice options from /Opt array in PDF Choice (/Ch) fields.
    Handles both simple string lists and [export_value, display_value] pairs.
    """
    options: list[str] = []
    opt_raw = field_info.get("/Opt")
    if not opt_raw:
        return options
    if hasattr(opt_raw, "get_object"):
        opt_raw = opt_raw.get_object()
    if isinstance(opt_raw, (list, ArrayObject)):
        for item in opt_raw:
            if hasattr(item, "get_object"):
                item = item.get_object()
            if isinstance(item, (list, ArrayObject)) and len(item) >= 2:
                val = str(item[1].get_object() if hasattr(item[1], "get_object") else item[1])
                options.append(_clean_unicode_escapes(val))
            else:
                options.append(_clean_unicode_escapes(str(item)))
    return options


_extract_choice_options = extract_choice_options


def discover_choice_options(pdf_path: Path) -> dict[str, list[str]]:
    """
    Discovers available /Opt options for Choice (/Ch) fields in a PDF.
    """
    choice_map: dict[str, list[str]] = {}
    try:
        reader = PdfReader(str(pdf_path))
        fields = reader.get_fields() or {}
        for name, info in fields.items():
            if info and (str(info.get("/FT")) == "/Ch" or "/Opt" in info):
                choice_map[name] = extract_choice_options(info)
    except Exception as e:
        logger.warning(f"Could not discover choice options: {e}")
    return choice_map


_discover_choice_options = discover_choice_options


def read_pdf_form_data(resolved_path: Path) -> dict[str, Any]:
    """
    Reads all AcroForm fields from a PDF. Returns a dictionary containing field info,
    total_fields, and filled_fields count.
    """
    if not resolved_path.exists():
        return {
            "error": True,
            "message": f"FEHLER: Datei '{resolved_path.name}' nicht gefunden.",
            "total_fields": 0,
            "filled_fields": 0,
            "fields": [],
        }

    try:
        reader = PdfReader(str(resolved_path))
        fields = reader.get_fields()

        if not fields:
            return {
                "error": False,
                "message": "Keine AcroForm-Felder gefunden. Dieses PDF enthält kein ausfüllbares Formular.",
                "total_fields": 0,
                "filled_fields": 0,
                "fields": [],
            }

        field_list = []
        for name, info in fields.items():
            if info is None:
                info = {}
            entry: dict[str, Any] = {
                "name": name,
                "type": str(info.get("/FT", "unknown")),
                "description": str(info.get("/TU", "")),  # Tooltip / Alternative Name
                "value": str(info.get("/V", "")),
            }
            if str(info.get("/FT")) == "/Ch" or "/Opt" in info:
                entry["options"] = extract_choice_options(info)
            field_list.append(entry)

        filled_count = sum(
            1 for f in field_list
            if str(f.get("value", "")).strip() and str(f.get("value", "")) != "/Off"
        )

        return {
            "error": False,
            "total_fields": len(field_list),
            "filled_fields": filled_count,
            "fields": field_list,
        }
    except Exception as e:
        logger.error(f"Error reading PDF form: {e}")
        return {"error": True, "message": str(e), "total_fields": 0, "filled_fields": 0, "fields": []}


def extract_pdf_page_text(resolved_path: Path) -> str:
    """
    Extracts visible text from all PDF pages.
    """
    if not resolved_path.exists():
        return f"FEHLER: Datei '{resolved_path.name}' nicht gefunden."

    try:
        reader = PdfReader(str(resolved_path))
        all_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                all_text.append(f"--- SEITE {i + 1} ---\n{text.strip()}")

        if not all_text:
            return "Kein extrahierbarer Text gefunden (gescanntes PDF oder leere Seiten)."

        return "\n\n".join(all_text)
    except Exception as e:
        logger.error(f"Error extracting PDF text: {e}")
        return f"FEHLER beim Text-Extrahieren: {e!s}"
