"""
Bürgergeld (SGB II) 2-Seiten Testformular Generator für PDF Form Agent.
Erzeugt ein praxistaugliches 2-seitiges Behördenformular mit:
- Seite 1: Persönliche Daten, Unterkunftskosten (Kaltmiete, Heizung, Haushaltsenergie), Bankverbindung (/Tx, /Btn, /Ch)
- Seite 2: Angaben zum Vermögen (Anlage VM) mit sichtbarem Infokasten & Erklärung (/Tx, /Btn, /Ch)
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


def create_test_form(output_path: str = "data/input/pdfs/test_form.pdf") -> str:
    """Generates a realistic 2-page Bürgergeld (SGB II) AcroForm test PDF."""
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

    # =============================================================
    # SEITE 1
    # =============================================================
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(c_primary)
    c.drawString(45, height - 42, "Hauptantrag auf Bürgergeld (SGB II) – Seite 1 von 2")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)
    c.drawString(45, height - 55, "Grundsicherung für Arbeitsuchende – Persönliche Angaben, Unterkunftskosten & Bankverbindung")

    c.setStrokeColor(c_line)
    c.setLineWidth(1)
    c.line(45, height - 64, width - 45, height - 64)

    # 1. Persönliche Angaben
    y_sec1 = height - 80
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec1, "1. Angaben zur antragstellenden Person")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_r1 = y_sec1 - 18
    c.drawString(45, y_r1, "Nachname:")
    c.drawString(300, y_r1, "Vorname:")

    y_r2 = y_sec1 - 38
    c.drawString(45, y_r2, "Geburtsdatum:")
    c.drawString(270, y_r2, "Geburtsort:")

    y_r3 = y_sec1 - 58
    c.drawString(45, y_r3, "Rentenversicherungs-Nr.:")
    c.drawString(320, y_r3, "Staatsangehörigkeit [▼]:")

    y_r4 = y_sec1 - 78
    c.drawString(45, y_r4, "Familienstand [▼]:")
    c.drawString(320, y_r4, "Geschlecht:")
    c.setStrokeColor(c_box_border)
    c.setLineWidth(0.8)
    c.rect(380, y_r4 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(396, y_r4 + 1, "m")
    c.rect(430, y_r4 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(446, y_r4 + 1, "w")
    c.rect(480, y_r4 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(496, y_r4 + 1, "d")

    y_r5 = y_sec1 - 98
    c.drawString(45, y_r5, "Straße, Hausnummer:")
    c.drawString(340, y_r5, "PLZ, Wohnort:")

    y_r6 = y_sec1 - 118
    c.drawString(45, y_r6, "Telefonnummer / E-Mail:")

    # 2. Kranken- und Pflegeversicherung
    y_sec2 = y_sec1 - 142
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec2, "2. Kranken- und Pflegeversicherung")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)
    y_kv = y_sec2 - 18
    c.drawString(45, y_kv, "Versicherungsstatus [▼]:")
    c.drawString(340, y_kv, "Name der Krankenkasse:")

    # 3. Unterkunftskosten, Heizung & Haushaltsenergie (Anlage KDU)
    y_sec3 = y_sec2 - 42
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec3, "3. Kosten der Unterkunft, Heizung & Haushaltsenergie (Anlage KDU)")

    # Infokasten KDU auf Seite 1 gedruckt
    c.setFillColor(c_info_bg)
    c.setStrokeColor(c_box_border)
    c.setLineWidth(0.8)
    c.rect(45, y_sec3 - 48, width - 90, 42, stroke=1, fill=1)

    c.setFillColor(c_primary)
    c.setFont("Helvetica-Bold", 7.8)
    c.drawString(53, y_sec3 - 14, "HINWEIS ZU UNTERKUNFTSKOSTEN, HEIZUNG & HAUSHALTSENERGIE:")

    c.setFont("Helvetica", 7.5)
    c.setFillColor(c_secondary)
    c.drawString(53, y_sec3 - 25, "• Kaltmiete, kalte Nebenkosten und Heizkosten werden im 1. Jahr (Karenzzeit) grundsätzlich übernommen.")
    c.drawString(53, y_sec3 - 36, "• Haushaltsenergie (Strom/Gas für Beleuchtung & Haushaltsgeräte) ist bereits im Regelbedarf enthalten und getrennt anzugeben.")
    c.drawString(53, y_sec3 - 45, "• Dezentrale Warmwasserbereitung (z. B. durch einen elektrischen Durchlauferhitzer) begründet einen gesetzlichen Mehrbedarf.")

    y_ws = y_sec3 - 66
    c.drawString(45, y_ws, "Wohnform [▼]:")
    c.rect(340, y_ws - 2, 12, 12, stroke=1, fill=0)
    c.drawString(358, y_ws + 1, "Ich bewohne die Unterkunft allein")

    y_kdu1 = y_sec3 - 88
    c.drawString(45, y_kdu1, "Grundmiete / Kaltmiete (€):")
    c.drawString(310, y_kdu1, "Kalte Betriebskosten (€):")

    y_kdu2 = y_sec3 - 110
    c.drawString(45, y_kdu2, "Heizkosten mtl. Abschlag (€):")
    c.drawString(310, y_kdu2, "Warmwasserbereitung [▼]:")

    y_kdu3 = y_sec3 - 132
    c.drawString(45, y_kdu3, "Haushaltsenergie (Strom/Gas f. Geräte) (€):")

    y_vl = y_sec3 - 154
    c.drawString(45, y_vl, "Aktuell bezogene Vorleistungen:")

    vorleistungen = [
        (45, y_vl - 16, "Arbeitslosengeld (ALG I)"),
        (200, y_vl - 16, "Krankengeld"),
        (310, y_vl - 16, "Kindergeld / KIZ"),
        (430, y_vl - 16, "Wohngeld"),
    ]
    for x_pos, y_pos, label in vorleistungen:
        c.rect(x_pos, y_pos - 2, 12, 12, stroke=1, fill=0)
        c.drawString(x_pos + 16, y_pos + 1, label)

    # 4. Bankverbindung
    y_sec4 = y_sec3 - 192
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec4, "4. Angaben zur Bankverbindung (Zahlungsverkehr)")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_bk1 = y_sec4 - 18
    c.drawString(45, y_bk1, "Kontoinhaber:")
    c.drawString(320, y_bk1, "Kreditinstitut:")

    y_bk2 = y_sec4 - 38
    c.drawString(45, y_bk2, "IBAN:")
    c.drawString(380, y_bk2, "BIC:")

    # Footer Seite 1
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawString(45, 22, "PDF Form Agent – SGB II Bürgergeld Referenzformular (Seite 1 von 2)")

    # PAGE BREAK
    c.showPage()

    # =============================================================
    # SEITE 2
    # =============================================================
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(c_primary)
    c.drawString(45, height - 42, "Hauptantrag auf Bürgergeld (SGB II) – Seite 2 von 2")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)
    c.drawString(45, height - 55, "Erklärung zum Vermögen & Schonvermögen (Anlage VM) sowie Abschluss")

    c.setStrokeColor(c_line)
    c.setLineWidth(1)
    c.line(45, height - 64, width - 45, height - 64)

    # 5. Angaben zum Vermögen (Anlage VM)
    y_sec5 = height - 85
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec5, "5. Angaben zum Vermögen & Schonvermögen (Anlage VM)")

    # Sichtbarer Infokasten auf Seite 2
    c.setFillColor(c_info_bg)
    c.setStrokeColor(c_box_border)
    c.setLineWidth(0.8)
    c.rect(45, y_sec5 - 72, width - 90, 64, stroke=1, fill=1)

    c.setFillColor(c_primary)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(53, y_sec5 - 18, "HINWEIS ZUM VERMÖGEN & SCHONVERMÖGEN (Karenzzeit & Freibeträge):")

    c.setFont("Helvetica", 7.8)
    c.setFillColor(c_secondary)
    c.drawString(53, y_sec5 - 30, "• Im 1. Jahr (Karenzzeit) bleibt Vermögen bis 40.000 € für die antragstellende Person sowie 15.000 € für jede weitere Person anrechnungsfrei.")
    c.drawString(53, y_sec5 - 42, "• Selbstgenutztes Wohneigentum (Haus bis 140 m², Eigentumswohnung bis 130 m²) zählt grundsätzlich als Schonvermögen.")
    c.drawString(53, y_sec5 - 54, "• Ein angemessenes Kraftfahrzeug (Marktwert bis 15.000 € je erwerbsfähiger Person im Haushalt) bleibt ebenfalls anrechnungsfrei.")
    c.drawString(53, y_sec5 - 66, "• Bargeld, Guthaben, Aktien, Bausparverträge und Lebensversicherungen sind bei Überschreitung der Grenzen anzugeben.")

    # Vermögens-Felder Zeilen
    y_v1 = y_sec5 - 94
    c.setFont("Helvetica", 8.5)
    c.drawString(45, y_v1, "Vermögensstatus [▼]:")

    y_v2 = y_sec5 - 118
    c.drawString(45, y_v2, "Giroguthaben & Bargeld (€):")
    c.drawString(310, y_v2, "PKW geschätzter Wert (€):")

    y_v3 = y_sec5 - 142
    c.rect(45, y_v3 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_v3 + 1, "Es ist ein Kraftfahrzeug in der Bedarfsgemeinschaft vorhanden")

    y_v4 = y_sec5 - 166
    c.drawString(45, y_v4, "Wohneigentum [▼]:")
    c.drawString(340, y_v4, "Wohnfläche (m²):")

    y_v5 = y_sec5 - 190
    c.rect(45, y_v5 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_v5 + 1, "Sonstige Vermögenswerte (Aktien, Lebensversicherung, Krypto) vorhanden")
    c.drawString(390, y_v5, "Gesamtwert (€):")

    # 6. Erklärung & Abschluss
    y_sec6 = y_sec5 - 225
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(c_primary)
    c.drawString(45, y_sec6, "6. Erklärung & Datenschutz")

    c.setFont("Helvetica", 8.5)
    c.setFillColor(c_secondary)

    y_e1 = y_sec6 - 20
    c.rect(45, y_e1 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_e1 + 1, "Ich versichere die Richtigkeit und Vollständigkeit aller gemachten Angaben.")

    y_e2 = y_sec6 - 38
    c.rect(45, y_e2 - 2, 12, 12, stroke=1, fill=0)
    c.drawString(63, y_e2 + 1, "Ich willige in die zweckgebundene Verarbeitung meiner Daten nach SGB II ein.")

    # Datum & Unterschrift
    y_sig = y_sec6 - 66
    c.drawString(45, y_sig, "Ort, Datum:")
    c.drawString(300, y_sig, "Unterschrift:")
    c.setStrokeColor(c_line)
    c.line(360, y_sig - 2, width - 45, y_sig - 2)

    # Footer Seite 2
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawString(45, 25, "PDF Form Agent – SGB II Bürgergeld Referenzformular (Seite 2 von 2)")

    c.save()
    buffer.seek(0)

    # =============================================================
    # Step 2: AcroForm-Felder via pypdf injizieren (2 Seiten)
    # =============================================================
    reader = PdfReader(buffer)
    writer = PdfWriter()
    writer.add_page(reader.pages[0])
    writer.add_page(reader.pages[1])

    writer._root_object[NameObject("/AcroForm")] = DictionaryObject({
        NameObject("/Fields"): ArrayObject(),
        NameObject("/NeedAppearances"): NameObject("/true"),
    })

    page1 = writer.pages[0]
    page2 = writer.pages[1]
    if "/Annots" not in page1: page1[NameObject("/Annots")] = ArrayObject()
    if "/Annots" not in page2: page2[NameObject("/Annots")] = ArrayObject()

    # Dropdown Options
    opts_staatsangehoerigkeit = [
        "Deutsch",
        "EU-Staatsangehörigkeit",
        "Drittstaatsangehörig (mit Aufenthaltstitel)",
        "Sonstige",
    ]
    opts_familienstand = [
        "Ledig",
        "Verheiratet / Eingetragene Lebenspartnerschaft",
        "Dauernd getrennt lebend",
        "Geschieden",
        "Verwitwet",
    ]
    opts_kv_status = [
        "Gesetzlich pflichtversichert",
        "Familienversichert",
        "Freiwillig gesetzlich versichert",
        "Privat versichert",
        "Nicht versichert",
    ]
    opts_wohnform = [
        "Mietwohnung",
        "Eigentumswohnung / Eigenheim",
        "Untermiete",
        "Ohne festen Wohnsitz",
    ]
    opts_warmwasser_art = [
        "Zentrale Warmwasserversorgung (in Heizkosten enthalten)",
        "Dezentrale Warmwasserbereitung (Durchlauferhitzer / Boiler)",
    ]
    opts_vermoegen_status = [
        "Kein verwertbares Vermögen vorhanden",
        "Vermögen liegt innerhalb der Freibeträge (Schonvermögen)",
        "Vermögen übersteigt die Karenzgrenze von 40.000 €",
    ]
    opts_vermoegen_immobilien = [
        "Kein Wohneigentum",
        "Selbstgenutztes Einfamilienhaus (bis 140 qm)",
        "Selbstgenutzte Eigentumswohnung (bis 130 qm)",
        "Sonstiges Wohneigentum / Vermietet",
    ]

    # Fields Definition: (page_idx, name, tooltip, type, x, y, width, height, extra_opts)
    fields_def = [
        # --- SEITE 1 ---
        # Sektion 1: Persönliche Daten
        (0, "txt_nachname", "Nachname des Antragstellers", "/Tx", 100, y_r1 - 4, 185, 15, None),
        (0, "txt_vorname", "Vorname des Antragstellers", "/Tx", 350, y_r1 - 4, 195, 15, None),
        (0, "txt_geburtsdatum", "Geburtsdatum (Format: TT.MM.JJJJ)", "/Tx", 115, y_r2 - 4, 140, 15, None),
        (0, "txt_geburtsort", "Geburtsort (Ort, ggf. Land)", "/Tx", 330, y_r2 - 4, 215, 15, None),
        (0, "txt_rv_nummer", "Rentenversicherungsnummer (12-stellig)", "/Tx", 170, y_r3 - 4, 135, 15, None),
        (0, "drp_staatsangehoerigkeit", "Staatsangehörigkeit auswählen", "/Ch", 425, y_r3 - 4, 120, 15, opts_staatsangehoerigkeit),
        (0, "drp_familienstand", "Familienstand auswählen", "/Ch", 135, y_r4 - 4, 170, 15, opts_familienstand),
        (0, "chk_geschlecht_m", "Geschlecht männlich", "/Btn", 380, y_r4 - 2, 12, 12, None),
        (0, "chk_geschlecht_w", "Geschlecht weiblich", "/Btn", 430, y_r4 - 2, 12, 12, None),
        (0, "chk_geschlecht_d", "Geschlecht divers", "/Btn", 480, y_r4 - 2, 12, 12, None),
        (0, "txt_strasse_hausnr", "Straße und Hausnummer", "/Tx", 150, y_r5 - 4, 175, 15, None),
        (0, "txt_plz_ort", "Postleitzahl und Wohnort", "/Tx", 405, y_r5 - 4, 140, 15, None),
        (0, "txt_telefon_email", "Telefonnummer oder E-Mail-Adresse", "/Tx", 160, y_r6 - 4, 385, 15, None),

        # Sektion 2: Krankenversicherung
        (0, "drp_kv_status", "Art der Kranken- und Pflegeversicherung", "/Ch", 160, y_kv - 4, 165, 15, opts_kv_status),
        (0, "txt_krankenkasse_name", "Name der Krankenkasse", "/Tx", 450, y_kv - 4, 95, 15, None),

        # Sektion 3: Unterkunftskosten & Haushaltsenergie (Anlage KDU)
        (0, "drp_wohnform", "Wohnform der aktuellen Unterkunft", "/Ch", 115, y_ws - 4, 210, 15, opts_wohnform),
        (0, "chk_wohnen_allein", "Ich bewohne die Unterkunft allein", "/Btn", 340, y_ws - 2, 12, 12, None),
        (0, "txt_unterkunft_kaltmiete", "Monatliche Kaltmiete / Grundmiete in EUR", "/Tx", 165, y_kdu1 - 4, 130, 15, None),
        (0, "txt_unterkunft_nebenkosten", "Monatliche kalte Betriebskosten/Nebenkosten in EUR", "/Tx", 415, y_kdu1 - 4, 130, 15, None),
        (0, "txt_unterkunft_heizkosten", "Monatlicher Abschlagsbetrag für Heizung in EUR", "/Tx", 165, y_kdu2 - 4, 130, 15, None),
        (0, "drp_warmwasser_art", "Art der Warmwasseraufbereitung", "/Ch", 425, y_kdu2 - 4, 120, 15, opts_warmwasser_art),
        (0, "txt_unterkunft_haushaltsenergie", "Monatlicher Abschlag für Haushaltsenergie (Strom/Gas f. Geräte & Beleuchtung) in EUR", "/Tx", 235, y_kdu3 - 4, 310, 15, None),

        (0, "chk_bezug_alg", "Bezug von Arbeitslosengeld I", "/Btn", 45, y_vl - 16, 12, 12, None),
        (0, "chk_bezug_krankengeld", "Bezug von Krankengeld", "/Btn", 200, y_vl - 16, 12, 12, None),
        (0, "chk_bezug_kindergeld", "Bezug von Kindergeld oder Kinderzuschlag", "/Btn", 310, y_vl - 16, 12, 12, None),
        (0, "chk_bezug_wohngeld", "Bezug von Wohngeld", "/Btn", 430, y_vl - 16, 12, 12, None),

        # Sektion 4: Bankverbindung
        (0, "txt_kontoinhaber", "Name und Vorname des Kontoinhabers", "/Tx", 115, y_bk1 - 4, 190, 15, None),
        (0, "txt_kreditinstitut", "Name der Bank oder Sparkasse", "/Tx", 390, y_bk1 - 4, 155, 15, None),
        (0, "txt_iban", "Internationale Bankkontonummer (IBAN)", "/Tx", 80, y_bk2 - 4, 285, 15, None),
        (0, "txt_bic", "Bank Identifier Code (BIC)", "/Tx", 410, y_bk2 - 4, 135, 15, None),

        # --- SEITE 2 ---
        # Sektion 5: Vermögen (Anlage VM)
        (1, "drp_vermoegen_status", "Gesamteinschätzung des Vermögens", "/Ch", 150, y_v1 - 4, 395, 15, opts_vermoegen_status),
        (1, "txt_vermoegen_bargeld_guthaben", "Girokonto-Guthaben, Sparbücher, Bargeld in EUR", "/Tx", 165, y_v2 - 4, 130, 15, None),
        (1, "txt_vermoegen_pkw_wert", "Geschätzter Pkw-Marktwert in EUR", "/Tx", 420, y_v2 - 4, 125, 15, None),
        (1, "chk_vermoegen_pkw", "Es ist ein PKW im Haushalt vorhanden", "/Btn", 45, y_v3 - 2, 12, 12, None),
        (1, "drp_vermoegen_immobilien", "Art des Immobilien- oder Grundbesitzes", "/Ch", 135, y_v4 - 4, 195, 15, opts_vermoegen_immobilien),
        (1, "txt_vermoegen_immobilien_flaeche", "Wohnfläche der Immobilie in qm", "/Tx", 425, y_v4 - 4, 120, 15, None),
        (1, "chk_vermoegen_sonstiges", "Sonstige Vermögenswerte vorhanden", "/Btn", 45, y_v5 - 2, 12, 12, None),
        (1, "txt_vermoegen_sonstiges_wert", "Gesamtwert sonstiger Vermögenswerte in EUR", "/Tx", 460, y_v5 - 4, 85, 15, None),

        # Sektion 6: Erklärung & Abschluss
        (1, "chk_bestaetigung_richtigkeit", "Bestätigung der Richtigkeit der Angaben", "/Btn", 45, y_e1 - 2, 12, 12, None),
        (1, "chk_einwilligung_daten", "Einwilligung in die Datenverarbeitung nach SGB II", "/Btn", 45, y_e2 - 2, 12, 12, None),
        (1, "txt_ort_datum", "Ort und Datum der Antragstellung", "/Tx", 100, y_sig - 4, 185, 15, None),
    ]

    for item in fields_def:
        page_idx, f_name, f_tu, f_type, x, y, w, h, opts = item
        target_page = writer.pages[page_idx]

        if f_type == "/Tx":
            widget = DictionaryObject({
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Widget"),
                NameObject("/FT"): NameObject("/Tx"),
                NameObject("/T"): TextStringObject(f_name),
                NameObject("/TU"): TextStringObject(f_tu),
                NameObject("/Ff"): NumberObject(0),
                NameObject("/V"): TextStringObject(""),
                NameObject("/Rect"): ArrayObject([
                    FloatObject(x), FloatObject(y),
                    FloatObject(x + w), FloatObject(y + h),
                ]),
                NameObject("/DA"): ByteStringObject(b"/Helv 8.5 Tf 0 g"),
            })
        elif f_type == "/Btn":
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
                    FloatObject(x + w), FloatObject(y + h),
                ]),
            })
        elif f_type == "/Ch" and opts:
            widget = DictionaryObject({
                NameObject("/Type"): NameObject("/Annot"),
                NameObject("/Subtype"): NameObject("/Widget"),
                NameObject("/FT"): NameObject("/Ch"),
                NameObject("/T"): TextStringObject(f_name),
                NameObject("/TU"): TextStringObject(f_tu),
                NameObject("/Ff"): NumberObject(131072),
                NameObject("/Opt"): ArrayObject([TextStringObject(opt) for opt in opts]),
                NameObject("/V"): TextStringObject(""),
                NameObject("/Rect"): ArrayObject([
                    FloatObject(x), FloatObject(y),
                    FloatObject(x + w), FloatObject(y + h),
                ]),
                NameObject("/DA"): ByteStringObject(b"/Helv 8.5 Tf 0 g"),
            })
        else:
            continue

        ref = writer._add_object(widget)
        target_page["/Annots"].append(ref)
        writer._root_object["/AcroForm"]["/Fields"].append(ref)

    writer.add_metadata({
        "/Title": "Hauptantrag auf Bürgergeld (SGB II) - 2-Seiten Referenzformular mit Anlage KDU & VM",
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
        opts_info = f" [Opts: {len(info.get('/Opt', []))}]" if ft == "/Ch" else ""
        print(f"  - [{ft}] {name}: {info.get('/TU')}{opts_info}")

    print(f"\nFeldtypen-Übersicht: {types_count}")
    return str(out_file)


if __name__ == "__main__":
    create_test_form()
