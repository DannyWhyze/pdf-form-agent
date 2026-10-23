# Manuelle End-to-End Test-Checkliste für den PDF Form Agent (`MANUAL_TESTING_CHECKLIST.md`)

Diese Checkliste führt dich Schritt für Schritt durch alle Funktionen, Ansichten, Sicherheitsmechanismen und Workflows des **PDF Form Agent** direkt in der laufenden Webanwendung (`http://localhost:5173`).

---

## Vorbereitung & Start

1. **Ollama starten:**
   ```powershell
   ollama serve
   ```
   *Sicherstellen, dass mindestens ein Modell installiert ist (z. B. `ollama run qwen2.5:7b`).*
2. **Anwendung starten:**
   ```powershell
   .\start_dev.ps1
   ```
   *Es öffnen sich das Backend-Fenster (Port 8001), das Frontend-Fenster (Port 5173) und automatisch der Browser unter `http://localhost:5173`.*

---

## Checkliste: 12 Test-Stationen

### 1. Header, Systemgesundheit & globale Steuerung

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 1.1 | **Triple-Statusanzeige (API / STT / TTS)** | Im Header rechts sind drei Status-Quadrate sichtbar:<br>• `API: Online` (grün)<br>• `STT: Online / Offline` (grün wenn Port 8002 aktiv, sonst rot)<br>• `TTS: Online / Offline` (grün wenn Port 8005 aktiv, sonst rot)<br>• Alle 15 Sekunden erfolgt ein automatisches Polling im Hintergrund. | [x] |
| 1.2 | **Modell-Selektor** | Das Dropdown-Menü listet alle lokal in Ollama vorhandenen Modelle auf. Ein Wechsel des Modells wird sofort aktiv. | [x] |
| 1.3 | **Thinking Mode Toggle** | Klick auf `Thinking: OFF` wechselt zu `Thinking: ON`. Bei kompatiblen Modellen (z. B. Qwen 2.5 / DeepSeek) werden Denkprozesse später aufklappbar gerendert. | [x] |
| 1.4 | **Theme Switcher (3 Themes)** | Klick auf `THEME: [ LIVE | PAPER | CONTRAST ]` (oder Shortcut `Alt+T` / `Option+T`) wechselt nahtlos zwischen:<br>• **Ableton Live 12 Dark Theme** (dunkel, Studio-Matte)<br>• **Swiss Paper Light Theme** (hell, archivfest)<br>• **High-Contrast Theme** (WCAG 2.1 AAA zertifiziert, Tiefschwarz & Signalgelb).<br>Der Zustand bleibt nach `F5` erhalten (`localStorage`). | [x] |
| 1.5 | **Text-Skalierung (100% / 125% / 150%)** | Klick auf `TEXT: [ 100% | 125% | 150% ]` (oder Shortcut `Alt+S` / `Option+S`) skaliert alle UI-Elemente und Texte proportional auf Basis von CSS `rem`. Der Zustand bleibt nach `F5` erhalten (`localStorage`). | [x] |
| 1.6 | **New Session Button** | Klick auf `New Session` leert den Chatverlauf, setzt die PDF-Vorschau zurück und generiert eine frische `thread_id`. | [x] |
| 1.7 | **Tastatur-Shortcuts & Hilfe-Modal (`?`)** | Drücken von `?` (wenn kein Textfeld fokussiert ist) öffnet das Shortcuts-Modal (`ShortcutsModal`).<br>• Listet alle DAW-Tastaturbefehle (`Alt+D`, `Alt+A`, `Alt+V`, `Alt+P`, `Alt+T`, `Alt+S`, `Alt+U`, `Escape`, `Enter`, `Shift+Enter`) sowie alle 4 Sprachkommandos (`SEND`, `REPEAT_QUESTION`, `DOWNLOAD_FORM`, `STEP_BACK`) übersichtlich auf.<br>• `Escape` oder Klick auf `Schließen` schließt das Modal zuverlässig. | [x] |
| 1.8 | **Stammdaten-Statusbutton (`[STAMMDATEN]`)** | Im Header zeigt der Button den Status des Nutzerprofils an:<br>• `[STAMMDATEN: LEER]` (dezent, wenn kein Profil hinterlegt ist).<br>• `[STAMMDATEN: AKTIV]` (Smaragdgrün hervorgehoben, sobald Stammdaten gespeichert sind).<br>• Klick oder Shortcut `Alt+U` / `Option+U` öffnet den Profil-Editor (`UserProfileModal`). | [x] |
| 1.9 | **TTS Master Toggle & Shortcut (`Alt+V`) (Plan 042)** | Klick auf `TTS: ON` wechselt zu `TTS: OFF` (bzw. Shortcut `Alt+V` / `Option+V`):<br>• Schalter sitzt in der Menüleiste direkt neben `Thinking: ON \| OFF`.<br>• Button hebt sich bei `ON` akzentfarben ab.<br>• Zustand bleibt nach `F5` erhalten (`localStorage`: `pdf_form_agent_tts_enabled`).<br>• Bei `TTS: OFF` sind die `[Vorlesen]`-Buttons im Chat deaktiviert (Tooltip *„Sprachausgabe im Header deaktiviert“*). | [x] |
| 1.10 | **TTS Stimmenauswahl & Vorhör-Funktion (Audition Preview) (Plan 043)** | Neben dem TTS-Toggle steht ein Dropdown `Voice: [ Klara (Ruhig) \| Uwe (Nachrichten) \| Jonas (Lässig) ]` mit danebenliegendem `[ Probe ]`-Taster:<br>• Bei Auswahl einer neuen Stimme ertönt sofort der jeweilige Mustersatz (sofern `TTS: ON` und online).<br>• Klick auf `[ Probe ]` spielt den Mustersatz der aktuell ausgewählten Stimme erneut ab.<br>• Beide Steuerelemente sind bei `TTS: OFF` sowie während eines laufenden SSE-Streams deaktiviert (`disabled`).<br>• Die Stimmenauswahl bleibt nach `F5` erhalten (`localStorage`: `pdf_form_agent_tts_voice`). | [x] |

---

### 2. Layout, Split-Screen & Viewport-Resizing

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 2.1 | **Dual-Pane Split-Screen** | Linke Seite: Chat-Bereich. Rechte Seite: PDF-Viewer-Bereich. Beide Bereiche sind sauber ausgerichtet. | [x] |
| 2.2 | **Draggable Resizer** | Mit der Maus über den vertikalen Trenner fahren (Cursor wird zu `col-resize`). Ziehen nach links/rechts skaliert die Spalten flüssig.<br>• Minimale Grenzen (25 % / 75 %) verhindern ein Kollabieren. | [x] |
| 2.3 | **Collapsible PDF Viewport** | Klick auf `PDF ausblenden`:<br>• PDF-Bereich klappt vollständig zusammen.<br>• Chat nimmt die volle Bildschirmbreite ein (Fullscreen Workspace).<br>• Button wechselt zu `PDF anzeigen`. Klick stellt den vorherigen Zustand exakt wieder her. | [x] |

---

### 3. PDF Upload & Dokumenten-Inspektion

*Nutze für diesen Test vorzugsweise das kompakte 8-Feld Schnelltestformular [`data/input/pdfs/test_form_3.pdf`](../data/input/pdfs/test_form_3.pdf) (oder für Mammut-Tests `test_form.pdf` / `test_form_2.pdf`).*

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 3.1 | **Drag & Drop / Klick-Upload & Asynchrone Concurrency** | PDF-Datei in den Upload-Bereich ziehen oder per Dateiauswahl hochladen.<br>• Das PDF lädt sofort in den rechten Iframe-Viewer.<br>• Der Upload-Bereich blendet sich aus und die Toolbar erscheint.<br>• **Non-Blocking Concurrency (Plan 038):** Aktive Payload-Prüfung (`inspect_pdf_security`), Dateispeicherung und AcroForm-Analyse laufen non-blocking via `asyncio.to_thread` im Worker-Thread; Ephemeral-Cleanup wird als `BackgroundTask` ohne Event-Loop-Blockade ausgeführt. | [x] |
| 3.2 | **Upload-Sicherheitsgrenzen (Negativtest)** | Versuch, eine Nicht-PDF-Datei (z. B. `.txt` oder `.exe`) oder eine Datei > 25 MB hochzuladen:<br>• Rote Fehlermeldung: Upload wird strikt abgelehnt (Magic-Bytes-Validierung). | [x] |
| 3.3 | **Flat-PDF Erkennung** | Lade ein PDF ohne interaktive Formularfelder hoch (z. B. einen reinen Textausdruck):<br>• Toolbar zeigt ein Warn-Badge: `[Notice: Flat PDF without interactive form fields]`. | [x] |
| 3.4 | **AcroForm-Fortschrittsanzeige** | Lade ein interaktives PDF mit Formularfeldern hoch:<br>• Toolbar zeigt `0 von X Feldern ausgefüllt (0%)` inklusive animiertem Fortschrittsbalken. | [x] |
| 3.5 | **PDF-Toolbar & Navigation** | Seitennavigation funktioniert (`Seite 1 von N`, Pfeiltasten). Zoom-Buttons vergrößern/verkleinern die Vorschau. | [x] |

---

### 4. Das geführte Formular-Interview (ReAct Agent Core)

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 4.1 | **Natürliche Sprache & Feldanalyse** | Der Agent begrüßt dich und stellt die erste gezielte Frage (z. B. nach dem Vornamen).<br>• **Strikte Regel:** Der Agent nennt **keine internen technischen Variablennamen** (wie `txt_vorname`, `field_1`), sondern spricht ausschließlich in natürlicher Sprache. | [x] |
| 4.2 | **Fokus-Disziplin (Single-Field Focus)** | Der Agent fragt proaktiv **immer nur ein Feld auf einmal** ab und wartet auf deine Antwort. Keine verwirrenden Mammut-Listen. | [x] |
| 4.3 | **Live Inkrementelles Ausfüllen** | Gib deinen Vornamen ein (z. B. `Max`).<br>• Der Agent ruft `fill_pdf_form` auf.<br>• Der rechte PDF-Viewer aktualisiert sich **sofort live** – der Name `Max` steht im Formularfeld.<br>• Der Fortschrittsbalken springt um ein Feld nach oben (z. B. `1 von 12 Feldern (8%)`). | [x] |
| 4.4 | **Umlaut- & UTF-8 Integrität** | Gib einen Namen/Ort mit Umlauten ein (z. B. `Jürgen Weiß-Müller, München`):<br>• Im PDF erscheinen echte Umlaute (`ü`, `ä`, `ö`, `ß`) und keine kryptischen Escape-Sequenzen wie `\u00fc`. | [x] |
| 4.5 | **Streaming & Thinking-Box** | Während der Agent antwortet:<br>• Tokens streamen flüssig Wort für Wort.<br>• Ist `Thinking: ON`, erscheint vor der Antwort eine dezente `[Thought / Reasoning]`-Box, die sich per Klick auf- und zuklappen lässt. | [x] |
| 4.6 | **Zwingende Werkzeug-Pflicht & Verbot von Scheineinträgen** | Bei jeder Antwort mit Formularwerten ruft das Modell zwingend `fill_pdf_form` auf.<br>• Es behauptet **niemals rein im Text**, ein Feld sei ausgefüllt, ohne das Tool auszuführen (`[WERKZEUG-PFLICHT]`). | [x] |
| 4.7 | **Transparente Werkzeug-Inspektion (`ToolCallBadge`)** | Jede Werkzeug-Ausführung wird als kompaktes Badge angezeigt (z. B. `txt_name: "Max Mustermann"`).<br>• Klick auf `[DETAILS]` klappt `[INPUT]` (übergebene Parameter) und `[OUTPUT]` (JSON-Rückmeldung) vollständig auf.<br>• Zweiter Klick klappt die Details wieder zu. | [x] |
| 4.8 | **Validierungs-Firewall: Kalendarische Datums- & Altersprüfung (Plan 031)** | Gib absichtlich ein ungültiges Datum ein (z. B. `31.02.1990` oder `29.02.2023`) oder ein Geburtsdatum in der Zukunft:<br>• Die Middleware fängt den Toolcall vor der PDF-Engine ab (**Zero Dirty Writes**).<br>• Das PDF im Viewer bleibt unverändert sauber.<br>• Der Agent erklärt den kalendarischen Fehler verständlich in natürlicher Sprache und bittet um Korrektur. | [x] |
| 4.9 | **Validierungs-Firewall: ISO 7064 Modulo-97 IBAN-Prüfung (Plan 031)** | Gib eine deutsche IBAN mit absichtlichem Zahlendreher ein (z. B. `DE89 3704 0044 0532 0130 01`):<br>• Modulo-97-Prüfung schlägt fehl $\rightarrow$ Middleware blockiert vorzeitig (Short-Circuit).<br>• Tool `fill_pdf_form` wird nicht ausgeführt.<br>• Der Agent bittet höflich um Überprüfung der Kontonummer/Prüfziffer. | [x] |
| 4.10 | **Validierungs-Firewall: PLZ- und Währungsprüfung (Plan 031)** | Teste Grenzfälle bei PLZ und Beträgen:<br>• PLZ < 5 Ziffern wird abgewiesen; PLZ mit führender Null (`01067`) wird beibehalten.<br>• Beträge mit deutschem Format (`1.250,50 €`) werden normalisiert; negative Werte bei Einkommen werden abgewiesen. | [x] |

---

### 5. Checkboxen, Radio-Buttons & Auswahllisten

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 5.1 | **2-State Checkboxen (/Btn)** | Wenn der Agent nach einer Ja/Nein-Checkbox fragt (z. B. *"Möchten Sie den Newsletter erhalten?"*):<br>• Antwort `Ja` setzt das Häkchen im PDF.<br>• Antwort `Nein` lässt das Häkchen leer oder entfernt es. | [x] |
| 5.2 | **Radio-Button-Gruppen (1-aus-N)** | Bei Optionsfeldern (z. B. Geschlecht: `männlich / weiblich / divers`):<br>• Antwort `weiblich` aktiviert exakt diesen Radio-Button.<br>• Vorherige Optionen werden sauber deaktiviert. | [x] |
| 5.3 | **Dropdown- / Choice-Felder (/Ch)** | Bei Auswahllisten (z. B. Bundesland oder Staatsangehörigkeit):<br>• Der Agent nennt die gültigen Optionen oder akzeptiert die passende Eingabe und trägt sie ins PDF ein. | [x] |

---

### 6. Spracheingabe (STT) & Sprachausgabe (TTS)

*STT-Dienst auf Port 8002, TTS-Dienst auf Port 8005.*

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 6.1 | **Mikrofon-Aktivierung** | Klick auf das Mikrofon-Symbol im Eingabefeld fordert Browser-Berechtigung an.<br>• Das Icon wechselt in den Aufnahme-Zustand (Pulsieren). | [x] |
| 6.2 | **Live DAW VU-Meter** | Sobald du sprichst, schlägt das Pegel-Meter im ChatInput entsprechend deiner Lautstärke sichtbar aus. | [x] |
| 6.3 | **Hands-Free Live-Transkription** | Gesprochener Text (z. B. *"Berliner Straße 10"*) wird in Echtzeit in das Eingabefeld geschrieben.<br>• Automatische Groß-/Kleinschreibung und Zeichensetzung greifen. | [x] |
| 6.4 | **Absenden per Enter, Sprachbefehl oder Auto-Send** | Nach dem Diktat kann der Text mit `Enter`, per Sprachbefehl (*„... senden“*, *„... abschicken“*, *„... eintragen“*) oder vollautomatisch per VAD Stille-Erkennung bei aktivem `AUTO-SEND: ON` an den Agenten übermittelt werden (siehe Station 11). | [x] |
| 6.5 | **STT-Löschverhalten (Keine Textverdopplung)** | Bei laufendem Diktat im Textfeld Zeichen löschen (`Backspace`) oder Text editieren:<br>• Diktat stoppt sofort, Text wird gelöscht/gekürzt ohne Zeichenverdopplung ([FIX-2026-10-19-01]). | [x] |
| 6.6 | **Stilles Diktat-Stoppen (Kein `StreamText`-Leak)** | Klick auf Diktat, nichts sprechen, sofort wieder Stoppen:<br>• Kein rohes `StreamText(full='', ...)` im Textfeld sichtbar ([FIX-2026-10-18-03]). | [x] |
| 6.7 | **Sprachausgabe (TTS Vorlesen & Wiederholungs-Stabilität)** | Klick auf `Vorlesen` an einer Agenten-Nachricht liest den Text flüssig vor.<br>• Mehrfaches aufeinanderfolgendes Vorlesen (1., 2., 3. Klick) bricht nicht ab ([FIX-2026-10-18-04]). | [x] |
| 6.8 | **Akustischer STT/TTS-Interlock (Rückkopplungsschutz)** | Während `Vorlesen` aktiv ist, pausiert die Diktierfunktion automatisch (`Paused...`), um Lautsprecher-Echos zu verhindern. | [x] |
| 6.9 | **TTS Wiedergabe-Stopp & Single-GPU Exklusivität** | Während Audio abgespielt wird, wechselt der Button zu `Stop` (rot umrandet).<br>• Klick auf `Stop` bricht die Wiedergabe sofort ab.<br>• Klick auf `Vorlesen` bei einer anderen Nachricht stoppt die laufende Wiedergabe sofort und startet die neue Nachricht (Single-GPU Concurrency Lock, keine Stimmenüberlagerung). | [x] |
| 6.10 | **TTS Offline-Zustand & Disabled-Button** | Wenn der TTS-Dienst auf Port 8005 nicht aktiv ist:<br>• Header zeigt `TTS: Offline` (rot).<br>• Der `Vorlesen`-Button an allen Agenten-Nachrichten ist ausgegraut (`disabled`) mit dem Tooltip `Sprachausgabe offline (Port 8005)`. | [x] |

---

### 7. Kontext-Kompression & Telemetrie (Plans 025, 026, 027)

*Prüfung der Backend-Hygiene bei längeren Unterhaltungen.*

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 7.1 | **Uvicorn-Terminal Telemetrie** | Schau in das separate Backend-Konsolenfenster von `start_dev.ps1`:<br>• Bei Erreichen des Schwellenwerts (20 Messages oder 8.000 Tokens) erscheint das strukturierte Log:<br>```text
[CONTEXT TELEMETRY] Thread='...'
Messages: 20 -> 7 | Tokens vor Trigger: ~8.150 | Ersparnis: ~77%
Archive: data/conversation_history/..._archive.md
``` | [x] |
| 7.2 | **Zero Data Loss Archiv** | *(Hinweis: Standardmäßig ist `SUMMARIZATION_OFFLOAD_TO_FILE = False` in `src/config.py` zur Datensparsamkeit. Für diesen Test temporär auf `True` setzen).*<br>Öffne in VS Code den Ordner `data/conversation_history/`:<br>• Die Datei `<session_id>_archive.md` wurde angelegt.<br>• Sie enthält alle älteren Chat-Turns und Tool-Aufrufe chronologisch mit Timestamp. | [x] |
| 7.3 | **DevTools SSE-Event (F12)** | Drücke im Browser `F12` -> Tab **Network** -> Klick auf `/api/v1/chat` -> **EventStream**:<br>• Ein diskretes Event `telemetry` mit `{"type": "context_compacted"}` ist sichtbar.<br>• Im UI des Chats taucht keine störende Systemmeldung auf (Ansatz 4: absolute Ruhe für den User). | [x] |

---

### 8. Abschluss, ReadOnly-Flattening & PDF-Download

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 8.1 | **Fertigstellungs-Meldung** | Sobald alle Pflichtfelder ausgefüllt sind:<br>• Der Agent beglückwünscht dich und generiert den Download-Link.<br>• Der Fortschrittsbalken zeigt `100% ausgefüllt`. | [x] |
| 8.2 | **Download ausführen** | Klick auf `[PDF herunterladen]` im Chat oder `[Download PDF]` in der Toolbar lädt die finale PDF-Datei herunter.<br>• Der REST-Endpunkt `/api/v1/download/{thread_id}/{filename}` sucht die Datei primär im isolierten `SESSIONS_DIR` (mit robustem Fallback auf `DATA_DIR`) und liefert sie mit `Cache-Control: no-store, private` aus. | [x] |
| 8.3 | **Prüfung im externen PDF-Viewer** | Öffne das heruntergeladene PDF in Adobe Acrobat, Edge oder Chrome:<br>• Alle eingetragenen Werte stehen exakt an den richtigen Positionen.<br>• **ReadOnly-Schutz:** Die Formularfelder sind gesperrt/abgeflacht (`/Ff | 1`), sodass das Dokument nicht mehr versehentlich manipuliert werden kann. | [x] |
| 8.4 | **Deterministisches Download-Fangnetz im Chat** | Sobald das Formular zu 100 % ausgefüllt ist:<br>• Falls das Modell den Markdown-Link im Text vergisst oder einen Platzhalter verwendet, blendet das Frontend unter der Nachricht automatisch das Banner `[FERTIG] Formular vollständig ausgefüllt` mit dem Button `[PDF herunterladen]` ein ([FIX-2026-10-19-02]). | [x] |
| 8.5 | **PDF/UA Barrierefreiheit & Tab-Reihenfolge (Plan 035)** | Untersuche das ausgefüllte PDF (z. B. mit `PdfReader` oder Screenreader NVDA):<br>• Jede Seite besitzt ein definiertes `/Tabs`-Attribut (`/S` Structure Order bei getaggten PDFs wie SGB-II nach ISO 14289-1 § 7.18.1; `/R` Row Order bei ungetaggten Formularen).<br>• Beim Durchtabben springt der Fokus geordnet und vorhersehbar von oben nach unten ohne Verwirrung.<br>• Der semantische Strukturbaum (`/StructTreeRoot`), Markierungs-Info (`/MarkInfo`) und Spracheintrag (`/Lang: de-DE`) sind vollständig intakt.<br>• Feld-Tooltips (`/TU`) bleiben für Screenreader unverändert lesbar. | [x] |

---

### 9. Visuelle Barrierefreiheit (Plan 032: WCAG 2.1 AAA High-Contrast & Text-Skalierung)

*Prüfung der visuellen Accessibility-Mechanismen aus Plan 032.*

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 9.1 | **High-Contrast Theme Aktivierung** | Klick auf `CONTRAST` im Theme-Switcher im Header:<br>• Theme wechselt sofort in das WCAG 2.1 AAA Farbschema.<br>• Hintergrund wird tiefschwarz (`#000000`), Fließtext schneeweiß (`#ffffff`, 21:1 Kontrast), Akzente und aktive Buttons leuchtgelb (`#ffff00`, 19.55:1 Kontrast).<br>• Rahmen und Trennlinien sind scharf und deutlich sichtbar (`#ffffff` / `#d4d4d4`). | [x] |
| 9.2 | **Neongelb-Fokusringe (`:focus-visible`)** | Navigiere mit der `Tab`-Taste durch die Benutzeroberfläche im `CONTRAST`-Theme:<br>• Fokussierte Buttons, Eingabefelder und Schalter zeigen einen 2px breiten, scharfen neongelben Fokus-Rahmen (`outline: 2px solid #ffff00; outline-offset: 2px;`). | [x] |
| 9.3 | **3-Wege-Theme Rotation via `Alt+T`** | Drücke wiederholt `Alt+T` (bzw. `Option+T` auf macOS):<br>• Der Schalter rotiert zyklisch: `LIVE` $\rightarrow$ `PAPER` $\rightarrow$ `CONTRAST` $\rightarrow$ `LIVE`.<br>• Das jeweils aktive Theme wird visuell im Segment-Control hervorgehoben. | [x] |
| 9.4 | **Flexible Text-Skalierung (100% / 125% / 150%)** | Klick im Header auf `125%` bzw. `150%` im DAW-Segmentschalter `TEXT: [ 100% | 125% | 150% ]`:<br>• Sämtliche Fließtexte, Nachrichtenblöcke, Eingabefelder und Labels vergrößern sich proportional auf Basis von CSS `rem`.<br>• Kein Text überlappt oder wird abgeschnitten. | [x] |
| 9.5 | **Zyklisches Skalieren via Shortcut `Alt+S`** | Drücke wiederholt `Alt+S` (bzw. `Option+S` auf macOS):<br>• Textgröße rotiert zyklisch: `100%` $\rightarrow$ `125%` $\rightarrow$ `150%` $\rightarrow$ `100%`.<br>• Ist der Cursor im Chat-Eingabefeld fokussiert, stört die Tastenkombination nicht das Tippen normaler 's'-Zeichen. | [x] |
| 9.6 | **Split-Screen Layout-Stabilität bei 150%** | Wähle `150%` Textgröße bei geöffneter PDF-Vorschau und verändere die Splitter-Breite:<br>• Die rechte Header-Zone bricht sauber um (`flex-wrap`), ohne Steuerungselemente aus dem Bildschirm zu schieben.<br>• Chat-Nachrichten und Tool-Badges bleiben horizontal scrollfrei (`break-word`). | [x] |
| 9.7 | **Persistenz nach F5-Reload** | Wähle `CONTRAST` und `150%` Textgröße und lade die Seite mit `F5` neu:<br>• Beide Einstellungen bleiben sofort erhalten (`localStorage`: `pdf_form_agent_theme` und `pdf_form_agent_text_scale`).<br>• Kein Flackern beim Laden. | [x] |
| 9.8 | **Shortcuts-Modal Aktualisierung (`?`)** | Drücke `?` (bei un-fokussiertem Textfeld) oder klicke auf `[Shortcuts]`:<br>• Das Modal listet `Alt+T` mit `Theme wechseln (Live / Paper / Contrast)` und das neue Kürzel `Alt+S` mit `Textgröße anpassen (100% / 125% / 150%)` auf. | [x] |

---

### 10. Kognitive Barrierefreiheit & Chat-Fortschritt (Plan 033: BITV 2.0 / WCAG 2.1 AAA)

*Prüfung der visuellen und sprachlichen Schrittführung zur Vermeidung kognitiver Überlastung.*

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 10.1 | **Horizontaler DAW-Fortschrittsbalken im Chat-Pane** | Nach dem Upload eines interaktiven Formulars (z. B. `antrag.pdf`):<br>• Direkt unterhalb des Dokumenten-Uploaders erscheint die Leiste `ProgressBar` mit W3C-ARIA (`role="progressbar"`).<br>• Bei unvollständigem Formular wird `[FORTSCHRITT: SCHRITT X VON Y]` mit Prozentzahl und Akzent-Füllstand angezeigt. | [x] |
| 10.2 | **Permanente Sichtbarkeit bei geschlossener PDF-Vorschau** | Blende die PDF-Vorschau mit `Alt+P` oder Klick auf `PDF ausblenden` aus:<br>• Der Fortschrittsbalken bleibt an der Oberkante des vergrößerten Chat-Fensters voll sichtbar und aktualisiert sich nach jedem ausgefüllten Feld in Echtzeit. | [x] |
| 10.3 | **Strukturierte Schrittführung im Modell-Dialog** | Achte auf die Formulierungen des Assistenten bei jeder Frage:<br>• Jede Frage beginnt strukturiert mit `**Schritt X von Y (Thema):** [Frage]` (z. B. `**Schritt 1 von 12 (Vorname):** ...`).<br>• Die Zahlen stimmen exakt mit dem Chat-Fortschrittsbalken und der PDF-Toolbar überein. | [x] |
| 10.4 | **Abschluss-Zustand des Chat-Fortschrittsbalkens** | Sobald das letzte Formularfeld erfolgreich ausgefüllt ist:<br>• Die Chat-Fortschrittsleiste wechselt zu `[FORTSCHRITT: Y/Y FELDER ABGESCHLOSSEN]`.<br>• Die Prozentanzeige springt auf `100%` und der Balken leuchtet im Signal-Grün (`bg-app-success`). | [ ] |

---

### 11. Sprachbefehle & Freihand-Steuerung (Plan 034: Voice Commands & Hands-Free)

*Prüfung der zustandslosen Sprachbefehle während des STT-Diktats (`Alt+D`).*

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 11.1 | **Sprachbefehl `SEND`: Satzende-Trigger** | Aktiviere Spracheingabe (`Alt+D`) und diktiere z. B. *"Danny Mustermann, senden"* oder *"10115 Berlin abschicken"*:<br>• Das Feedback-Badge `[BEFEHL: SENDEN]` leuchtet für 2,5 Sekunden über dem Eingabefeld auf.<br>• Der Text wird ohne das Triggerwort (*"Danny Mustermann"* bzw. *"10115 Berlin"*) sofort an den Agenten abgeschickt.<br>• Das Eingabefeld wird geleert. | [x] |
| 11.2 | **Sprachbefehl `REPEAT_QUESTION`: 0-Token Vorlesen** | Diktiere *"Wiederhole die Frage"* oder *"Frage wiederholen"*:<br>• Das Badge `[BEFEHL: WIEDERHOLE FRAGE]` leuchtet auf.<br>• Die TTS liest die letzte Frage des Assistenten vor – ohne zusätzliche LLM-Inferenz oder Token-Verbrauch. | [ ] |
| 11.3 | **Sprachbefehl `DOWNLOAD_FORM`: PDF-Download** | Diktiere *"Formular herunterladen"* oder *"PDF downloaden"*:<br>• Das Badge `[BEFEHL: DOWNLOAD]` erscheint.<br>• Der Browser öffnet den Download der PDF-Datei in einem neuen Tab. | [x] |
| 11.4 | **Sprachbefehl `STEP_BACK`: Dialog-Korrektur** | Diktiere *"Einen Schritt zurück"* oder *"Schritt zurück"*:<br>• Das Badge `[BEFEHL: SCHRITT ZURÜCK]` erscheint.<br>• Der Prompt *"Einen Schritt zurück bitte"* wird an den Dialog-Agenten übermittelt. | [x] |
| 11.5 | **Abgrenzung zu echten Fragen (Negativ-Test)** | Diktiere eine inhaltliche Frage wie *"Wohin soll ich das senden?"*:<br>• Das System löst **keinen** Sende-Befehl aus (`type: NONE`), sondern trägt den Text normal in das Chat-Feld ein. | [x] |
| 11.6 | **Hilfe-Modal Übersicht** | Öffne das Hilfe-Modal (`?`):<br>• Unter `Sprachbefehle (Freihand / Diktat)` sind alle 4 Sprachkommandos und Signalwörter übersichtlich im DAW-Monospace-Design gelistet. | [x] |
| 11.7 | **VAD Stille-Erkennung & Auto-Send Countdown (Plan 037)** | Klicke im ChatInput auf den Button `AUTO-SEND: OFF` (oder drücke `Alt+A` / `Option+A`):<br>• Schalter wechselt zu `AUTO-SEND: ON` (akzentfarben umrandet, Zustand bleibt nach `F5` erhalten).<br>• Aktiviere Spracheingabe (`Alt+D`) und diktiere Text (z. B. *"Max Mustermann"*).<br>• Wenn du aufhörst zu sprechen (`audioLevel <= 0.03`), startet nach 1.800 ms Stille das pulsierende Countdown-Badge `[AUTO-SEND IN 1S... (TASTE/SPRECHEN BRICHT AB)]`.<br>• **Sofortiger Abbruch:** Sprichst du während des Countdowns weiter oder drückst eine Taste im Eingabefeld, verschwindet das Badge sofort und kein Senden wird ausgelöst.<br>• **Hands-Free Senden:** Läuft die Sekunde ungestört ab, stoppt die Aufnahme, das Eingabefeld leert sich, die Nachricht wird abgeschickt und `[BEFEHL: AUTO-SEND]` leuchtet kurz auf. | [x] |
| 11.8 | **TTS Voice-Kopplung & Error-Auto-Dismiss (Plan 042)** | • Schalte TTS im Header auf `TTS: OFF` (oder teste bei gestopptem Port 8005): Diktiere *"Wiederhole die Frage"*. Das Badge `[BEFEHL: WIEDERHOLE FRAGE]` leuchtet kurz auf, es entsteht jedoch **kein** roter Verbindungsfehlerbalken.<br>• Falls mitten im Betrieb ein echter TTS-Fehler auftritt: Der rote Fehlerbalken verschwindet nach **4 Sekunden automatisch** (Auto-Dismiss), statt im Chatbereich festzukleben. | [x] |

---

### 12. Stammdaten-Vorbelegung (Autofill) & Profil-Editor (Plan 036: Notizzettel & REST-Editor)

*Prüfung des Stammdaten-Notizzettels, Zero-Latency-Dateitransfers und automatischen Batch-Autofills in Turn 1.*

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :---: |
| 12.1 | **Modal-Aufruf & Tastaturkürzel (`Alt+U`)** | Drücke `Alt+U` (macOS: `Option+U`) oder klicke im Header auf `[STAMMDATEN: LEER]`:<br>• Das Profil-Modal `UserProfileModal` öffnet sich mit ARIA-Dialog-Semantik (`role="dialog"`).<br>• Wenn noch kein Profil gespeichert wurde, erscheint die strukturierte Monospace-Vorlage (Name, Anschrift, IBAN, Steuer-ID etc.).<br>• Schließen per `Escape`, Klick auf `Schließen` oder Klick auf den abgedunkelten Hintergrund funktioniert sofort. | [x] |
| 12.2 | **Eingabe & Speichern (`[SPEICHERN]`)** | Trage persönliche Testdaten ein (z. B. Name, Straße, PLZ, IBAN) und klicke auf `[SPEICHERN]`:<br>• Die Daten werden atomar über `POST /api/v1/user-profile` in `data/user_profile.txt` gespeichert.<br>• Ein grüner Bestätigungshinweis erscheint und der Zeitstempel (*„Stand: HH:MM“*) wird aktualisiert.<br>• Der Header-Button wechselt zu `[STAMMDATEN: AKTIV]` (smaragdgrün). | [x] |
| 12.3 | **Lokaler TXT-Export (`[TXT EXPORTIEREN]`)** | Klicke im Modal auf `[TXT EXPORTIEREN]`:<br>• Der Browser lädt sofort eine Sicherungsdatei `user_profile.txt` mit dem aktuellen Textinhalt herunter (Blob-Download ohne Server-Roundtrip). | [x] |
| 12.4 | **Zero-Latency TXT-Import (`[TXT IMPORTIEREN]`)** | Klicke auf `[TXT IMPORTIEREN]` und wähle eine beliebige lokale `.txt`- oder `.md`-Datei aus:<br>• Der HTML5 `FileReader` liest den Text lokal im Browser in Millisekunden ein und ersetzt den Inhalt der Textarea.<br>• Eine Erfolgsmeldung bestätigt den Import (*„Datei '...' erfolgreich importiert“*). | [x] |
| 12.5 | **Client- & Server-Sicherheitslimit (64 KB Cap)** | Importiere oder füge einen Text mit mehr als 65.536 Zeichen/Bytes ein:<br>• Der Byte-Zähler färbt sich rot (`> 65536 Bytes`).<br>• Der Button `[SPEICHERN]` wird deaktiviert und ein Speichern über 64 KB wird strikt abgewiesen (HTTP 413). | [x] |
| 12.6 | **Turn-1 Batch-Autofill im PDF-Workflow** | Lade bei aktivem Profil (`[STAMMDATEN: AKTIV]`) ein PDF-Formular hoch (z. B. `data/input/pdfs/test_form_3.pdf`):<br>• Der Agent ruft im Hintergrund `read_pdf_form` und sofort `get_user_profile` auf.<br>• Übereinstimmende Stammdaten (wie Name, IBAN, PLZ etc.) werden gebündelt im ersten Turn per `fill_pdf_form` vorbefüllt.<br>• Die PDF-Vorschau aktualisiert sich live mit den eingetragenen Feldern.<br>• Der Assistent fasst transparent zusammen, welche Felder vorbefüllt wurden, und stellt direkt die Frage zum ersten verbleibenden offenen Feld. | [x] |
| 12.7 | **Profil löschen (`[PROFIL LÖSCHEN]`)** | Klicke im Editor auf `[PROFIL LÖSCHEN]` und bestätige den Sicherheitsdialog:<br>• Die Datei auf dem Server wird via `DELETE /api/v1/user-profile` rückstandslos entfernt.<br>• Die Textarea wird auf die leere Standard-Vorlage zurückgesetzt.<br>• Der Header-Button wechselt sofort zurück zu `[STAMMDATEN: LEER]`. | [x] |
| 12.8 | **Autofill-Umschalter für Drittpersonen (`Autofill: ON \| OFF`) (Plan 044)** | Standardmäßig steht der Schalter unter der Dropzone auf `Autofill: OFF` (Status: `Leeres Formular`, sichere Grundeinstellung für Dritte):<br>• Lade ein PDF-Formular hoch (z. B. `test_form_3.pdf`): Der Agent übernimmt **keine** Stammdaten aus dem Profil, ruft im Turn 1 **kein** `fill_pdf_form` auf und beginnt neutral ab Schritt 1 mit der Abfrage aller Felder.<br>• Klicke auf `Autofill: OFF`: Schalter wechselt zu `Autofill: ON` (Status: `Stammdaten aktiv`, akzentfarben hinterlegt). Beim Upload werden eigene Daten vorbefüllt.<br>• Der Umschalter bleibt nach `F5` erhalten (`localStorage`: `pdf_form_agent_autofill_enabled`). | [x] |

---

### 13. Hybrides Formular-Ausfüllen (Plan 045: Action-Chips & Formular-Inspektor)

*Prüfung der Klick-Chips für Auswahlen/Kreuze, des umschaltbaren Formular-Inspektors und der Agenten-Synchronisation beim Mischen der Modi.*

| Nr. | Prüfschritt | Erwartetes Verhalten | Status |
| :--- | :--- | :--- | :--- |
| 13.1 | **Klick-Kreuze / Action-Chips im Chat (`/Btn` & `/Ch`)** | Lade ein Formular hoch (z. B. `test_form_3.pdf`):<br>• Sobald der Assistent eine Frage zu einem Auswahl- oder Checkbox-Feld stellt (z. B. *Familienstand* oder *Erwerbstätigkeit*), erscheinen unter der Frage klickbare Buttons (z. B. `[ Ja ]` `[ Nein ]` oder `[ Ledig ]` `[ Verheiratet ]`).<br>• Ein Klick auf einen Chip sendet die Antwort sofort ab, das PDF wird aktualisiert und der nächste Schritt wird eingeleitet. | [x] |
| 13.2 | **Hands-Free Parität bei Action-Chips** | Aktiviere Spracheingabe (`Alt+D`) bei angezeigten Action-Chips:<br>• Sprich das Wort des gewünschten Chips laut aus (z. B. *„Ja“* oder *„Ledig“*).<br>• Das System reagiert exakt identisch zum Mausklick (Zwei-Kanal-Prinzip). | [x] |
| 13.3 | **Ansichts-Umschaltung (`[ CHAT ]` vs. `[ FORMULAR ]`)** | Klicke oberhalb des Chatbereichs auf den Schalter `ANSICHT: FORMULAR` (oder drücke `Alt+M` / `Option+M`):<br>• Die Chatansicht wechselt sauber zum `FormInspector`.<br>• Die PDF-Vorschau im rechten Fensterbereich bleibt stabil erhalten. | [x] |
| 13.4 | **Formular-Inspektor: Strukturierte Feldanzeige** | In der Formular-Ansicht:<br>• Alle AcroForm-Felder des Dokuments werden untereinander mit verständlichem Label, Typ und aktuellem Status (`[✓]` grün für befüllte Felder, `[ ]` dezent für offene Felder) aufgelistet.<br>• Jedes Feld besitzt das passende native HTML-Steuerelement (Text-Input, Dropdown, Checkbox oder Radio-Buttons). | [ ] |
| 13.5 | **Manuelle Direkteingabe & Live-Speichern (`[SPEICHERN]`)** | Trage in der Formularmaske manuell Werte ein (z. B. Netto-Gehalt *„3200 €“*) und setze Kreuze bei Checkboxen:<br>• Klicke unten auf `[SPEICHERN]`.<br>• Ein grüner Bestätigungshinweis erscheint.<br>• Das PDF im rechten Fenster aktualisiert sich sofort live mit den neuen Werten und der Fortschrittsbalken oben springt synchron nach oben. | [ ] |
| 13.6 | **Agenten-Synchronisation beim Modus-Wechsel (Mischbetrieb)** | Trage im Formular-Inspektor ein Feld manuell ein (z. B. *Gehalt*), wechsle mit `Alt+M` zurück zu `[ CHAT ]` und schreibe oder sprich *„Weiter bitte“*:<br>• Der Agent liest das PDF über `read_pdf_form` neu ein, erkennt das bereits manuell befüllte Gehaltsfeld und fragt dieses **nicht** mehr ab, sondern macht direkt mit dem nächsten offenen Feld weiter. | [ ] |

---

## Schneller Befehls-Spickzettel

```powershell
# 1. Dev-Server starten (Backend + Frontend + Browser)
.\start_dev.ps1

# 2. Vollständige Backend-Testsuite ausführen (144 Tests)
uv run pytest

# 3. Vollständige Frontend-Testsuite ausführen (203 Tests)
npm test --prefix frontend

# 4. Frontend Production-Build testen
npm run build --prefix frontend
```
