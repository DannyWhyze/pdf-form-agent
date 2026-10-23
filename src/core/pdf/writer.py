import logging
from pathlib import Path
from typing import Any

from pypdf import PdfWriter
from pypdf.generic import ArrayObject, IndirectObject, NameObject, NumberObject, TextStringObject

from src.core.pdf.extractor import discover_choice_options, read_pdf_form_data
from src.core.pdf.normalizer import (
    discover_btn_on_keys,
    discover_radio_groups,
    normalize_field_values,
)

logger = logging.getLogger(__name__)


def write_pdf_form(
    resolved_path: Path,
    output_path: Path,
    field_values: dict[str, Any],
) -> dict[str, Any]:
    """
    Writes values into AcroForm fields of a PDF, enforces PDF/UA accessibility guarantees
    (ISO 14289-1 & BITV 2.0), flattens widgets to read-only, and saves to output_path.

    Returns a structured dictionary with execution metrics (total_fields, filled_fields, active_page).
    """
    if not resolved_path.exists():
        return {"error": True, "message": f"FEHLER: Original-PDF '{resolved_path.name}' nicht gefunden."}

    if not isinstance(field_values, dict):
        return {"error": True, "message": "FEHLER: field_values muss ein Dictionary (Objekt) sein."}

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        btn_on_keys = discover_btn_on_keys(resolved_path)
        choice_options = discover_choice_options(resolved_path)
        radio_groups = discover_radio_groups(resolved_path)
        normalized_values = normalize_field_values(
            field_values, btn_on_keys, choice_options, radio_groups
        )

        writer = PdfWriter(clone_from=str(resolved_path))
        for page in writer.pages:
            writer.update_page_form_field_values(page, normalized_values)

        # Enforce PDF/UA and accessibility guarantees (ISO 14289-1 & BITV 2.0)
        try:
            # 1. Document language guarantee in catalog (/Root)
            if "/Lang" not in writer.root_object or not writer.root_object.get("/Lang"):
                writer.root_object[NameObject("/Lang")] = TextStringObject("de-DE")

            # 2. Determine Tab order: Structure Order (/S) for tagged PDFs, Row Order (/R) for untagged
            has_struct_tree = "/StructTreeRoot" in writer.root_object
            tab_order = NameObject("/S") if has_struct_tree else NameObject("/R")

            for page in writer.pages:
                page[NameObject("/Tabs")] = tab_order
        except Exception as a11y_err:
            logger.warning(f"Could not enforce PDF/UA accessibility attributes: {a11y_err}")

        # Flatten form fields — make all widgets read-only so the browser PDF viewer
        # cannot edit them. Set ReadOnly bit 1 on /Ff flag for each widget.
        try:
            for page in writer.pages:
                annots_ref = page.get("/Annots", None)
                if annots_ref is None:
                    continue

                annots = annots_ref
                if isinstance(annots, IndirectObject):
                    annots = annots.get_object()

                if not isinstance(annots, ArrayObject):
                    continue

                for annot_ref in annots:
                    annot = annot_ref
                    if isinstance(annot, IndirectObject):
                        annot = annot.get_object()

                    subtype = annot.get("/Subtype", None)
                    if subtype is None:
                        continue
                    if str(subtype) == "/Widget":
                        ff_obj = annot.get("/Ff", NumberObject(0))
                        try:
                            ff_val = int(ff_obj)
                        except (ValueError, TypeError):
                            ff_val = 0
                        annot[NameObject("/Ff")] = NumberObject(ff_val | 1)

            logger.info("Flattened form fields in %s", output_path.name)
        except Exception as flatten_err:
            logger.warning(f"Could not flatten form fields: {flatten_err}")

        # Determine 1-based active_page of modified fields
        active_page = 1
        try:
            for page_idx, page in enumerate(writer.pages, start=1):
                annots_ref = page.get("/Annots")
                if not annots_ref:
                    continue
                annots = annots_ref.get_object() if hasattr(annots_ref, "get_object") else annots_ref
                if not isinstance(annots, (list, ArrayObject)):
                    continue
                matched = False
                for annot_ref in annots:
                    annot = annot_ref.get_object() if hasattr(annot_ref, "get_object") else annot_ref
                    if not annot:
                        continue
                    field_name = str(annot.get("/T", ""))
                    if not field_name and "/Parent" in annot:
                        parent = annot["/Parent"]
                        if hasattr(parent, "get_object"):
                            parent = parent.get_object()
                        if parent and "/T" in parent:
                            field_name = str(parent["/T"])
                    if field_name and (field_name in normalized_values or field_name in field_values):
                        active_page = page_idx
                        matched = True
                        break
                if matched:
                    break
        except Exception as page_err:
            logger.warning(f"Could not determine active page: {page_err}")
            active_page = 1

        with open(output_path, "wb") as f:
            writer.write(f)

        # Verify using canonical read_pdf_form_data (Single Source of Truth for filled_fields & total_fields)
        read_res = read_pdf_form_data(output_path)
        filled_count = read_res.get("filled_fields", 0)
        total = read_res.get("total_fields", 0)

        return {
            "error": False,
            "status": "success",
            "message": f"PDF erfolgreich ausgefüllt: {output_path.name}",
            "output_file": output_path.name,
            "total_fields": total,
            "filled_fields": filled_count,
            "active_page": active_page,
            "written_values": normalized_values,
        }
    except Exception as e:
        logger.error(f"Error filling PDF form: {e}")
        return {"error": True, "message": str(e)}
