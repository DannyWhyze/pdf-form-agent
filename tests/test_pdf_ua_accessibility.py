import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pypdf import PdfReader

from src.core.tools import fill_pdf_form


def test_fill_pdf_form_preserves_struct_tree_and_mark_info(tmp_path):
    """
    Verifies that filling a tagged PDF (such as SGB-II Antrag) preserves
    /StructTreeRoot, /MarkInfo (with /Marked=True), /Lang, and enforces
    /Tabs /S (Structure Order) on every page according to ISO 14289-1 § 7.18.1.
    """
    input_pdf = "data/input/pdfs/antrag-sgb2_ba042689.pdf"
    assert Path(input_pdf).exists(), f"Input PDF {input_pdf} not found"

    thread_id = "test_pdf_ua_sgb2"
    output_filename = "filled_sgb2_ua.pdf"
    config = {"configurable": {"thread_id": thread_id}}

    res_str = fill_pdf_form.invoke(
        {
            "filepath": input_pdf,
            "field_values": {"1_Name": "Mustermann", "1_Vorname": "Erika"},
            "output_filename": output_filename,
        },
        config=config,
    )
    res = json.loads(res_str)
    assert res["error"] is False

    from src.config import SESSIONS_DIR
    out_path = SESSIONS_DIR / thread_id / output_filename
    assert out_path.exists()

    reader = PdfReader(str(out_path))
    root = reader.trailer["/Root"]

    # 1. /StructTreeRoot must be preserved
    assert "/StructTreeRoot" in root, "Tagged PDF must retain /StructTreeRoot"

    # 2. /MarkInfo must be preserved with /Marked = True
    assert "/MarkInfo" in root, "Tagged PDF must retain /MarkInfo"
    mark_info = root["/MarkInfo"].get_object()
    assert bool(mark_info.get("/Marked")) is True, "/MarkInfo must have /Marked == True"

    # 3. Document language /Lang must be preserved
    assert "/Lang" in root, "Tagged PDF must retain /Lang"
    assert str(root["/Lang"]) == "de-DE"

    # 4. Tab order must be Structure Order (/S) on all pages (ISO 14289-1 § 7.18.1)
    assert len(reader.pages) > 0
    for page_idx, page in enumerate(reader.pages):
        assert page.get("/Tabs") == "/S", f"Page {page_idx} must enforce /Tabs /S"


def test_fill_pdf_form_sets_tab_order_and_default_lang_on_untagged_pdf(tmp_path):
    """
    Verifies that filling an untagged PDF (such as test_form_3.pdf) enforces
    Row Order (/Tabs /R) on every page to prevent erratic tab jumps, and
    sets the default document language /Lang to 'de-DE' in the catalog.
    """
    input_pdf = "data/input/pdfs/test_form_3.pdf"
    assert Path(input_pdf).exists(), f"Input PDF {input_pdf} not found"

    thread_id = "test_pdf_ua_untagged"
    output_filename = "filled_test3_ua.pdf"
    config = {"configurable": {"thread_id": thread_id}}

    res_str = fill_pdf_form.invoke(
        {
            "filepath": input_pdf,
            "field_values": {"txt_name": "Mustermann", "txt_plz": "10115"},
            "output_filename": output_filename,
        },
        config=config,
    )
    res = json.loads(res_str)
    assert res["error"] is False

    from src.config import SESSIONS_DIR
    out_path = SESSIONS_DIR / thread_id / output_filename
    assert out_path.exists()

    reader = PdfReader(str(out_path))
    root = reader.trailer["/Root"]

    # Untagged form: /StructTreeRoot is absent
    assert "/StructTreeRoot" not in root

    # 1. /Lang must default to de-DE in catalog
    assert "/Lang" in root, "Catalog must have /Lang set"
    assert str(root["/Lang"]) == "de-DE"

    # 2. Every page must enforce /Tabs /R (Row Order)
    assert len(reader.pages) > 0
    for page_idx, page in enumerate(reader.pages):
        assert page.get("/Tabs") == "/R", f"Page {page_idx} must enforce /Tabs /R"


def test_fill_pdf_form_preserves_widget_tooltips(tmp_path):
    """
    Verifies that widget annotations retain their accessibility descriptions
    (/TU tooltips) and field names (/T) after filling and read-only flattening.
    """
    input_pdf = "data/input/pdfs/test_form_3.pdf"
    assert Path(input_pdf).exists(), f"Input PDF {input_pdf} not found"

    thread_id = "test_pdf_ua_tooltips"
    output_filename = "filled_tooltips_ua.pdf"
    config = {"configurable": {"thread_id": thread_id}}

    res_str = fill_pdf_form.invoke(
        {
            "filepath": input_pdf,
            "field_values": {"txt_name": "Mustermann"},
            "output_filename": output_filename,
        },
        config=config,
    )
    res = json.loads(res_str)
    assert res["error"] is False

    from src.config import SESSIONS_DIR
    out_path = SESSIONS_DIR / thread_id / output_filename
    assert out_path.exists()

    orig_reader = PdfReader(input_pdf)
    orig_fields = orig_reader.get_fields() or {}

    out_reader = PdfReader(str(out_path))
    out_fields = out_reader.get_fields() or {}

    # Verify that fields with /TU in the original retain their /TU in the output
    for fname, fdict in orig_fields.items():
        if fdict and "/TU" in fdict:
            orig_tu = str(fdict["/TU"])
            assert fname in out_fields, f"Field {fname} missing in output"
            out_tu = str(out_fields[fname].get("/TU", ""))
            assert out_tu == orig_tu, f"/TU tooltip changed for {fname}: '{orig_tu}' vs '{out_tu}'"
