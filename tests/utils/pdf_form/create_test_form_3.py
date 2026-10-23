"""
Kompaktes All-in-One Testformular (test_form_3.pdf) Generator für PDF Form Agent.
Erzeugt ein kurzes, 1-seitiges Referenzformular mit genau 8 Feldern, das alle
relevanten Formular- und Befüllungsszenarien abdeckt:
1. /Tx: Standard-Freitextfeld mit Umlauten (z. B. "Max Müller")
2. /Tx: Strukturiertes Datums-/Ziffernfeld (TT.MM.JJJJ)
3. /Tx: Währungs-/Gehaltsfeld (z. B. "2500,00 €" bzw. Negativbetrag-Prüfung)
4. /Ch: Dropdown / ComboBox mit /Opt ("ledig", "verheiratet", etc.)
5. /Btn: 1-aus-N Radio-Button-Gruppe mit "Ja" (/0) und "Nein" (/1)
6. /Tx: IBAN-Bankverbindungsfeld (ISO 7064 Modulo-97 Prüfung & Stammdaten-Autofill)
7. /Btn: Standalone 2-State Checkbox (z. B. Newsletter -> Nein = leer / /Off)
8. /Btn: Standalone 2-State Checkbox (z. B. Datenschutz -> Ja = Häkchen / /Yes)
"""

import io
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject,
    ByteStringObject,
    DecodedStreamObject,
    DictionaryObject,
    FloatObject,
    NameObject,
    NumberObject,
    TextStringObject,
)
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def _create_checkbox_appearance(writer: PdfWriter, size: float = 12.0) -> DictionaryObject:
    """Creates ISO 32000-1 appearance streams for /Btn checkbox widgets."""
    off_stream = DecodedStreamObject()
    off_stream._data = b""
    off_stream[NameObject("/Type")] = NameObject("/XObject")
    off_stream[NameObject("/Subtype")] = NameObject("/Form")
    off_stream[NameObject("/BBox")] = ArrayObject([
        FloatObject(0), FloatObject(0), FloatObject(size), FloatObject(size)
    ])
    off_ref = writer._add_object(off_stream)

    yes_stream = DecodedStreamObject()
    yes_stream._data = (
        b"q 0 0 12 12 re W n "
        b"0.1 0.15 0.25 RG 1.5 w "
        b"2 2 m 10 10 l 2 10 m 10 2 l S Q"
    )
    yes_stream[NameObject("/Type")] = NameObject("/XObject")
    yes_stream[NameObject("/Subtype")] = NameObject("/Form")
    yes_stream[NameObject("/BBox")] = ArrayObject([
        FloatObject(0), FloatObject(0), FloatObject(size), FloatObject(size)
    ])
    yes_ref = writer._add_object(yes_stream)

    return DictionaryObject({
        NameObject("/N"): DictionaryObject({
            NameObject("/Off"): off_ref,
            NameObject("/Yes"): yes_ref,
        })
    })


def _create_radio_appearance(writer: PdfWriter, state_key: str, size: float = 12.0) -> DictionaryObject:
    """Creates ISO 32000-1 appearance streams for /Btn radio child widgets."""
    off_stream = DecodedStreamObject()
    off_stream._data = b""
    off_stream[NameObject("/Type")] = NameObject("/XObject")
    off_stream[NameObject("/Subtype")] = NameObject("/Form")
    off_stream[NameObject("/BBox")] = ArrayObject([
        FloatObject(0), FloatObject(0), FloatObject(size), FloatObject(size)
    ])
    off_ref = writer._add_object(off_stream)

    on_stream = DecodedStreamObject()
    on_stream._data = (
        b"q 0 0 12 12 re W n "
        b"0.1 0.15 0.25 rg "
        b"3 3 6 6 re f Q"
    )
    on_stream[NameObject("/Type")] = NameObject("/XObject")
    on_stream[NameObject("/Subtype")] = NameObject("/Form")
    on_stream[NameObject("/BBox")] = ArrayObject([
        FloatObject(0), FloatObject(0), FloatObject(size), FloatObject(size)
    ])
    on_ref = writer._add_object(on_stream)

    return DictionaryObject({
        NameObject("/N"): DictionaryObject({
            NameObject("/Off"): off_ref,
            NameObject(state_key): on_ref,
        })
    })


def create_test_form_3(output_path: str = "data/input/pdfs/test_form_3.pdf") -> str:
    """Generates a compact 1-page test PDF with exactly 8 fields covering all AcroForm scenarios."""
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4  # 595.27 x 841.89 pt

    # Design palette
    c_primary = HexColor("#0f172a")    # Slate 900
    c_secondary = HexColor("#475569")  # Slate 600
    c_line = HexColor("#cbd5e1")       # Slate 300
    c_box_border = HexColor("#94a3b8") # Slate 400
    c_info_bg = HexColor("#f8fafc")    # Slate 50

    # Header
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(c_primary)
    c.drawString(45, height - 42, "Kompaktes Formular – Schnelltest (test_form_3.pdf)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)
    c.drawString(45, height - 55, "Referenzbogen mit allen Feldtypen: Freitext, Datum, Dropdown, Radio-Gruppe und Checkboxen")

    c.setStrokeColor(c_line)
    c.setLineWidth(1)
    c.line(45, height - 64, width - 45, height - 64)

    # Info-Kasten
    c.setFillColor(c_info_bg)
    c.setStrokeColor(c_box_border)
    c.setLineWidth(0.8)
    c.rect(45, height - 122, width - 90, 48, stroke=1, fill=1)

    c.setFillColor(c_primary)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(53, height - 82, "HINWEIS FÜR DIE TESTDURCHFÜHRUNG:")
    c.setFont("Helvetica", 7.8)
    c.setFillColor(c_secondary)
    c.drawString(53, height - 94, "• Dieses Formular dient dem schnellen Testen aller Ausfüll-Fälle in unter 2 Minuten.")
    c.drawString(53, height - 106, "• Erfasst werden /Tx (Name, Datum, Gehalt, IBAN), /Ch (Familienstand), /Btn Radio (Ja/Nein) und /Btn Checkbox (Newsletter, Datenschutz).")
    c.drawString(53, height - 118, "• Es prüft Währungs- & IBAN-Validierung (ISO 7064 Modulo-97), Autofill, Radio-Buttons und Checkboxen.")

    # 1. Abschnitt: Persönliche Angaben (/Tx)
    y_sec1 = height - 146
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec1, "1. Persönliche Angaben (/Tx Textfelder)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_r1 = y_sec1 - 22
    c.drawString(45, y_r1, "Vollständiger Name:")
    c.drawString(330, y_r1, "Geburtsdatum (TT.MM.JJJJ):")

    # 2. Abschnitt: Status & Auswahl (/Ch Dropdown & /Btn Radio-Gruppe)
    y_sec2 = y_sec1 - 64
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec2, "2. Status & Auswahl (/Ch Dropdown & /Btn Radio-Gruppe)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_r2 = y_sec2 - 22
    c.drawString(45, y_r2, "Familienstand [▼]:")
    c.drawString(330, y_r2, "Monatl. Gehalt (€):")

    y_r3 = y_sec2 - 50
    c.drawString(45, y_r3, "Sind Sie aktuell erwerbstätig?")
    c.setStrokeColor(c_box_border)
    c.rect(230, y_r3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(246, y_r3 + 1, "Ja")
    c.rect(280, y_r3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(296, y_r3 + 1, "Nein")
    c.drawString(330, y_r3, "IBAN:")

    # 3. Abschnitt: Optionen & Bestätigungen (/Btn Checkboxen)
    y_sec3 = y_sec2 - 92
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec3, "3. Optionen & Bestätigungen (/Btn Checkboxen)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_c1 = y_sec3 - 22
    c.rect(45, y_c1 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_c1 + 1, "Ich möchte den monatlichen Newsletter per E-Mail erhalten (optional)")

    y_c2 = y_sec3 - 44
    c.rect(45, y_c2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_c2 + 1, "Ich willige in die Datenschutzerklärung und elektronische Verarbeitung ein (erforderlich)")

    # Footer
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawString(45, 25, "PDF Form Agent – Kompaktes Schnelltest-Referenzformular (test_form_3.pdf)")

    c.save()
    buffer.seek(0)

    # =============================================================
    # Step 2: AcroForm-Felder via pypdf injizieren
    # =============================================================
    reader = PdfReader(buffer)
    writer = PdfWriter()
    writer.add_page(reader.pages[0])

    writer._root_object[NameObject("/AcroForm")] = DictionaryObject({
        NameObject("/Fields"): ArrayObject(),
        NameObject("/NeedAppearances"): NameObject("/true"),
    })

    page = writer.pages[0]
    if "/Annots" not in page:
        page[NameObject("/Annots")] = ArrayObject()

    # 1. Textfelder (/Tx)
    # txt_name: x=145, y=y_r1 - 4, w=170, h=16
    txt_name_widget = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Tx"),
        NameObject("/T"): TextStringObject("txt_name"),
        NameObject("/TU"): TextStringObject("Vollständiger Name des Antragstellers (Vor- und Nachname)"),
        NameObject("/Ff"): NumberObject(0),
        NameObject("/V"): TextStringObject(""),
        NameObject("/Rect"): ArrayObject([
            FloatObject(145), FloatObject(y_r1 - 4),
            FloatObject(315), FloatObject(y_r1 + 12),
        ]),
        NameObject("/DA"): ByteStringObject(b"/Helv 8.5 Tf 0 g"),
    })
    txt_name_ref = writer._add_object(txt_name_widget)
    page["/Annots"].append(txt_name_ref)
    writer._root_object["/AcroForm"]["/Fields"].append(txt_name_ref)

    # txt_geburtsdatum: x=460, y=y_r1 - 4, w=90, h=16
    txt_geb_widget = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Tx"),
        NameObject("/T"): TextStringObject("txt_geburtsdatum"),
        NameObject("/TU"): TextStringObject("Geburtsdatum im Format TT.MM.JJJJ"),
        NameObject("/Ff"): NumberObject(0),
        NameObject("/V"): TextStringObject(""),
        NameObject("/Rect"): ArrayObject([
            FloatObject(460), FloatObject(y_r1 - 4),
            FloatObject(550), FloatObject(y_r1 + 12),
        ]),
        NameObject("/DA"): ByteStringObject(b"/Helv 8.5 Tf 0 g"),
    })
    txt_geb_ref = writer._add_object(txt_geb_widget)
    page["/Annots"].append(txt_geb_ref)
    writer._root_object["/AcroForm"]["/Fields"].append(txt_geb_ref)

    # 2. Dropdown (/Ch)
    opts_familienstand = ["ledig", "verheiratet", "geschieden", "verwitwet"]
    drp_fam_widget = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Ch"),
        NameObject("/T"): TextStringObject("drp_familienstand"),
        NameObject("/TU"): TextStringObject("Familienstand des Antragstellers"),
        NameObject("/Ff"): NumberObject(131072),  # Combo
        NameObject("/Opt"): ArrayObject([TextStringObject(opt) for opt in opts_familienstand]),
        NameObject("/V"): TextStringObject(""),
        NameObject("/Rect"): ArrayObject([
            FloatObject(145), FloatObject(y_r2 - 4),
            FloatObject(315), FloatObject(y_r2 + 12),
        ]),
        NameObject("/DA"): ByteStringObject(b"/Helv 8.5 Tf 0 g"),
    })
    drp_fam_ref = writer._add_object(drp_fam_widget)
    page["/Annots"].append(drp_fam_ref)
    writer._root_object["/AcroForm"]["/Fields"].append(drp_fam_ref)

    # 3. Währungs-/Gehaltsfeld (/Tx)
    # txt_gehalt: x=460, y=y_r2 - 4, w=90, h=16
    txt_gehalt_widget = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Tx"),
        NameObject("/T"): TextStringObject("txt_gehalt"),
        NameObject("/TU"): TextStringObject("Monatliches Netto-Gehalt in Euro"),
        NameObject("/Ff"): NumberObject(0),
        NameObject("/V"): TextStringObject(""),
        NameObject("/Rect"): ArrayObject([
            FloatObject(460), FloatObject(y_r2 - 4),
            FloatObject(550), FloatObject(y_r2 + 12),
        ]),
        NameObject("/DA"): ByteStringObject(b"/Helv 8.5 Tf 0 g"),
    })
    txt_gehalt_ref = writer._add_object(txt_gehalt_widget)
    page["/Annots"].append(txt_gehalt_ref)
    writer._root_object["/AcroForm"]["/Fields"].append(txt_gehalt_ref)

    # 4. Radio Group (/Btn) - Erwerbstätig [ja, nein]
    radio_opts = ["ja", "nein"]
    radio_positions = [(230, y_r3 - 2), (280, y_r3 - 2)]
    parent_radio = DictionaryObject({
        NameObject("/FT"): NameObject("/Btn"),
        NameObject("/T"): TextStringObject("rbtn_erwerbstaetig"),
        NameObject("/TU"): TextStringObject("Aktuelle Erwerbstätigkeit (Ja oder Nein)"),
        NameObject("/Ff"): NumberObject(49152),  # 32768 (Radio) | 16384 (NoToggleToOff)
        NameObject("/Opt"): ArrayObject([TextStringObject(opt) for opt in radio_opts]),
        NameObject("/_States_"): ArrayObject([NameObject(f"/{i}") for i in range(len(radio_opts))]),
        NameObject("/V"): NameObject("/Off"),
        NameObject("/Kids"): ArrayObject(),
    })
    parent_radio_ref = writer._add_object(parent_radio)

    for i, (rx, ry) in enumerate(radio_positions):
        state_key = f"/{i}"
        ap_dict = _create_radio_appearance(writer, state_key=state_key, size=12.0)
        child_widget = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Parent"): parent_radio_ref,
            NameObject("/Rect"): ArrayObject([
                FloatObject(rx), FloatObject(ry),
                FloatObject(rx + 12), FloatObject(ry + 12),
            ]),
            NameObject("/AP"): ap_dict,
            NameObject("/AS"): NameObject("/Off"),
        })
        child_ref = writer._add_object(child_widget)
        parent_radio["/Kids"].append(child_ref)
        page["/Annots"].append(child_ref)

    writer._root_object["/AcroForm"]["/Fields"].append(parent_radio_ref)

    # 5. IBAN-Feld (/Tx)
    # txt_iban: x=370, y=y_r3 - 4, w=180, h=16
    txt_iban_widget = DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Widget"),
        NameObject("/FT"): NameObject("/Tx"),
        NameObject("/T"): TextStringObject("txt_iban"),
        NameObject("/TU"): TextStringObject("IBAN des Antragstellers"),
        NameObject("/Ff"): NumberObject(0),
        NameObject("/V"): TextStringObject(""),
        NameObject("/Rect"): ArrayObject([
            FloatObject(370), FloatObject(y_r3 - 4),
            FloatObject(550), FloatObject(y_r3 + 12),
        ]),
        NameObject("/DA"): ByteStringObject(b"/Helv 8.5 Tf 0 g"),
    })
    txt_iban_ref = writer._add_object(txt_iban_widget)
    page["/Annots"].append(txt_iban_ref)
    writer._root_object["/AcroForm"]["/Fields"].append(txt_iban_ref)

    # 6. Checkboxen (/Btn)
    checkbox_defs = [
        ("chk_newsletter", "Einwilligung zum Erhalt des monatlichen Newsletters (optional)", 45, y_c1 - 2),
        ("chk_datenschutz", "Einwilligung in die Datenschutzerklärung und Datenverarbeitung", 45, y_c2 - 2),
    ]

    for f_name, f_tu, cx, cy in checkbox_defs:
        ap_dict = _create_checkbox_appearance(writer, size=12.0)
        cb_widget = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject(f_name),
            NameObject("/TU"): TextStringObject(f_tu),
            NameObject("/Ff"): NumberObject(0),
            NameObject("/V"): NameObject("/Off"),
            NameObject("/AS"): NameObject("/Off"),
            NameObject("/AP"): ap_dict,
            NameObject("/Rect"): ArrayObject([
                FloatObject(cx), FloatObject(cy),
                FloatObject(cx + 12), FloatObject(cy + 12),
            ]),
        })
        cb_ref = writer._add_object(cb_widget)
        page["/Annots"].append(cb_ref)
        writer._root_object["/AcroForm"]["/Fields"].append(cb_ref)

    writer.add_metadata({
        "/Title": "Kompaktes Schnelltest-Referenzformular (test_form_3.pdf)",
        "/Author": "PDF Form Agent Test Suite",
    })

    with open(out_file, "wb") as f:
        writer.write(f)

    # Verifikation
    r = PdfReader(str(out_file))
    fields = r.get_fields() or {}
    print(f"'{out_file}' erfolgreich generiert ({len(r.pages)} Seite, {len(fields)} Felder):")
    types_count = {}
    for name, info in fields.items():
        ft = str(info.get("/FT"))
        types_count[ft] = types_count.get(ft, 0) + 1
        opts_info = f" [Opts: {len(info.get('/Opt', []))}]" if "/Opt" in info else ""
        print(f"  - [{ft}] {name}: {info.get('/TU')}{opts_info}")

    print(f"\nFeldtypen-Übersicht: {types_count}")
    return str(out_file)


if __name__ == "__main__":
    create_test_form_3()
