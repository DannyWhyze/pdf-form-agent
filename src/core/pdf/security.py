import io
import logging
from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import ArrayObject

logger = logging.getLogger(__name__)


def inspect_pdf_security(pdf_source: Path | str | bytes) -> list[str]:
    """
    Scans a PDF document for active content, scripts, and embedded payloads
    that could represent a security threat (e.g., /Launch, /JavaScript, embedded attachments).
    Returns a list of detected threats. An empty list indicates a clean document.
    """
    threats: list[str] = []
    try:
        if isinstance(pdf_source, bytes):
            reader = PdfReader(io.BytesIO(pdf_source))
        else:
            reader = PdfReader(pdf_source)
    except Exception as e:
        logger.warning("Failed to parse PDF for security inspection: %s", e)
        return [f"Malformed or unparseable PDF stream ({e})"]

    root = reader.root_object
    if not root:
        return threats

    # 1. Document-level JavaScript (/Names/JavaScript)
    names = root.get("/Names")
    if names:
        names_obj = names.get_object() if hasattr(names, "get_object") else names
        if isinstance(names_obj, dict) and "/JavaScript" in names_obj:
            threats.append("Document-level JavaScript detected (/Names/JavaScript)")

    # 2. Document-level OpenAction & Additional Actions (/AA)
    open_action = root.get("/OpenAction")
    if open_action:
        oa_obj = open_action.get_object() if hasattr(open_action, "get_object") else open_action
        if isinstance(oa_obj, dict):
            s = str(oa_obj.get("/S", ""))
            if s in ("/Launch", "/JavaScript"):
                threats.append(f"Unsafe /OpenAction ({s})")

    aa = root.get("/AA")
    if aa is not None:
        aa_obj = aa.get_object() if hasattr(aa, "get_object") else aa
        if isinstance(aa_obj, dict):
            threats.append("Document-level Additional Actions (/AA)")

    # 3. Page-level Additional Actions and Annotation Actions
    for i, page in enumerate(reader.pages):
        page_aa = page.get("/AA")
        if page_aa:
            threats.append(f"Page {i+1} Additional Actions (/AA)")

        annots = page.get("/Annots")
        if annots:
            annots_obj = annots.get_object() if hasattr(annots, "get_object") else annots
            if isinstance(annots_obj, (list, ArrayObject)):
                for annot in annots_obj:
                    annot_dict = annot.get_object() if hasattr(annot, "get_object") else annot
                    if isinstance(annot_dict, dict):
                        action = annot_dict.get("/A")
                        if action:
                            act_obj = action.get_object() if hasattr(action, "get_object") else action
                            if isinstance(act_obj, dict):
                                s = str(act_obj.get("/S", ""))
                                if s in ("/Launch", "/JavaScript"):
                                    threats.append(f"Page {i+1} unsafe action ({s})")

    # 4. Embedded attachments
    if hasattr(reader, "attachments") and reader.attachments:
        for name in reader.attachments:
            threats.append(f"Embedded attachment detected ({name})")

    return threats
