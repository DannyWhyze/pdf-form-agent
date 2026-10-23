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

from src.core.pdf.writer import write_pdf_form


def _create_sample_form(path: Path) -> Path:
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    _width, height = A4
    c.drawString(100, 750, "Antragsformular")
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
    page[NameObject("/Annots")] = ArrayObject()

    tx_widget = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Tx"),
            NameObject("/T"): TextStringObject("Vorname"),
            NameObject("/TU"): TextStringObject("Vorname eingeben"),
            NameObject("/Ff"): NumberObject(0),
            NameObject("/V"): TextStringObject(""),
            NameObject("/Rect"): ArrayObject([FloatObject(100), FloatObject(700), FloatObject(300), FloatObject(720)]),
            NameObject("/DA"): ByteStringObject(b"/Helv 10 Tf 0 g"),
        }
    )
    ref_tx = writer._add_object(tx_widget)
    page["/Annots"].append(ref_tx)
    writer._root_object["/AcroForm"]["/Fields"].append(ref_tx)

    with open(path, "wb") as f:
        writer.write(f)

    return path


def test_write_pdf_form_validation(tmp_path: Path):
    missing_input = tmp_path / "missing.pdf"
    out_pdf = tmp_path / "out.pdf"

    # Missing input
    res1 = write_pdf_form(missing_input, out_pdf, {"Vorname": "Max"})
    assert res1["error"] is True
    assert "nicht gefunden" in res1["message"]

    # Invalid field_values type
    valid_input = tmp_path / "sample.pdf"
    _create_sample_form(valid_input)
    res2 = write_pdf_form(valid_input, out_pdf, "not-a-dict")  # type: ignore
    assert res2["error"] is True
    assert "Dictionary" in res2["message"]


def test_write_pdf_form_success_and_a11y(tmp_path: Path):
    input_pdf = tmp_path / "sample.pdf"
    _create_sample_form(input_pdf)
    output_pdf = tmp_path / "filled_out.pdf"

    res = write_pdf_form(input_pdf, output_pdf, {"Vorname": "Erika"})
    assert res["error"] is False
    assert res["status"] == "success"
    assert res["total_fields"] == 1
    assert res["filled_fields"] == 1
    assert res["active_page"] == 1
    assert output_pdf.exists()

    # Verify PDF content and accessibility
    reader = PdfReader(str(output_pdf))
    assert reader.root_object.get("/Lang") == "de-DE"
    # Untagged form must have /Tabs /R
    assert reader.pages[0].get("/Tabs") == "/R"

    # Verify ReadOnly flattening (bit 1 of /Ff set)
    annots = reader.pages[0].get("/Annots")
    assert annots is not None
    widget = annots[0].get_object()
    ff_val = int(widget.get("/Ff", 0))
    assert ff_val & 1 == 1, "Widget must be flattened to ReadOnly (bit 1 set)"


def test_write_pdf_form_does_not_count_off_buttons_as_filled(tmp_path: Path):
    """Verify that unselected radio buttons and unchecked checkboxes (/Off) are not counted as filled."""
    test_form = Path("data/input/pdfs/test_form_3.pdf")
    if not test_form.exists():
        return

    output_pdf = tmp_path / "test_form_3_filled.pdf"
    # Fill only 5 of the 8 fields (the 3 /Btn fields remain untouched /Off)
    res = write_pdf_form(
        test_form,
        output_pdf,
        {
            "txt_name": "Max Mustermann",
            "txt_geburtsdatum": "01.01.1990",
            "drp_familienstand": "ledig",
            "txt_gehalt": "3500 €",
            "txt_iban": "DE02120300000000202027",
        },
    )

    assert res["error"] is False
    assert res["total_fields"] == 8
    assert res["filled_fields"] == 5, f"Expected 5 filled fields, but got {res['filled_fields']} (untouched /Off buttons were counted!)"

