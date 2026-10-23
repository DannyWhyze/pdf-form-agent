import io
import json
import sys
from pathlib import Path
from unittest.mock import patch

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from fastapi.testclient import TestClient
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

from src.api.app import app
from src.core.model_factory import create_chat_model
from src.core.tools import (
    _resolve_pdf_path,
    fill_pdf_form,
    inspect_pdf_security,
    read_pdf_form,
    read_pdf_text_for_form,
)


def _generate_test_acroform_pdf(output_path: Path) -> Path:
    """Helper to generate a real, valid AcroForm PDF in tmp_path."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    _width, height = A4

    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, height - 50, "Registration Form")
    c.setFont("Helvetica", 11)
    c.drawString(50, height - 120, "Vorname:")
    c.drawString(50, height - 170, "Nachname:")
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

    form_fields = [
        ("Vorname", "Bitte Vornamen eingeben", 160, height - 133, 280),
        ("Nachname", "Bitte Nachnamen eingeben", 160, height - 183, 280),
    ]

    for field_name, tooltip, x, y, w in form_fields:
        widget = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Widget"),
                NameObject("/FT"): NameObject("/Tx"),
                NameObject("/T"): TextStringObject(field_name),
                NameObject("/TU"): TextStringObject(tooltip),
                NameObject("/Ff"): NumberObject(0),
                NameObject("/V"): TextStringObject(""),
                NameObject("/Rect"): ArrayObject(
                    [
                        FloatObject(x),
                        FloatObject(y),
                        FloatObject(x + w),
                        FloatObject(y + 22),
                    ]
                ),
                NameObject("/DA"): ByteStringObject(b"/Helv 10 Tf 0 g"),
            }
        )
        ref = writer._add_object(widget)
        page["/Annots"].append(ref)
        writer._root_object["/AcroForm"]["/Fields"].append(ref)

    with open(output_path, "wb") as f:
        writer.write(f)

    return output_path


def test_resolve_pdf_path_security(tmp_path, monkeypatch):
    """Test Path-traversal sanitization in _resolve_pdf_path."""
    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    test_session = "session_123"
    session_dir = tmp_path / test_session
    session_dir.mkdir(parents=True)
    pdf_file = session_dir / "form.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 dummy")

    config = {"configurable": {"thread_id": test_session}}

    resolved = _resolve_pdf_path("form.pdf", config)
    assert resolved == pdf_file

    malicious_name = "../../../etc/passwd.pdf"
    resolved_malicious = _resolve_pdf_path(malicious_name, config)
    assert resolved_malicious.name == "passwd.pdf"
    assert resolved_malicious.parent == session_dir


def test_read_pdf_form_and_text(tmp_path, monkeypatch):
    """Test reading AcroForm fields and text with original German response format."""
    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_read_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "test_form.pdf"
    _generate_test_acroform_pdf(pdf_path)

    config = {"configurable": {"thread_id": session_id}}

    result_json_str = read_pdf_form.invoke({"filepath": "test_form.pdf"}, config=config)
    data = json.loads(result_json_str)

    assert data["error"] is False
    assert data["total_fields"] == 2
    assert data["filled_fields"] == 0
    field_names = [f["name"] for f in data["fields"]]
    assert "Vorname" in field_names
    assert "Nachname" in field_names

    text_result = read_pdf_text_for_form.invoke(
        {"filepath": "test_form.pdf"}, config=config
    )
    assert "--- SEITE 1 ---" in text_result
    assert "Registration Form" in text_result
    assert "Vorname:" in text_result


def test_fill_pdf_form_and_flattening(tmp_path, monkeypatch):
    """Test filling PDF fields and verifying read-only flattening."""
    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_fill_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "input_form.pdf"
    _generate_test_acroform_pdf(pdf_path)

    config = {"configurable": {"thread_id": session_id}}
    field_values = {
        "Vorname": "Max",
        "Nachname": "Mustermann",
    }

    fill_result_str = fill_pdf_form.invoke(
        {
            "filepath": "input_form.pdf",
            "field_values": field_values,
            "output_filename": "output_filled.pdf",
        },
        config=config,
    )

    data = json.loads(fill_result_str)
    assert data["error"] is False
    assert data["status"] == "success"
    assert "PDF erfolgreich ausgefüllt" in data["message"]
    assert data["filled_fields"] == 2
    assert data["active_page"] == 1

    output_path = session_dir / "output_filled.pdf"
    assert output_path.exists()

    reader = PdfReader(str(output_path))
    fields = reader.get_fields()
    assert fields["Vorname"]["/V"] == "Max"
    assert fields["Nachname"]["/V"] == "Mustermann"

    for page in reader.pages:
        annots = page.get("/Annots", [])
        for annot_ref in annots:
            annot = (
                annot_ref.get_object()
                if hasattr(annot_ref, "get_object")
                else annot_ref
            )
            if str(annot.get("/Subtype")) == "/Widget":
                ff = int(annot.get("/Ff", 0))
                assert ff & 1 == 1, "Widget must be flattened to ReadOnly (bit 1 set)"


def test_fill_pdf_form_active_page_multi_page(tmp_path, monkeypatch):
    """Test that fill_pdf_form correctly detects active_page on a multi-page document."""
    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_multipage_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "multipage_form.pdf"

    buffer1 = io.BytesIO()
    c1 = canvas.Canvas(buffer1, pagesize=A4)
    c1.drawString(50, 700, "Page 1 Content")
    c1.save()
    buffer1.seek(0)

    buffer2 = io.BytesIO()
    c2 = canvas.Canvas(buffer2, pagesize=A4)
    c2.drawString(50, 700, "Page 2 Content")
    c2.save()
    buffer2.seek(0)

    reader1 = PdfReader(buffer1)
    reader2 = PdfReader(buffer2)
    writer = PdfWriter()
    p1 = writer.add_page(reader1.pages[0])
    p2 = writer.add_page(reader2.pages[0])

    writer._root_object[NameObject("/AcroForm")] = DictionaryObject(
        {
            NameObject("/Fields"): ArrayObject(),
            NameObject("/NeedAppearances"): NameObject("/true"),
        }
    )
    p1[NameObject("/Annots")] = ArrayObject()
    p2[NameObject("/Annots")] = ArrayObject()

    w1 = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Tx"),
        NameObject("/T"): TextStringObject("FieldPage1"),
        NameObject("/V"): TextStringObject(""),
        NameObject("/Rect"): ArrayObject([FloatObject(50), FloatObject(500), FloatObject(200), FloatObject(520)]),
    })
    ref1 = writer._add_object(w1)
    p1["/Annots"].append(ref1)
    writer._root_object["/AcroForm"]["/Fields"].append(ref1)

    w2 = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Tx"),
        NameObject("/T"): TextStringObject("FieldPage2"),
        NameObject("/V"): TextStringObject(""),
        NameObject("/Rect"): ArrayObject([FloatObject(50), FloatObject(500), FloatObject(200), FloatObject(520)]),
    })
    ref2 = writer._add_object(w2)
    p2["/Annots"].append(ref2)
    writer._root_object["/AcroForm"]["/Fields"].append(ref2)

    with open(pdf_path, "wb") as f:
        writer.write(f)

    config = {"configurable": {"thread_id": session_id}}

    res_str = fill_pdf_form.invoke(
        {
            "filepath": "multipage_form.pdf",
            "field_values": {"FieldPage2": "ValueOnPage2"},
            "output_filename": "multipage_out.pdf",
        },
        config=config,
    )
    res = json.loads(res_str)
    assert res["error"] is False
    assert res["active_page"] == 2
    assert res["filled_fields"] == 1
    assert res["total_fields"] == 2

    # Check read_pdf_form on the filled output
    read_str = read_pdf_form.invoke({"filepath": "multipage_out.pdf"}, config=config)
    read_data = json.loads(read_str)
    assert read_data["total_fields"] == 2
    assert read_data["filled_fields"] == 1


def test_fill_checkbox_and_bank_details(tmp_path, monkeypatch):
    """Test filling and normalizing /Btn checkboxes, /Ch dropdowns alongside /Tx fields."""
    from tests.utils.pdf_form.create_test_form import create_test_form

    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_btn_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "complex_form.pdf"
    create_test_form(output_path=str(pdf_path))

    config = {"configurable": {"thread_id": session_id}}
    field_values = {
        "txt_nachname": "Schmidt",
        "txt_vorname": "Julia",
        "chk_geschlecht_w": True,
        "chk_geschlecht_m": False,
        "chk_wohnen_allein": "Ja",
        "chk_bezug_alg": False,
        "chk_bezug_wohngeld": "x",
        "drp_staatsangehoerigkeit": "1",  # 1-based index -> "Deutsch"
        "drp_familienstand": "ledig",  # case-insensitive match -> "Ledig"
        "drp_kv_status": "Gesetzlich pflichtversichert",
        "drp_wohnform": "Mietwohnung",
        "txt_kontoinhaber": "Julia Schmidt",
        "txt_kreditinstitut": "Berliner Sparkasse",
        "txt_iban": "DE12345678901234567890",
        "txt_bic": "BELADEB1BER",
        "chk_bestaetigung_richtigkeit": "yes",
    }

    fill_result_str = fill_pdf_form.invoke(
        {
            "filepath": "complex_form.pdf",
            "field_values": field_values,
            "output_filename": "complex_filled.pdf",
        },
        config=config,
    )

    data = json.loads(fill_result_str)
    assert data["error"] is False
    assert data["status"] == "success"

    output_path = session_dir / "complex_filled.pdf"
    assert output_path.exists()

    reader = PdfReader(str(output_path))
    fields = reader.get_fields()
    assert fields["txt_nachname"]["/V"] == "Schmidt"
    assert fields["txt_kontoinhaber"]["/V"] == "Julia Schmidt"
    assert fields["txt_iban"]["/V"] == "DE12345678901234567890"
    assert fields["chk_geschlecht_w"]["/V"] == "/Yes"
    assert fields["chk_geschlecht_m"]["/V"] == "/Off"
    assert fields["chk_wohnen_allein"]["/V"] == "/Yes"
    assert fields["chk_bezug_wohngeld"]["/V"] == "/Yes"
    assert fields["drp_staatsangehoerigkeit"]["/V"] == "Deutsch"
    assert fields["drp_familienstand"]["/V"] == "Ledig"
    assert fields["drp_kv_status"]["/V"] == "Gesetzlich pflichtversichert"
    assert fields["drp_wohnform"]["/V"] == "Mietwohnung"
    assert fields["chk_bestaetigung_richtigkeit"]["/V"] == "/Yes"


def test_read_and_fill_choice_dropdown_fields(tmp_path, monkeypatch):
    """Verify that read_pdf_form extracts /Opt arrays and fill_pdf_form resolves choices."""
    from tests.utils.pdf_form.create_test_form import create_test_form

    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_choice_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "choice_form.pdf"
    create_test_form(output_path=str(pdf_path))

    config = {"configurable": {"thread_id": session_id}}

    # 1. Test read_pdf_form extracts options
    read_str = read_pdf_form.invoke({"filepath": "choice_form.pdf"}, config=config)
    read_data = json.loads(read_str)
    assert read_data["error"] is False

    fields_by_name = {f["name"]: f for f in read_data["fields"]}
    assert "drp_familienstand" in fields_by_name
    fam_field = fields_by_name["drp_familienstand"]
    assert fam_field["type"] == "/Ch"
    assert "options" in fam_field
    assert "Ledig" in fam_field["options"]
    assert "Geschieden" in fam_field["options"]

    # 2. Test fill_pdf_form resolves 1-based index and case insensitivity
    fill_data = {
        "drp_familienstand": "4",  # index 4 -> "Geschieden"
        "drp_staatsangehoerigkeit": "eu-staatsangehörigkeit",  # case-insensitive
    }
    fill_str = fill_pdf_form.invoke(
        {
            "filepath": "choice_form.pdf",
            "field_values": fill_data,
            "output_filename": "choice_filled.pdf",
        },
        config=config,
    )
    fill_res = json.loads(fill_str)
    assert fill_res["error"] is False
    assert fill_res["status"] == "success"

    reader = PdfReader(str(session_dir / "choice_filled.pdf"))
    fields = reader.get_fields()
    assert fields["drp_familienstand"]["/V"] == "Geschieden"
    assert fields["drp_staatsangehoerigkeit"]["/V"] == "EU-Staatsangehörigkeit"


def test_vermoegen_infobox_text_and_field_separation(tmp_path, monkeypatch):
    """Verify distinct separation of visible page Infobox text and short field tooltips."""
    from tests.utils.pdf_form.create_test_form import create_test_form

    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_vermoegen_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "vermoegen_form.pdf"
    create_test_form(output_path=str(pdf_path))

    config = {"configurable": {"thread_id": session_id}}

    # 1. Verify visible page text contains Infobox explanations for KDU and Vermoegen
    text_res = read_pdf_text_for_form.invoke({"filepath": "vermoegen_form.pdf"}, config=config)
    assert "HINWEIS ZU UNTERKUNFTSKOSTEN, HEIZUNG & HAUSHALTSENERGIE" in text_res
    assert "Haushaltsenergie (Strom/Gas für Beleuchtung & Haushaltsgeräte)" in text_res
    assert "HINWEIS ZUM VERMÖGEN & SCHONVERMÖGEN" in text_res
    assert "Karenzzeit" in text_res
    assert "40.000 €" in text_res

    # 2. Verify read_pdf_form extracts short field tooltips separately
    form_res_str = read_pdf_form.invoke({"filepath": "vermoegen_form.pdf"}, config=config)
    form_data = json.loads(form_res_str)
    fields_by_name = {f["name"]: f for f in form_data["fields"]}

    assert "txt_unterkunft_kaltmiete" in fields_by_name
    assert fields_by_name["txt_unterkunft_kaltmiete"]["description"] == "Monatliche Kaltmiete / Grundmiete in EUR"

    assert "txt_unterkunft_haushaltsenergie" in fields_by_name
    assert "Haushaltsenergie" in fields_by_name["txt_unterkunft_haushaltsenergie"]["description"]

    assert "drp_vermoegen_status" in fields_by_name
    assert fields_by_name["drp_vermoegen_status"]["description"] == "Gesamteinschätzung des Vermögens"

    # 3. Verify filling multi-page form including KDU accommodation & energy costs and Vermögensfelder
    fill_values = {
        "txt_unterkunft_kaltmiete": "550.00",
        "txt_unterkunft_nebenkosten": "120.00",
        "txt_unterkunft_heizkosten": "95.00",
        "drp_warmwasser_art": "2",  # index 2 -> Dezentrale Warmwasserbereitung
        "txt_unterkunft_haushaltsenergie": "85.00",
        "drp_vermoegen_status": "Kein verwertbares Vermögen vorhanden",
        "txt_vermoegen_bargeld_guthaben": "1250.00",
        "chk_vermoegen_pkw": True,
        "txt_vermoegen_pkw_wert": "4500.00",
    }
    fill_res_str = fill_pdf_form.invoke(
        {
            "filepath": "vermoegen_form.pdf",
            "field_values": fill_values,
            "output_filename": "vermoegen_filled.pdf",
        },
        config=config,
    )
    fill_res = json.loads(fill_res_str)
    assert fill_res["status"] == "success"

    r = PdfReader(str(session_dir / "vermoegen_filled.pdf"))
    f_filled = r.get_fields()
    assert f_filled["txt_unterkunft_kaltmiete"]["/V"] == "550.00"
    assert f_filled["txt_unterkunft_haushaltsenergie"]["/V"] == "85.00"
    assert f_filled["drp_warmwasser_art"]["/V"] == "Dezentrale Warmwasserbereitung (Durchlauferhitzer / Boiler)"
    assert f_filled["drp_vermoegen_status"]["/V"] == "Kein verwertbares Vermögen vorhanden"
    assert f_filled["txt_vermoegen_bargeld_guthaben"]["/V"] == "1250.00"
    assert f_filled["chk_vermoegen_pkw"]["/V"] == "/Yes"


def test_model_factory_ollama():
    """Verify model factory instantiates ChatOllama with configured parameters."""
    with patch("src.core.model_factory.ChatOllama") as mock_ollama:
        create_chat_model("gemma4:e4b", temperature=0.0, think_enabled=True, num_ctx=32768)
        mock_ollama.assert_called_once_with(
            model="gemma4:e4b",
            reasoning=True,
            temperature=0.0,
            num_ctx=32768,
        )

    with patch("src.core.model_factory.ChatOllama") as mock_ollama_default:
        create_chat_model()
        mock_ollama_default.assert_called_once_with(
            model="gemma4:e4b",
            reasoning=False,
            temperature=0.0,
            num_ctx=16384,
        )


@pytest.mark.asyncio
async def test_astream_events_reasoning():
    """Test streaming events with reasoning/thinking content blocks."""
    from langchain_core.messages import AIMessage

    from src.core.agent import PDFFormAgent

    agent = PDFFormAgent()

    # Mock the internal agent astream generator
    async def mock_astream(*args, **kwargs):
        msg_thought = AIMessage(
            content="",
            content_blocks=[{"type": "reasoning", "reasoning": "Checking fields..."}],
        )
        msg_token = AIMessage(content="Bitte Vorname eingeben.")
        yield {"type": "messages", "data": (msg_thought, {})}
        yield {"type": "messages", "data": (msg_token, {})}

    agent.agent.astream = mock_astream

    events = []
    async for event in agent.astream_events("Hallo"):
        events.append(event)

    assert len(events) == 2
    assert events[0] == {"event": "thought", "data": "Checking fields..."}
    assert events[1] == {"event": "token", "data": "Bitte Vorname eingeben."}


def test_fastapi_endpoints(tmp_path, monkeypatch):
    """Test FastAPI upload-document, and download endpoints."""
    monkeypatch.setattr("src.api.app.DATA_DIR", tmp_path)
    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    client = TestClient(app)

    # 1. Health check
    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json() == {"status": "ok", "service": "pdf_form_agent"}

    # 2. Upload PDF
    pdf_buffer = io.BytesIO()
    _generate_test_acroform_pdf_bytes(pdf_buffer)
    pdf_buffer.seek(0)

    upload_res = client.post(
        "/api/v1/upload-document",
        data={"thread_id": "api_test_session"},
        files={"file": ("upload_form.pdf", pdf_buffer, "application/pdf")},
    )
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert upload_data["status"] == "ok"
    assert upload_data["filename"] == "upload_form.pdf"
    assert upload_data["fields_summary"]["total_fields"] == 2

    # 3. Download endpoint
    dl_res = client.get("/api/v1/download/api_test_session/upload_form.pdf")
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/pdf"
    assert len(dl_res.content) > 0


def _generate_test_acroform_pdf_bytes(out_buffer: io.BytesIO):
    """Generates PDF bytes with AcroForm fields."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.drawString(50, 750, "Test Form")
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

    for name in ["Vorname", "Nachname"]:
        widget = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Widget"),
                NameObject("/FT"): NameObject("/Tx"),
                NameObject("/T"): TextStringObject(name),
                NameObject("/V"): TextStringObject(""),
                NameObject("/Rect"): ArrayObject(
                    [
                        FloatObject(50),
                        FloatObject(500),
                        FloatObject(200),
                        FloatObject(520),
                    ]
                ),
            }
        )
        ref = writer._add_object(widget)
        page["/Annots"].append(ref)
        writer._root_object["/AcroForm"]["/Fields"].append(ref)

    writer.write(out_buffer)


def test_incremental_sequential_form_filling(tmp_path, monkeypatch):
    """Verify that multiple sequential fill_pdf_form calls accumulate values without data loss."""
    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_inc_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "test_form.pdf"

    # Create 2-field test form
    buf = io.BytesIO()
    _generate_test_acroform_pdf_bytes(buf)
    pdf_path.write_bytes(buf.getvalue())

    config = {"configurable": {"thread_id": session_id}}

    # 1. First step: fill Vorname
    res1_str = fill_pdf_form.invoke(
        {
            "filepath": "test_form.pdf",
            "field_values": {"Vorname": "Erika"},
            "output_filename": "test_form.pdf",
        },
        config=config,
    )
    res1 = json.loads(res1_str)
    assert res1["error"] is False
    assert res1["filled_fields"] == 1

    # 2. Second step: fill Nachname on the already modified test_form.pdf
    res2_str = fill_pdf_form.invoke(
        {
            "filepath": "test_form.pdf",
            "field_values": {"Nachname": "Mustermann"},
            "output_filename": "test_form.pdf",
        },
        config=config,
    )
    res2 = json.loads(res2_str)
    assert res2["error"] is False
    assert res2["filled_fields"] == 2

    # Verify both fields are filled in the final PDF
    reader = PdfReader(str(pdf_path))
    fields = reader.get_fields()
    assert fields["Vorname"]["/V"] == "Erika"
    assert fields["Nachname"]["/V"] == "Mustermann"


def test_checkbox_freetext_and_falsy_normalization(tmp_path, monkeypatch):
    """Verify that affirmative free-text maps to /Yes and falsy inputs map to /Off for checkboxes."""
    from tests.utils.pdf_form.create_test_form import create_test_form

    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_freetext_btn_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "checkbox_test.pdf"
    create_test_form(output_path=str(pdf_path))

    config = {"configurable": {"thread_id": session_id}}

    field_values = {
        # Affirmative free-text / truthy inputs -> /Yes
        "chk_geschlecht_m": "männlich",
        "chk_wohnen_allein": "allein",
        "chk_bezug_alg": "ja",
        "chk_bezug_krankengeld": "zutreffend",
        "chk_bezug_kindergeld": "checked",
        "chk_bezug_wohngeld": True,
        # Falsy inputs -> /Off
        "chk_geschlecht_w": "nein",
        "chk_geschlecht_d": False,
        "chk_bestaetigung_richtigkeit": "0",
        "chk_einwilligung_daten": "off",
    }

    fill_result_str = fill_pdf_form.invoke(
        {
            "filepath": "checkbox_test.pdf",
            "field_values": field_values,
            "output_filename": "checkbox_filled.pdf",
        },
        config=config,
    )
    data = json.loads(fill_result_str)
    assert data["error"] is False
    assert data["status"] == "success"

    output_path = session_dir / "checkbox_filled.pdf"
    assert output_path.exists()

    reader = PdfReader(str(output_path))
    fields = reader.get_fields()
    assert fields["chk_geschlecht_m"]["/V"] == "/Yes"
    assert fields["chk_wohnen_allein"]["/V"] == "/Yes"
    assert fields["chk_bezug_alg"]["/V"] == "/Yes"
    assert fields["chk_bezug_krankengeld"]["/V"] == "/Yes"
    assert fields["chk_bezug_kindergeld"]["/V"] == "/Yes"
    assert fields["chk_bezug_wohngeld"]["/V"] == "/Yes"

    assert fields["chk_geschlecht_w"]["/V"] == "/Off"
    assert fields["chk_geschlecht_d"]["/V"] == "/Off"
    assert fields["chk_bestaetigung_richtigkeit"]["/V"] == "/Off"
    assert fields["chk_einwilligung_daten"]["/V"] == "/Off"


def test_hierarchical_radio_group_resolution(tmp_path, monkeypatch):
    """Verify discovery and filling of hierarchical radio groups in real-world PDF forms."""
    import shutil

    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_radio_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)

    src_pdf = PROJECT_ROOT / "data" / "input" / "pdfs" / "antrag-sgb2_ba042689.pdf"
    if not src_pdf.exists():
        pytest.skip("Reference PDF antrag-sgb2_ba042689.pdf not found in data/input/pdfs/")

    dst_pdf = session_dir / "antrag.pdf"
    shutil.copyfile(src_pdf, dst_pdf)

    config = {"configurable": {"thread_id": session_id}}

    # 1. Test read_pdf_form discovers options for radio groups
    read_str = read_pdf_form.invoke({"filepath": "antrag.pdf"}, config=config)
    read_data = json.loads(read_str)
    assert read_data["error"] is False
    fields_by_name = {f["name"]: f for f in read_data["fields"]}
    assert "rbtnWohnsitz" in fields_by_name
    assert "options" in fields_by_name["rbtnWohnsitz"]
    assert fields_by_name["rbtnWohnsitz"]["options"] == ["ja", "nein"]

    # 2. Test filling radio buttons:
    # - rbtnWohnsitz with "nein" (option 2 -> state /1)
    # - rbtnBetreuer with "ja" (option 1 prefix -> state /0)
    fill_values = {
        "rbtnWohnsitz": "nein",
        "rbtnBetreuer": "ja",
    }
    fill_result_str = fill_pdf_form.invoke(
        {
            "filepath": "antrag.pdf",
            "field_values": fill_values,
            "output_filename": "antrag_filled.pdf",
        },
        config=config,
    )
    fill_data = json.loads(fill_result_str)
    assert fill_data["error"] is False
    assert fill_data["status"] == "success"

    output_path = session_dir / "antrag_filled.pdf"
    assert output_path.exists()

    reader = PdfReader(str(output_path))
    fields = reader.get_fields()

    # Verify rbtnWohnsitz parent field value & child widget appearance states
    assert fields["rbtnWohnsitz"]["/V"] == "/1"
    wohnsitz_kids = fields["rbtnWohnsitz"]["/Kids"]
    assert wohnsitz_kids[0].get_object()["/AS"] == "/Off"
    assert wohnsitz_kids[1].get_object()["/AS"] == "/1"

    # Verify rbtnBetreuer parent field value & child widget appearance states
    assert fields["rbtnBetreuer"]["/V"] == "/0"
    betreuer_kids = fields["rbtnBetreuer"]["/Kids"]
    assert betreuer_kids[0].get_object()["/AS"] == "/0"
    assert betreuer_kids[1].get_object()["/AS"] == "/Off"


def test_create_test_form_2_pure_choice_and_checkboxes(tmp_path, monkeypatch):
    """Verify test_form_2 generator creates a form strictly with /Btn and /Ch fields (zero /Tx)."""
    from tests.utils.pdf_form.create_test_form_2 import create_test_form_2

    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_form2_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "test_form_2.pdf"

    create_test_form_2(output_path=str(pdf_path))
    assert pdf_path.exists()

    config = {"configurable": {"thread_id": session_id}}

    # 1. Read fields and assert zero /Tx text fields
    read_str = read_pdf_form.invoke({"filepath": "test_form_2.pdf"}, config=config)
    read_data = json.loads(read_str)
    assert read_data["error"] is False
    fields = read_data["fields"]
    assert len(fields) == 25

    field_types = {f["type"] for f in fields}
    assert "/Tx" not in field_types
    assert field_types == {"/Ch", "/Btn"}

    # 2. Test filling dropdowns, checkboxes, and radio buttons
    fill_values = {
        "drp_erwerbsstatus": "1",  # 1 -> "Vollzeit beschäftigt"
        "drp_wohnform": "Mietwohnung",
        "chk_mehrbedarf_alleinerziehend": "ja",
        "chk_bezug_kindergeld": True,
        "chk_but_schulbedarf": "angekreuzt",
        "rbtn_alleinwohnen": "nein",  # option 2 -> /1
        "rbtn_datenschutz_einwilligung": "ja, ich willige ein",  # option 1 -> /0
    }
    fill_result_str = fill_pdf_form.invoke(
        {
            "filepath": "test_form_2.pdf",
            "field_values": fill_values,
            "output_filename": "test_form_2_filled.pdf",
        },
        config=config,
    )
    fill_data = json.loads(fill_result_str)
    assert fill_data["error"] is False
    assert fill_data["status"] == "success"

    # 3. Verify filled output
    reader = PdfReader(str(session_dir / "test_form_2_filled.pdf"))
    f = reader.get_fields()
    assert f["drp_erwerbsstatus"]["/V"] == "Vollzeit beschäftigt"
    assert f["drp_wohnform"]["/V"] == "Mietwohnung"
    assert f["chk_mehrbedarf_alleinerziehend"]["/V"] == "/Yes"
    assert f["chk_bezug_kindergeld"]["/V"] == "/Yes"
    assert f["chk_but_schulbedarf"]["/V"] == "/Yes"
    assert f["rbtn_alleinwohnen"]["/V"] == "/1"
    assert f["rbtn_datenschutz_einwilligung"]["/V"] == "/0"


def test_unicode_umlauts_and_escape_sequence_cleaning(tmp_path, monkeypatch):
    """Verify that raw unicode escape sequences (e.g. \\u00e4) are cleaned and German umlauts are preserved."""
    from tests.utils.pdf_form.create_test_form_2 import create_test_form_2

    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_unicode_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "test_form_2.pdf"
    create_test_form_2(output_path=str(pdf_path))

    config = {"configurable": {"thread_id": session_id}}

    # 1. read_pdf_form returns actual UTF-8 umlauts, not escaped \u00xx
    read_str = read_pdf_form.invoke({"filepath": "test_form_2.pdf"}, config=config)
    assert r"\u00e4" not in read_str
    assert "Erwerbsunfähig" in read_str
    assert "beschäftigt" in read_str

    # 2. fill_pdf_form with literal raw escaped string r"Erwerbsunf\u00e4hig"
    fill_values = {
        "drp_erwerbsstatus": r"Erwerbsunf\u00e4hig",
        "chk_bezug_bafoeg": True,
    }
    fill_res_str = fill_pdf_form.invoke(
        {
            "filepath": "test_form_2.pdf",
            "field_values": fill_values,
            "output_filename": "test_form_2_umlaut.pdf",
        },
        config=config,
    )
    fill_data = json.loads(fill_res_str)
    assert fill_data["error"] is False
    assert fill_data["status"] == "success"
    assert fill_data["written_values"]["drp_erwerbsstatus"] == "Erwerbsunfähig"

    # 3. Verify PDF field content
    reader = PdfReader(str(session_dir / "test_form_2_umlaut.pdf"))
    fields = reader.get_fields()
    assert fields["drp_erwerbsstatus"]["/V"] == "Erwerbsunfähig"
    assert r"\u00e4" not in str(fields["drp_erwerbsstatus"]["/V"])


def test_create_test_form_3_compact_all_cases(tmp_path, monkeypatch):
    """Verify test_form_3 generator creates a compact 6-field form covering /Tx, /Ch, /Btn Radio, and /Btn Checkbox."""
    from tests.utils.pdf_form.create_test_form_3 import create_test_form_3

    monkeypatch.setattr("src.core.tools.DATA_DIR", tmp_path)

    session_id = "test_form3_session"
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True)
    pdf_path = session_dir / "test_form_3.pdf"

    create_test_form_3(output_path=str(pdf_path))
    assert pdf_path.exists()

    config = {"configurable": {"thread_id": session_id}}

    # 1. Read fields and assert exactly 8 fields covering all types
    read_str = read_pdf_form.invoke({"filepath": "test_form_3.pdf"}, config=config)
    read_data = json.loads(read_str)
    assert read_data["error"] is False
    assert read_data["total_fields"] == 8
    assert read_data["filled_fields"] == 0

    field_map = {f["name"]: f for f in read_data["fields"]}
    assert field_map["txt_name"]["type"] == "/Tx"
    assert field_map["txt_geburtsdatum"]["type"] == "/Tx"
    assert field_map["txt_gehalt"]["type"] == "/Tx"
    assert field_map["drp_familienstand"]["type"] == "/Ch"
    assert field_map["drp_familienstand"]["options"] == ["ledig", "verheiratet", "geschieden", "verwitwet"]
    assert field_map["rbtn_erwerbstaetig"]["type"] == "/Btn"
    assert field_map["txt_iban"]["type"] == "/Tx"
    assert field_map["chk_newsletter"]["type"] == "/Btn"
    assert field_map["chk_datenschutz"]["type"] == "/Btn"

    # 2. Verify text extraction
    text_content = read_pdf_text_for_form.invoke({"filepath": "test_form_3.pdf"}, config=config)
    assert "Kompaktes Formular – Schnelltest" in text_content
    assert "Vollständiger Name:" in text_content
    assert "Monatl. Gehalt (€):" in text_content
    assert "Sind Sie aktuell erwerbstätig?" in text_content
    assert "IBAN:" in text_content

    # 3. Fill form covering all edge cases:
    # - /Tx: Umlauts & Date
    # - /Ch: Dropdown match
    # - /Btn Radio: "nein" activates child /1 (NOT /Off!)
    # - /Btn Checkbox: "nein" leaves checkbox blank (/Off)
    # - /Btn Checkbox: "ja" activates checkbox (/Yes)
    fill_values = {
        "txt_name": "Erika Mustermann-Müller",
        "txt_geburtsdatum": "12.08.1992",
        "drp_familienstand": "ledig",
        "txt_gehalt": "2.850,50 €",
        "rbtn_erwerbstaetig": "nein",
        "txt_iban": "DE89 3704 0044 0532 0130 00",
        "chk_newsletter": "nein",
        "chk_datenschutz": "ja",
    }
    fill_res_str = fill_pdf_form.invoke(
        {
            "filepath": "test_form_3.pdf",
            "field_values": fill_values,
            "output_filename": "test_form_3_filled.pdf",
        },
        config=config,
    )
    fill_data = json.loads(fill_res_str)
    assert fill_data["error"] is False
    assert fill_data["status"] == "success"

    # 4. Verify filled PDF values
    filled_reader = PdfReader(str(session_dir / "test_form_3_filled.pdf"))
    f = filled_reader.get_fields()
    assert f["txt_name"]["/V"] == "Erika Mustermann-Müller"
    assert f["txt_geburtsdatum"]["/V"] == "12.08.1992"
    assert f["drp_familienstand"]["/V"] == "ledig"
    assert f["txt_gehalt"]["/V"] == "2.850,50 €"
    assert f["rbtn_erwerbstaetig"]["/V"] == "/1"
    assert f["txt_iban"]["/V"] == "DE89 3704 0044 0532 0130 00"
    assert f["chk_newsletter"]["/V"] == "/Off"
    assert f["chk_datenschutz"]["/V"] == "/Yes"


def test_inspect_pdf_security_threat_detection(tmp_path):
    """Verify inspect_pdf_security correctly detects /Launch, /JavaScript and clean files."""
    # 1. Clean PDF form
    clean_path = tmp_path / "clean.pdf"
    _generate_test_acroform_pdf(clean_path)
    clean_threats = inspect_pdf_security(clean_path)
    assert clean_threats == []

    # 2. PDF with /OpenAction /Launch
    writer_launch = PdfWriter()
    writer_launch.add_blank_page(width=100, height=100)
    launch_action = DictionaryObject()
    launch_action[NameObject("/S")] = NameObject("/Launch")
    launch_action[NameObject("/F")] = TextStringObject("powershell.exe")
    writer_launch.root_object[NameObject("/OpenAction")] = launch_action

    buf_launch = io.BytesIO()
    writer_launch.write(buf_launch)
    launch_threats = inspect_pdf_security(buf_launch.getvalue())
    assert any("Unsafe /OpenAction (/Launch)" in t for t in launch_threats)

    # 3. PDF with /Names/JavaScript
    writer_js = PdfWriter()
    writer_js.add_blank_page(width=100, height=100)
    names_dict = DictionaryObject()
    names_dict[NameObject("/JavaScript")] = DictionaryObject()
    writer_js.root_object[NameObject("/Names")] = names_dict

    buf_js = io.BytesIO()
    writer_js.write(buf_js)
    js_threats = inspect_pdf_security(buf_js.getvalue())
    assert any("Document-level JavaScript detected" in t for t in js_threats)

    # 4. Malformed bytes
    malformed_threats = inspect_pdf_security(b"corrupt_non_pdf_data")
    assert any("Malformed or unparseable" in t for t in malformed_threats)


def test_summarization_prompt_loading_and_fallback(tmp_path, monkeypatch):
    """Verify summarization prompt loading, structure, and fallback mechanism."""
    from src.prompts import (
        _DEFAULT_SUMMARIZATION_FALLBACK_PROMPT,
        SUMMARIZATION_PROMPT,
        load_prompt,
    )

    # 1. Verify loaded prompt contents
    assert "## SESSION INTENT" in SUMMARIZATION_PROMPT
    assert "## CONFIRMED FORM FIELDS" in SUMMARIZATION_PROMPT
    assert "## USER CONSTRAINTS & REVISIONS" in SUMMARIZATION_PROMPT
    assert "## PENDING STEPS" in SUMMARIZATION_PROMPT
    assert "{messages}" in SUMMARIZATION_PROMPT

    # 2. Verify fallback when file is missing
    monkeypatch.setattr("src.prompts.PROMPTS_DIR", tmp_path)
    fallback_prompt = load_prompt("summarization")
    assert fallback_prompt == _DEFAULT_SUMMARIZATION_FALLBACK_PROMPT
    assert "## CONFIRMED FORM FIELDS" in fallback_prompt


def test_summarization_middleware_file_offload(tmp_path):
    """Verify PDFFormSummarizationMiddleware securely offloads pruned messages to disk."""
    from langchain_core.language_models.fake_chat_models import FakeListChatModel
    from langchain_core.messages import AIMessage, HumanMessage

    from src.core.agent import PDFFormSummarizationMiddleware

    history_dir = tmp_path / "conv_history"
    model = FakeListChatModel(responses=["Test Summary"])

    middleware = PDFFormSummarizationMiddleware(
        model=model,
        trigger=[("messages", 2)],
        keep=("messages", 1),
        offload_to_file=True,
        history_dir=history_dir,
    )

    messages_to_prune = [
        HumanMessage(content="User input for name"),
        AIMessage(content="Assistant response confirming name"),
    ]

    # Test file writing
    middleware._offload_messages_to_file(messages_to_prune)

    # Default thread_id fallback when outside LangGraph context
    archive_file = history_dir / "default_archive.md"
    assert archive_file.exists()
    content = archive_file.read_text(encoding="utf-8")
    assert "## Archived Messages -" in content
    assert "User input for name" in content
    assert "Assistant response confirming name" in content


@pytest.mark.asyncio
async def test_agent_summarization_end_to_end(tmp_path):
    """Verify end-to-end context summarization, message pruning, and stream filtering."""
    from langchain_core.language_models.fake_chat_models import FakeListChatModel
    from langchain_core.messages import AIMessage, HumanMessage
    from langgraph.checkpoint.memory import MemorySaver

    from src.core.agent import PDFFormAgent, PDFFormSummarizationMiddleware

    class FakeChatModelWithTools(FakeListChatModel):
        def bind_tools(self, tools, **kwargs):
            return self

    history_dir = tmp_path / "hist"
    # Responses:
    # Turn 1: Assistant greeting
    # Turn 2: Assistant asking Vorname
    # Turn 3: Triggers summarization middleware -> returns Summary, then Assistant confirms
    llm = FakeChatModelWithTools(
        responses=[
            "Hello, let's fill your PDF form.",
            "Please tell me your first name.",
            "## SESSION INTENT\nFilling registration form.\n## CONFIRMED FORM FIELDS\nNone",
            "Thank you! Your name is saved.",
        ]
    )

    middleware = PDFFormSummarizationMiddleware(
        model=llm,
        trigger=[("messages", 4)],
        keep=("messages", 2),
        offload_to_file=True,
        history_dir=history_dir,
    )

    agent = PDFFormAgent(
        checkpointer=MemorySaver(),
        custom_middleware=[middleware],
        llm=llm,
    )

    session_id = "test_sess_42"

    # Turn 1
    events1 = [
        ev
        async for ev in agent.astream_events(
            "Start form", thread_id=session_id
        )
    ]
    assert any(ev.get("event") == "token" for ev in events1)

    # Turn 2
    events2 = [
        ev
        async for ev in agent.astream_events(
            "I'm ready", thread_id=session_id
        )
    ]
    assert any(ev.get("event") == "token" for ev in events2)

    # Turn 3: 4 prior messages now exist (Human 1, AI 1, Human 2, AI 2).
    # Adding 5th message triggers summarization!
    events3 = [
        ev
        async for ev in agent.astream_events(
            "My name is Danny", thread_id=session_id
        )
    ]
    # Verify token stream yielded content for the agent turn
    tokens = [ev["data"] for ev in events3 if ev.get("event") == "token"]
    combined_tokens = "".join(tokens)
    assert "Thank you!" in combined_tokens

    # Verify state in checkpointer
    state = agent.agent.get_state({"configurable": {"thread_id": session_id}})
    messages = state.values["messages"]

    # First message in state should be the summary HumanMessage
    assert isinstance(messages[0], HumanMessage)
    assert "summary of the conversation" in messages[0].content.lower()

    # Offloaded archive should exist
    archive_file = history_dir / f"{session_id}_archive.md"
    assert archive_file.exists()
    archive_content = archive_file.read_text(encoding="utf-8")
    assert "## Archived Messages -" in archive_content
    assert "Start form" in archive_content




