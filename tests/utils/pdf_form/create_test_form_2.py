"""
Zusatzleistungen & Mehrbedarfe Testformular (test_form_2.pdf) Generator für PDF Form Agent.
Erzeugt ein reines Auswahl- und Kreuz-Formular (ausschließlich /Btn Checkboxen, /Btn Radio-Gruppen und /Ch Dropdowns).
Enthält keine /Tx Textfelder.
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


def create_test_form_2(output_path: str = "data/input/pdfs/test_form_2.pdf") -> str:
    """Generates an AcroForm test PDF containing only /Btn (checkboxes, radio groups) and /Ch (dropdowns)."""
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4  # 595.27 x 841.89 pt

    # Colors
    c_primary = HexColor("#0f172a")    # Slate 900
    c_secondary = HexColor("#475569")  # Slate 600
    c_line = HexColor("#cbd5e1")       # Slate 300
    c_box_border = HexColor("#94a3b8") # Slate 400
    c_info_bg = HexColor("#f8fafc")    # Slate 50

    # Header
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(c_primary)
    c.drawString(45, height - 42, "Prüfbogen für Zusatzleistungen & Mehrbedarfe (SGB II)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)
    c.drawString(45, height - 55, "Erhebungsbogen für Status, Mehrbedarfe, Vorrangige Leistungen & Bildungsförderung (BuT)")

    c.setStrokeColor(c_line)
    c.setLineWidth(1)
    c.line(45, height - 64, width - 45, height - 64)

    # 1. Abschnitt: Status & Lebenssituation
    y_sec1 = height - 82
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec1, "1. Status & Lebenssituation (Auswahl & Radio-Optionen)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_r1 = y_sec1 - 20
    c.drawString(45, y_r1, "Aktueller Erwerbsstatus [▼]:")
    c.drawString(320, y_r1, "Wohnsituation [▼]:")

    y_r2 = y_sec1 - 44
    c.drawString(45, y_r2, "Krankenversicherung [▼]:")

    y_r3 = y_sec1 - 68
    c.drawString(45, y_r3, "Bewohnen Sie die Unterkunft allein?")
    c.setStrokeColor(c_box_border)
    c.rect(245, y_r3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(261, y_r3 + 1, "Ja")
    c.rect(295, y_r3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(311, y_r3 + 1, "Nein")

    c.drawString(360, y_r3, "Gesetzliche Betreuung?")
    c.rect(480, y_r3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(496, y_r3 + 1, "Ja")
    c.rect(530, y_r3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(546, y_r3 + 1, "Nein")

    # 2. Abschnitt: Gesetzliche Mehrbedarfe nach § 21 SGB II
    y_sec2 = y_sec1 - 96
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec2, "2. Gesetzliche Mehrbedarfe (§ 21 SGB II – Zutreffendes ankreuzen)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_m1 = y_sec2 - 18
    c.rect(45, y_m1 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_m1 + 1, "Mehrbedarf für Alleinerziehende (§ 21 Abs. 3 SGB II)")

    c.rect(330, y_m1 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(348, y_m1 + 1, "Mehrbedarf bei Schwangerschaft ab 13. SSW (§ 21 Abs. 2)")

    y_m2 = y_sec2 - 36
    c.rect(45, y_m2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_m2 + 1, "Kostenaufwändige Ernährung bei Krankheit (§ 21 Abs. 5)")

    c.rect(330, y_m2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(348, y_m2 + 1, "Mehrbedarf für Menschen mit Behinderung (§ 21 Abs. 4)")

    y_m3 = y_sec2 - 54
    c.rect(45, y_m3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_m3 + 1, "Dezentrale Warmwasserbereitung über Durchlauferhitzer / Boiler (§ 21 Abs. 7)")

    # 3. Abschnitt: Vorrangige Sozialleistungen
    y_sec3 = y_sec2 - 82
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec3, "3. Bezug vorrangiger Sozialleistungen (Zutreffendes ankreuzen)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_vl1 = y_sec3 - 18
    c.rect(45, y_vl1 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_vl1 + 1, "Kindergeld / Kinderzuschlag (KIZ)")

    c.rect(225, y_vl1 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(243, y_vl1 + 1, "Unterhaltsvorschuss (UVG)")

    c.rect(405, y_vl1 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(423, y_vl1 + 1, "Krankengeld / Verletztengeld")

    y_vl2 = y_sec3 - 36
    c.rect(45, y_vl2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_vl2 + 1, "Elterngeld")

    c.rect(225, y_vl2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(243, y_vl2 + 1, "Wohngeld")

    c.rect(405, y_vl2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(423, y_vl2 + 1, "BAföG / Ausbildungsbeihilfe (BAB)")

    # 4. Abschnitt: Bildungs- und Teilhabepaket (BuT)
    y_sec4 = y_sec3 - 64
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec4, "4. Leistungen für Bildung und Teilhabe (§ 28 SGB II)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_bt1 = y_sec4 - 20
    c.drawString(45, y_bt1, "Besuchte Schul- / Betreuungsform [▼]:")

    y_bt2 = y_sec4 - 42
    c.rect(45, y_bt2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_bt2 + 1, "Persönlicher Schulbedarf (195 € / Schuljahr)")

    c.rect(330, y_bt2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(348, y_bt2 + 1, "Kostenübernahme gemeinschaftliche Mittagsverpflegung")

    y_bt3 = y_sec4 - 60
    c.rect(45, y_bt3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_bt3 + 1, "Tagesausflüge und mehrtägige Klassenfahrten")

    c.rect(330, y_bt3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(348, y_bt3 + 1, "Angemessene Lernförderung (Nachhilfe)")

    y_bt4 = y_sec4 - 78
    c.rect(45, y_bt4 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_bt4 + 1, "Teilhabe am sozialen und kulturellen Leben (Sport, Musikschule, bis 15 €/Monat)")

    # 5. Abschnitt: Erklärungen & Datenschutz
    y_sec5 = y_sec4 - 108
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec5, "5. Erklärungen & Datenschutz")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_e1 = y_sec5 - 20
    c.drawString(45, y_e1, "Einwilligung zur elektronischen Datenverarbeitung und Übermittlung:")
    c.rect(380, y_e1 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(396, y_e1 + 1, "Zustimmung")
    c.rect(475, y_e1 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(491, y_e1 + 1, "Ablehnung")

    y_e2 = y_sec5 - 40
    c.rect(45, y_e2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_e2 + 1, "Ich versichere die Richtigkeit und Vollständigkeit aller gemachten Angaben.")

    y_e3 = y_sec5 - 58
    c.rect(45, y_e3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_e3 + 1, "Die Merkblätter und gesetzlichen Mitteilungspflichten wurden zur Kenntnis genommen.")

    # Footer
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawString(45, 25, "PDF Form Agent – Reines Auswahl- und Kreuz-Referenzformular (test_form_2.pdf)")

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

    # Dropdown Options
    opts_erwerbsstatus = [
        "Vollzeit beschäftigt",
        "Teilzeit beschäftigt",
        "Arbeitssuchend / Arbeitslos",
        "In Ausbildung / Studium",
        "Im Ruhestand / Rente",
        "Erwerbsunfähig",
    ]
    opts_wohnform = [
        "Mietwohnung",
        "Eigentumswohnung / Eigenheim",
        "Untermiete",
        "Gemeinschaftsunterkunft",
        "Ohne festen Wohnsitz",
    ]
    opts_krankenversicherung = [
        "Gesetzlich pflichtversichert",
        "Familienversichert",
        "Freiwillig gesetzlich versichert",
        "Privat versichert",
    ]
    opts_schulstufe = [
        "Kindertagesstätte (Kita)",
        "Grundschule (Klasse 1-4)",
        "Sekundarstufe I (Klasse 5-10)",
        "Gymnasiale Oberstufe (Sekundarstufe II)",
        "Berufsbildende Schule",
    ]

    # Standalone Dropdowns (/Ch)
    choice_fields = [
        ("drp_erwerbsstatus", "Aktueller Erwerbsstatus", 175, y_r1 - 4, 135, 15, opts_erwerbsstatus),
        ("drp_wohnform", "Wohnsituation der aktuellen Unterkunft", 415, y_r1 - 4, 135, 15, opts_wohnform),
        ("drp_krankenversicherung", "Art der Kranken- und Pflegeversicherung", 175, y_r2 - 4, 375, 15, opts_krankenversicherung),
        ("drp_schulstufe", "Besuchte Schul- oder Betreuungsform", 225, y_bt1 - 4, 325, 15, opts_schulstufe),
    ]

    for f_name, f_tu, x, y, w, h, opts in choice_fields:
        widget = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/FT"): NameObject("/Ch"),
            NameObject("/T"): TextStringObject(f_name),
            NameObject("/TU"): TextStringObject(f_tu),
            NameObject("/Ff"): NumberObject(131072),  # Combo
            NameObject("/Opt"): ArrayObject([TextStringObject(opt) for opt in opts]),
            NameObject("/V"): TextStringObject(""),
            NameObject("/Rect"): ArrayObject([
                FloatObject(x), FloatObject(y),
                FloatObject(x + w), FloatObject(y + h),
            ]),
            NameObject("/DA"): ByteStringObject(b"/Helv 8.5 Tf 0 g"),
        })
        ref = writer._add_object(widget)
        page["/Annots"].append(ref)
        writer._root_object["/AcroForm"]["/Fields"].append(ref)

    # Standalone Checkboxes (/Btn)
    checkbox_fields = [
        # Abschnitt 2: Mehrbedarfe
        ("chk_mehrbedarf_alleinerziehend", "Mehrbedarf für Alleinerziehende nach § 21 Abs. 3 SGB II", 45, y_m1 - 2),
        ("chk_mehrbedarf_schwangerschaft", "Mehrbedarf bei Schwangerschaft ab der 13. Schwangerschaftswoche", 330, y_m1 - 2),
        ("chk_mehrbedarf_ernaehrung", "Mehrbedarf für kostenaufwändige Ernährung aus medizinischen Gründen", 45, y_m2 - 2),
        ("chk_mehrbedarf_behinderung", "Mehrbedarf für Menschen mit Behinderung nach § 21 Abs. 4 SGB II", 330, y_m2 - 2),
        ("chk_mehrbedarf_warmwasser", "Mehrbedarf für dezentrale Warmwassererzeugung (Boiler / Durchlauferhitzer)", 45, y_m3 - 2),

        # Abschnitt 3: Vorrangige Leistungen
        ("chk_bezug_kindergeld", "Bezug von Kindergeld oder Kinderzuschlag (KIZ)", 45, y_vl1 - 2),
        ("chk_bezug_unterhaltsvorschuss", "Bezug von Unterhaltsvorschuss nach dem UVG", 225, y_vl1 - 2),
        ("chk_bezug_krankengeld", "Bezug von Krankengeld oder Verletztengeld", 405, y_vl1 - 2),
        ("chk_bezug_elterngeld", "Bezug von Elterngeld", 45, y_vl2 - 2),
        ("chk_bezug_wohngeld", "Bezug von Wohngeld", 225, y_vl2 - 2),
        ("chk_bezug_bafoeg", "Bezug von BAföG oder Berufsausbildungsbeihilfe (BAB)", 405, y_vl2 - 2),

        # Abschnitt 4: BuT
        ("chk_but_schulbedarf", "Pauschale für persönlichen Schulbedarf", 45, y_bt2 - 2),
        ("chk_but_mittagessen", "Kostenübernahme für gemeinschaftliche Mittagsverpflegung", 330, y_bt2 - 2),
        ("chk_but_schulausfluege", "Kostenübernahme für Tagesausflüge und mehrtägige Klassenfahrten", 45, y_bt3 - 2),
        ("chk_but_lernfoerderung", "Angemessene Lernförderung (außerschulische Nachhilfe)", 330, y_bt3 - 2),
        ("chk_but_kultur_sport", "Teilhabe am sozialen und kulturellen Leben (Sportverein, Musikschule)", 45, y_bt4 - 2),

        # Abschnitt 5: Erklärungen
        ("chk_bestaetigung_wahrheit", "Versicherung der Richtigkeit und Vollständigkeit der gemachten Angaben", 45, y_e2 - 2),
        ("chk_mitteilungspflicht_bekannt", "Bestätigung der Kenntnisnahme gesetzlicher Mitteilungspflichten", 45, y_e3 - 2),
    ]

    for f_name, f_tu, x, y in checkbox_fields:
        ap_dict = _create_checkbox_appearance(writer, size=12.0)
        widget = DictionaryObject({
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
                FloatObject(x), FloatObject(y),
                FloatObject(x + 12), FloatObject(y + 12),
            ]),
        })
        ref = writer._add_object(widget)
        page["/Annots"].append(ref)
        writer._root_object["/AcroForm"]["/Fields"].append(ref)

    # Hierarchical Radio Groups (/Btn)
    radio_groups_def = [
        (
            "rbtn_alleinwohnen",
            "Bewohnen Sie die Unterkunft allein?",
            ["ja", "nein"],
            [(245, y_r3 - 2), (295, y_r3 - 2)],
        ),
        (
            "rbtn_gesetzliche_betreuung",
            "Besteht eine gesetzliche Betreuung?",
            ["ja", "nein"],
            [(480, y_r3 - 2), (530, y_r3 - 2)],
        ),
        (
            "rbtn_datenschutz_einwilligung",
            "Einwilligung zur elektronischen Datenverarbeitung und Übermittlung",
            ["ja, ich willige ein", "nein, ich lehne ab"],
            [(380, y_e1 - 2), (475, y_e1 - 2)],
        ),
    ]

    for f_name, f_tu, opts, positions in radio_groups_def:
        parent_field = DictionaryObject({
            NameObject("/FT"): NameObject("/Btn"),
            NameObject("/T"): TextStringObject(f_name),
            NameObject("/TU"): TextStringObject(f_tu),
            NameObject("/Ff"): NumberObject(49152),  # 32768 (Radio) | 16384 (NoToggleToOff)
            NameObject("/Opt"): ArrayObject([TextStringObject(opt) for opt in opts]),
            NameObject("/_States_"): ArrayObject([NameObject(f"/{i}") for i in range(len(opts))]),
            NameObject("/V"): NameObject("/Off"),
            NameObject("/Kids"): ArrayObject(),
        })
        parent_ref = writer._add_object(parent_field)

        for i, (x, y) in enumerate(positions):
            state_key = f"/{i}"
            ap_dict = _create_radio_appearance(writer, state_key=state_key, size=12.0)
            child_widget = DictionaryObject({
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Widget"),
                NameObject("/Parent"): parent_ref,
                NameObject("/Rect"): ArrayObject([
                    FloatObject(x), FloatObject(y),
                    FloatObject(x + 12), FloatObject(y + 12),
                ]),
                NameObject("/AP"): ap_dict,
                NameObject("/AS"): NameObject("/Off"),
            })
            child_ref = writer._add_object(child_widget)
            parent_field["/Kids"].append(child_ref)
            page["/Annots"].append(child_ref)

        writer._root_object["/AcroForm"]["/Fields"].append(parent_ref)

    writer.add_metadata({
        "/Title": "Zusatzleistungen & Mehrbedarfe (SGB II) - Reines Auswahl- und Kreuz-Referenzformular",
        "/Author": "PDF Form Agent Test Suite",
    })

    with open(out_file, "wb") as f:
        writer.write(f)

    # Verifikation
    r = PdfReader(str(out_file))
    fields = r.get_fields() or {}
    print(f"'{out_file}' erfolgreich generiert ({len(r.pages)} Seiten, {len(fields)} Felder):")
    types_count = {}
    for name, info in fields.items():
        ft = str(info.get("/FT"))
        types_count[ft] = types_count.get(ft, 0) + 1
        opts_info = f" [Opts: {len(info.get('/Opt', []))}]" if "/Opt" in info else ""
        print(f"  - [{ft}] {name}: {info.get('/TU')}{opts_info}")

    print(f"\nFeldtypen-Übersicht: {types_count}")
    return str(out_file)


if __name__ == "__main__":
    create_test_form_2()
