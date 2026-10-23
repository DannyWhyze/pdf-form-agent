import io
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, TextStringObject

from src.core.pdf.security import inspect_pdf_security


def _create_clean_pdf_bytes() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_inspect_clean_pdf(tmp_path: Path):
    clean_bytes = _create_clean_pdf_bytes()
    threats_bytes = inspect_pdf_security(clean_bytes)
    assert threats_bytes == []

    pdf_file = tmp_path / "clean.pdf"
    pdf_file.write_bytes(clean_bytes)
    threats_file = inspect_pdf_security(pdf_file)
    assert threats_file == []


def test_inspect_malformed_pdf():
    malformed_bytes = b"NOT_A_VALID_PDF_STREAM_DATA"
    threats = inspect_pdf_security(malformed_bytes)
    assert len(threats) == 1
    assert "Malformed or unparseable PDF stream" in threats[0]


def test_inspect_document_level_javascript():
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    names_dict = DictionaryObject()
    js_dict = DictionaryObject()
    names_dict[NameObject("/JavaScript")] = js_dict
    writer.root_object[NameObject("/Names")] = names_dict

    buf = io.BytesIO()
    writer.write(buf)
    threats = inspect_pdf_security(buf.getvalue())
    assert any("Document-level JavaScript detected" in t for t in threats)


def test_inspect_unsafe_openaction_launch():
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    launch_action = DictionaryObject()
    launch_action[NameObject("/S")] = NameObject("/Launch")
    launch_action[NameObject("/F")] = TextStringObject("cmd.exe")
    writer.root_object[NameObject("/OpenAction")] = launch_action

    buf = io.BytesIO()
    writer.write(buf)
    threats = inspect_pdf_security(buf.getvalue())
    assert any("Unsafe /OpenAction (/Launch)" in t for t in threats)


def test_inspect_unsafe_openaction_javascript():
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    js_action = DictionaryObject()
    js_action[NameObject("/S")] = NameObject("/JavaScript")
    js_action[NameObject("/JS")] = TextStringObject("app.alert('evil');")
    writer.root_object[NameObject("/OpenAction")] = js_action

    buf = io.BytesIO()
    writer.write(buf)
    threats = inspect_pdf_security(buf.getvalue())
    assert any("Unsafe /OpenAction (/JavaScript)" in t for t in threats)


def test_inspect_document_level_additional_actions():
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    aa_dict = DictionaryObject()
    writer.root_object[NameObject("/AA")] = aa_dict

    buf = io.BytesIO()
    writer.write(buf)
    threats = inspect_pdf_security(buf.getvalue())
    assert any("Document-level Additional Actions (/AA)" in t for t in threats)


def test_inspect_page_level_unsafe_annotation():
    writer = PdfWriter()
    page = writer.add_blank_page(width=100, height=100)

    annot = DictionaryObject()
    annot[NameObject("/Subtype")] = NameObject("/Link")
    action = DictionaryObject()
    action[NameObject("/S")] = NameObject("/Launch")
    action[NameObject("/F")] = TextStringObject("powershell.exe")
    annot[NameObject("/A")] = action

    annots = ArrayObject([annot])
    page[NameObject("/Annots")] = annots

    buf = io.BytesIO()
    writer.write(buf)
    threats = inspect_pdf_security(buf.getvalue())
    assert any("unsafe action (/Launch)" in t for t in threats)
