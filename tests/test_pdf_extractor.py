import io
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject,
    ByteStringObject,
    DictionaryObject,
    FloatObject,
    NameObject,
    NumberObject,
    TextStringObject,
)
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from src.core.pdf.extractor import (
    _clean_unicode_escapes,
    extract_choice_options,
    extract_pdf_page_text,
    read_pdf_form_data,
    resolve_pdf_path,
)


def _generate_test_pdf_with_form(output_path: Path) -> Path:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    _width, height = A4
    c.drawString(100, 750, "Hallo Testseite 1")
    c.save()
    buffer.seek(0)

    reader = PdfReader(buffer)
    writer = PdfWriter()
    writer.add_page(reader.pages[0])

    writer._root_object[NameObject("/AcroForm")] = DictionaryObject(
        {
            NameObject("/Fields"): ArrayObject(),
            NameObject("/NeedAppearances"): NameObject("/true"),
        }
    )

    page = writer.pages[0]
    if "/Annots" not in page:
        page[NameObject("/Annots")] = ArrayObject()

    # 1. Text field "Vorname"
    tx_widget = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject("Vorname"),
            NameObject("/TU"): TextStringObject("Vorname eingeben"),
            NameObject("/Ff"): NumberObject(0),
            NameObject("/V"): TextStringObject("Max"),
            NameObject("/Rect"): ArrayObject([FloatObject(100), FloatObject(700), FloatObject(300), FloatObject(720)]),
            NameObject("/DA"): ByteStringObject(b"/Helv 10 Tf 0 g"),
        }
    )
    ref_tx = writer._add_object(tx_widget)
    page["/Annots"].append(ref_tx)
    writer._root_object["/AcroForm"]["/Fields"].append(ref_tx)

    # 2. Choice field "Anrede"
    ch_widget = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Ch"),
            NameObject("/T"): TextStringObject("Anrede"),
            NameObject("/TU"): TextStringObject("Anrede wählen"),
            NameObject("/Opt"): ArrayObject([TextStringObject("Herr"), TextStringObject("Frau")]),
            NameObject("/Ff"): NumberObject(0),
            NameObject("/V"): TextStringObject(""),
            NameObject("/Rect"): ArrayObject([FloatObject(100), FloatObject(650), FloatObject(200), FloatObject(670)]),
            NameObject("/DA"): ByteStringObject(b"/Helv 10 Tf 0 g"),
        }
    )
    ref_ch = writer._add_object(ch_widget)
    page["/Annots"].append(ref_ch)
    writer._root_object["/AcroForm"]["/Fields"].append(ref_ch)

    with open(output_path, "wb") as f:
        writer.write(f)

    return output_path


def test_clean_unicode_escapes():
    assert _clean_unicode_escapes("Erwerbsunf\\u00e4hig") == "Erwerbsunfähig"
    assert _clean_unicode_escapes("M\\u00fcnchen") == "München"
    assert _clean_unicode_escapes(123) == 123
    assert _clean_unicode_escapes("Normaler Text") == "Normaler Text"


def test_extract_choice_options():
    # 1. Simple list
    field_simple = {"/Opt": ArrayObject([TextStringObject("Option A"), TextStringObject("Option B")])}
    assert extract_choice_options(field_simple) == ["Option A", "Option B"]

    # 2. Export / Display pairs
    field_pairs = {
        "/Opt": ArrayObject([
            ArrayObject([TextStringObject("EXP_1"), TextStringObject("Erste Option")]),
            ArrayObject([TextStringObject("EXP_2"), TextStringObject("Zweite Option")]),
        ])
    }
    assert extract_choice_options(field_pairs) == ["Erste Option", "Zweite Option"]

    # 3. Empty
    assert extract_choice_options({}) == []


def test_resolve_pdf_path(tmp_path: Path):
    safe_file = "test.pdf"
    session_file = tmp_path / "thread_123" / safe_file
    session_file.parent.mkdir(parents=True, exist_ok=True)
    session_file.write_bytes(b"%PDF-test")

    # Resolve via thread_id
    resolved = resolve_pdf_path(safe_file, thread_id="thread_123", base_dir=tmp_path)
    assert resolved == session_file

    # Resolve via config dict
    resolved_cfg = resolve_pdf_path(safe_file, config={"configurable": {"thread_id": "thread_123"}}, base_dir=tmp_path)
    assert resolved_cfg == session_file

    # Fallback to base_dir
    direct_file = tmp_path / safe_file
    direct_file.write_bytes(b"%PDF-direct")
    assert resolve_pdf_path(safe_file, base_dir=tmp_path) == direct_file


def test_read_pdf_form_data(tmp_path: Path):
    # Non-existent file
    missing = tmp_path / "does_not_exist.pdf"
    res_missing = read_pdf_form_data(missing)
    assert res_missing["error"] is True

    # Flat PDF
    flat_pdf = tmp_path / "flat.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    with open(flat_pdf, "wb") as f:
        writer.write(f)
    res_flat = read_pdf_form_data(flat_pdf)
    assert res_flat["error"] is False
    assert res_flat["total_fields"] == 0

    # AcroForm PDF
    form_pdf = tmp_path / "form.pdf"
    _generate_test_pdf_with_form(form_pdf)
    res_form = read_pdf_form_data(form_pdf)
    assert res_form["error"] is False
    assert res_form["total_fields"] == 2
    assert res_form["filled_fields"] == 1  # "Vorname" has value="Max"
    field_names = [f["name"] for f in res_form["fields"]]
    assert "Vorname" in field_names
    assert "Anrede" in field_names


def test_extract_pdf_page_text(tmp_path: Path):
    form_pdf = tmp_path / "form.pdf"
    _generate_test_pdf_with_form(form_pdf)
    text = extract_pdf_page_text(form_pdf)
    assert "--- SEITE 1 ---" in text
    assert "Hallo Testseite 1" in text

    missing = tmp_path / "missing.pdf"
    assert "FEHLER" in extract_pdf_page_text(missing)
