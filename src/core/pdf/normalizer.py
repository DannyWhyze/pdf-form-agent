import logging
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from pypdf.generic import ArrayObject

from src.core.pdf.extractor import _clean_unicode_escapes, extract_choice_options

logger = logging.getLogger(__name__)

_CHECKBOX_FALSY_STRINGS = {
    "false", "0", "nein", "no", "off", "none", "nicht",
    "unselected", "unchecked", "", "/off", "null", "falsehood", "deaktiviert"
}


def discover_radio_groups(pdf_path: Path) -> dict[str, dict[str, Any]]:
    """
    Discovers hierarchical radio button groups in a PDF form.
    Returns mapping: field_name -> {"states": list[str], "options": list[str]}
    """
    radio_groups: dict[str, dict[str, Any]] = {}
    try:
        reader = PdfReader(str(pdf_path))
        fields = reader.get_fields() or {}
        for name, info in fields.items():
            if not info or str(info.get("/FT")) != "/Btn":
                continue
            ff = int(info.get("/Ff", 0))
            kids = info.get("/Kids")
            states = [str(s) for s in info.get("/_States_", []) if str(s) not in ("/Off", "Off")]
            is_radio = (ff & 32768 != 0) or (kids is not None and len(states) > 1)
            if is_radio:
                opts = extract_choice_options(info)
                if not states and kids:
                    for kid_ref in kids:
                        kid = kid_ref.get_object() if hasattr(kid_ref, "get_object") else kid_ref
                        ap = kid.get("/AP", {}) if isinstance(kid, dict) else {}
                        n = ap.get("/N", {}) if isinstance(ap, dict) else {}
                        if isinstance(n, dict):
                            for k in n.keys():
                                sk = str(k)
                                if sk not in ("/Off", "Off") and sk not in states:
                                    states.append(sk)
                radio_groups[name] = {"states": states, "options": opts}
    except Exception as e:
        logger.warning(f"Could not discover radio groups: {e}")
    return radio_groups


_discover_radio_groups = discover_radio_groups


def discover_btn_on_keys(pdf_path: Path) -> dict[str, str]:
    """
    Scans PDF fields and widget annotations to find the active 'on' state key for standalone /Btn checkboxes.
    Defaults to '/Yes' if no explicit on-key is found in /AP/N.
    """
    btn_keys: dict[str, str] = {}
    try:
        reader = PdfReader(str(pdf_path))
        fields = reader.get_fields() or {}
        for name, info in fields.items():
            if not info or str(info.get("/FT")) != "/Btn":
                continue
            ff = int(info.get("/Ff", 0))
            states = [str(s) for s in info.get("/_States_", []) if str(s) not in ("/Off", "Off")]
            if ff & 32768 == 0 and len(states) <= 1:
                btn_keys[name] = states[0] if states else "/Yes"

        # Fallback to single-page widget annotations
        for page in reader.pages:
            annots_ref = page.get("/Annots")
            if not annots_ref:
                continue
            annots = annots_ref.get_object() if hasattr(annots_ref, "get_object") else annots_ref
            if not isinstance(annots, (list, ArrayObject)):
                continue
            for annot_ref in annots:
                annot = annot_ref.get_object() if hasattr(annot_ref, "get_object") else annot_ref
                if annot and annot.get("/FT") == "/Btn" and "/T" in annot:
                    field_name = str(annot["/T"])
                    if field_name in btn_keys:
                        continue
                    ff = int(annot.get("/Ff", 0))
                    if ff & 32768 != 0:
                        continue
                    on_key = "/Yes"
                    ap_ref = annot.get("/AP")
                    if ap_ref:
                        ap = ap_ref.get_object() if hasattr(ap_ref, "get_object") else ap_ref
                        n_ref = ap.get("/N") if isinstance(ap, dict) else None
                        if n_ref:
                            n = n_ref.get_object() if hasattr(n_ref, "get_object") else n_ref
                            if isinstance(n, dict):
                                for k in n.keys():
                                    if str(k) not in ("/Off", "Off"):
                                        on_key = str(k)
                                        break
                    btn_keys[field_name] = on_key
    except Exception as e:
        logger.warning(f"Could not discover /Btn on-keys: {e}")
    return btn_keys


_discover_btn_on_keys = discover_btn_on_keys


def normalize_field_values(
    raw_values: dict[str, Any],
    btn_on_keys: dict[str, str],
    choice_options: dict[str, list[str]] | None = None,
    radio_groups: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Normalizes field values:
    - /Btn radio groups: maps 1-based indices, options labels, or states to appearance states (/0, /1, etc.)
    - /Btn standalone checkboxes: maps truthy values/free-text to on_key (/Yes) and falsy values to /Off
    - /Ch dropdowns: maps 1-based indices and case-insensitive strings to valid options
    """
    normalized: dict[str, Any] = {}
    choice_options = choice_options or {}
    radio_groups = radio_groups or {}

    for name, raw_val in raw_values.items():
        val = _clean_unicode_escapes(raw_val)
        if name in radio_groups:
            rg = radio_groups[name]
            states = rg.get("states", [])
            opts = [_clean_unicode_escapes(opt) for opt in rg.get("options", [])]
            s = str(val).strip()

            if not states:
                normalized[name] = s
                continue

            # 1. Direct match on state (e.g. "/0" or "0")
            if s in states:
                normalized[name] = s
            elif f"/{s}" in states:
                normalized[name] = f"/{s}"
            # 2. 1-based numeric index (e.g. "1" -> states[0], "2" -> states[1])
            elif s.isdigit() and 1 <= int(s) <= len(states):
                normalized[name] = states[int(s) - 1]
            # 3. Match on options or boolean / yes / no
            else:
                matched_idx = -1
                s_lower = s.lower()
                for idx, opt in enumerate(opts):
                    opt_lower = opt.lower()
                    if s_lower == opt_lower or opt_lower.startswith(s_lower) or s_lower.startswith(opt_lower):
                        matched_idx = idx
                        break

                if matched_idx != -1 and matched_idx < len(states):
                    normalized[name] = states[matched_idx]
                elif isinstance(val, bool):
                    if val:
                        normalized[name] = states[0]
                    else:
                        normalized[name] = states[1] if len(states) > 1 else "/Off"
                elif s_lower in ("ja", "yes", "true"):
                    normalized[name] = states[0]
                elif s_lower in ("nein", "no", "false") and len(states) > 1:
                    normalized[name] = states[1]
                else:
                    normalized[name] = s

        elif name in btn_on_keys:
            on_key = btn_on_keys[name]
            if isinstance(val, bool):
                normalized[name] = on_key if val else "/Off"
            elif val is None:
                normalized[name] = "/Off"
            else:
                s = str(val).strip().lower()
                if s in _CHECKBOX_FALSY_STRINGS:
                    normalized[name] = "/Off"
                else:
                    # Any affirmative value or free text maps to the on-key
                    normalized[name] = on_key

        elif name in choice_options and choice_options[name]:
            opts = [_clean_unicode_escapes(opt) for opt in choice_options[name]]
            s = str(val).strip()
            # Check 1-based index (e.g. "1" -> opts[0])
            if s.isdigit():
                idx = int(s) - 1
                if 0 <= idx < len(opts):
                    normalized[name] = opts[idx]
                else:
                    normalized[name] = s
            else:
                # Case-insensitive match against available options
                matched = next((opt for opt in opts if opt.lower() == s.lower()), None)
                normalized[name] = matched if matched is not None else s
        else:
            normalized[name] = val
    return normalized


_normalize_field_values = normalize_field_values
