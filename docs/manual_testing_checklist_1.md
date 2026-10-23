# Manual End-to-End Testing Checklist (`manual_testing_checklist_1.md`)

This checklist guides developers, QA engineers, and contributors step-by-step through testing all features, user interfaces, security barriers, accessibility standards, and workflows of the **PDF Form Agent** directly within the running web application (`http://localhost:5173`).

---

## Preparation & Quickstart

1. **Start Ollama Daemon:**
   ```bash
   ollama serve
   ```
   *Verify that at least one supported model is installed (e.g. `ollama pull qwen2.5:7b` or `ollama pull gemma2:9b`).*

2. **Launch Application Servers:**
   * **Windows (PowerShell):**
     ```powershell
     .\start_dev.ps1
     ```
   * **Linux & macOS (Bash):**
     ```bash
     chmod +x ./start_dev.sh
     ./start_dev.sh
     ```
   *This starts the FastAPI backend (Port 8001), Vite development server (Port 5173), and automatically opens the browser at `http://localhost:5173`.*

---

## Checklist: 13 Testing Stations

### 1. Header, System Health & Global Controls

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 1.1 | **Triple-Status Health Indicator (API / STT / TTS)** | Three status badges are visible in the top-right header area:<br>• `API: Online` (green)<br>• `STT: Online / Offline` (green when Port 8002 is active, otherwise red)<br>• `TTS: Online / Offline` (green when Port 8005 is active, otherwise red)<br>• Automated health polling executes every 15 seconds in the background. | [ ] |
| 1.2 | **Model Selector** | The dropdown menu lists all locally available Ollama models. Selecting a different model takes effect immediately for subsequent chat turns. | [ ] |
| 1.3 | **Thinking Mode Toggle** | Clicking `Thinking: OFF` switches to `Thinking: ON`. For compatible models (e.g., Qwen 2.5, DeepSeek), model reasoning tokens are rendered in expandable thought blocks. | [ ] |
| 1.4 | **Theme Switcher (3 Themes)** | Clicking `THEME: [ LIVE \| PAPER \| CONTRAST ]` (or pressing shortcut `Alt+T` / `Option+T`) smoothly transitions between:<br>• **Ableton Live 12 Dark Theme** (studio matte dark theme)<br>• **Swiss Paper Light Theme** (archival light theme)<br>• **High-Contrast Theme** (WCAG 2.1 AAA certified, pure black `#000000`, white `#ffffff`, and signal yellow `#ffff00`).<br>Selected theme persists across reloads (`localStorage`). | [ ] |
| 1.5 | **Text Scaling (100% / 125% / 150%)** | Clicking `TEXT: [ 100% \| 125% \| 150% ]` (or pressing shortcut `Alt+S` / `Option+S`) scales all UI components and typography proportionally using root CSS `rem`. Persists across page reload (`localStorage`). | [ ] |
| 1.6 | **New Session Button** | Clicking `New Session` clears conversation state, resets PDF preview, and generates a fresh isolated `thread_id`. | [ ] |
| 1.7 | **Keyboard Shortcuts Modal (`?`)** | Pressing `?` (when no input field is focused) opens the `ShortcutsModal`.<br>• Displays all DAW-style keyboard commands (`Alt+D`, `Alt+A`, `Alt+V`, `Alt+P`, `Alt+T`, `Alt+S`, `Alt+U`, `Alt+M`, `Escape`, `Enter`, `Shift+Enter`) and all 4 voice commands (`SEND`, `REPEAT_QUESTION`, `DOWNLOAD_FORM`, `STEP_BACK`).<br>• Pressing `Escape` or clicking `Close` reliably dismisses the modal. | [ ] |
| 1.8 | **Master Data Profile Status Button (`[STAMMDATEN]`)** | Header button displays the current user profile state:<br>• `[STAMMDATEN: LEER]` (neutral/muted when no profile is stored).<br>• `[STAMMDATEN: AKTIV]` (emerald green highlight once profile data is saved).<br>• Clicking or pressing shortcut `Alt+U` / `Option+U` opens the profile notepad editor (`UserProfileModal`). | [ ] |
| 1.9 | **TTS Master Toggle & Shortcut (`Alt+V`)** | Clicking `TTS: ON` toggles to `TTS: OFF` (or shortcut `Alt+V` / `Option+V`):<br>• Switch resides in the top menu bar directly adjacent to `Thinking: ON \| OFF`.<br>• Highlights in accent color when `ON`.<br>• State persists across reload (`localStorage`: `pdf_form_agent_tts_enabled`).<br>• When `TTS: OFF`, all `[Vorlesen]` buttons in the chat are disabled (with tooltip *"Sprachausgabe im Header deaktiviert"*). | [ ] |
| 1.10 | **TTS Voice Selection & Audition Preview** | Next to the TTS toggle, a voice dropdown `Voice: [ Klara (Ruhig) \| Uwe (Nachrichten) \| Jonas (Lässig) ]` and a preview button `[ Probe ]` are displayed:<br>• Selecting a voice plays a sample preview sentence (when `TTS: ON` and service is online).<br>• Clicking `[ Probe ]` replays the preview sample for the active voice.<br>• Both controls are disabled when `TTS: OFF` or during active SSE streaming.<br>• Voice preference persists across reload (`localStorage`: `pdf_form_agent_tts_voice`). | [ ] |

---

### 2. Layout, Split-Screen & Viewport Resizing

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 2.1 | **Dual-Pane Split-Screen** | Left pane: Chat workspace. Right pane: Live PDF viewer. Both panes are cleanly aligned with zero horizontal overflow. | [ ] |
| 2.2 | **Draggable Resizer** | Hovering over the vertical divider displays a `col-resize` cursor. Dragging left or right smoothly resizes the panes.<br>• Min/max constraints (25% / 75%) prevent collapsing. | [ ] |
| 2.3 | **Collapsible PDF Viewport** | Clicking `PDF ausblenden` (or pressing `Alt+P`):<br>• PDF pane smoothly collapses.<br>• Chat pane expands to 100% full screen.<br>• Button toggles to `PDF anzeigen`. Clicking again restores previous split ratio accurately. | [ ] |

---

### 3. PDF Upload & Document Inspection

*Recommended test document: [`data/input/pdfs/test_form_3.pdf`](../data/input/pdfs/test_form_3.pdf) (compact 8-field form with text, dropdown, radio buttons, and checkboxes).*

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 3.1 | **Drag & Drop / File Input Upload** | Drag a PDF file into the drop zone or browse to select.<br>• PDF renders immediately in the right iframe viewer.<br>• Upload drop zone hides and the PDF toolbar appears.<br>• **Non-Blocking Concurrency:** Payload security inspection (`inspect_pdf_security`), file storage, and AcroForm extraction run non-blocking via `asyncio.to_thread` in worker threads; session cleanup runs as a non-blocking `BackgroundTask`. | [ ] |
| 3.2 | **Upload Security Constraints (Negative Test)** | Attempt uploading a non-PDF file (e.g. `.exe`, `.txt`) or a file exceeding 25 MB:<br>• Upload is rejected with an informative error banner (magic bytes MIME verification). | [ ] |
| 3.3 | **Flat PDF Detection** | Upload a static PDF lacking interactive AcroForm fields (e.g. scanned letter):<br>• PDF toolbar renders a warning badge: `[Notice: Flat PDF without interactive form fields]`. | [ ] |
| 3.4 | **AcroForm Progress Tracking** | Upload an interactive PDF form:<br>• Toolbar displays `0 von X Feldern ausgefüllt (0%)` alongside the progress bar. | [ ] |
| 3.5 | **PDF Toolbar & Page Navigation** | Page navigation buttons work (`Seite 1 von N`, arrow buttons). Zoom controls zoom in/out smoothly. | [ ] |

---

### 4. Guided Form Interview (ReAct Agent Core)

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 4.1 | **Natural Language Interaction** | Agent greets the user and asks for the first field in natural language.<br>• **Strict Constraint:** Agent never leaks internal technical identifiers (such as `txt_vorname` or `chk_datenschutz`) to the user; speaks exclusively in human terminology. | [ ] |
| 4.2 | **Single-Field Focus** | Agent asks strictly for one field at a time and waits for user input. Prevents overwhelming multi-question prompts. | [ ] |
| 4.3 | **Live Incremental Form Filling** | Provide an answer (e.g. `Max` for name):<br>• Agent invokes `fill_pdf_form`.<br>• Right PDF viewer refreshes live with the updated value written into the AcroForm.<br>• Form progress increment advances (e.g. `1 von 8 Feldern ausgefüllt`). | [ ] |
| 4.4 | **Umlaut & UTF-8 Integrity** | Enter text with German umlauts and special characters (e.g. `Jürgen Weiß-Müller, München`):<br>• Field value appears in the PDF with correct characters (`ü`, `ä`, `ö`, `ß`) and zero raw escape sequences like `\u00fc`. | [ ] |
| 4.5 | **Streaming & Reasoning Visibility** | While agent streams responses:<br>• Text tokens stream smoothly token-by-token.<br>• If `Thinking: ON`, a collapsible `[Thought / Reasoning]` block renders above the answer. | [ ] |
| 4.6 | **Mandatory Tool Call Enforcement** | Whenever the model confirms writing field values, it technically executes `fill_pdf_form` in the exact same turn.<br>• Strictly prohibited from claiming fields are filled in text without executing the tool. | [ ] |
| 4.7 | **Tool Inspection Badge (`ToolCallBadge`)** | Tool execution renders as an expandable monospace badge (e.g. `fill_pdf_form`).<br>• Clicking `[DETAILS]` expands `[INPUT]` (arguments) and `[OUTPUT]` (JSON response).<br>• Clicking `[COLLAPSE]` collapses details cleanly. | [ ] |
| 4.8 | **Validation Firewall: Calendar Date & Age Rules** | Enter an invalid calendar date (e.g. `31.02.1990`, `29.02.2023`) or a future birth date:<br>• Middleware intercepts tool call before PDF disk write (**Zero Dirty Writes**).<br>• PDF preview remains untouched.<br>• Agent explains calendar constraint in natural language and prompts for correction. | [ ] |
| 4.9 | **Validation Firewall: ISO 7064 Modulo-97 IBAN Check** | Enter a German IBAN with an invalid checksum (e.g. `DE89 3704 0044 0532 0130 01`):<br>• Modulo-97 check fails and short-circuits execution.<br>• Tool execution is blocked; agent politely requests checking account number or check digits. | [ ] |
| 4.10 | **Validation Firewall: Postal Code & Currency Parsing** | Test edge cases:<br>• Postal code with < 5 digits is rejected; leading zero (`01067`) is preserved.<br>• European currency formats (`1.250,50 €`) are normalized to `1250.50`; negative amounts are rejected. | [ ] |

---

### 5. Checkboxes, Radio Buttons & Option Lists

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 5.1 | **2-State Checkboxes (/Btn)** | When agent prompts for a Yes/No checkbox (e.g. *"Möchten Sie den Newsletter erhalten?"*):<br>• Answering `Ja` checks the box in the PDF.<br>• Answering `Nein` leaves it unchecked (`/Off`) without triggering false-positive date validation ([FIX-2026-10-23-01]). | [ ] |
| 5.2 | **Radio Button Groups (1-of-N)** | For radio option fields (e.g. employment status: `ja / nein`):<br>• Answering `ja` activates option state `/0` or `/1` correctly.<br>• Radio group retains mutual exclusivity without deactivating all buttons. | [ ] |
| 5.3 | **Dropdown Choice Fields (/Ch)** | For choice fields (e.g. marital status: `ledig, verheiratet, geschieden, verwitwet`):<br>• Agent lists available options, validates input, and writes normalized value to the AcroForm. | [ ] |

---

### 6. Voice Dictation (STT) & Speech Synthesis (TTS)

*Requires STT microservice on Port 8002 and TTS microservice on Port 8005.*

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 6.1 | **Microphone Activation** | Clicking microphone icon in chat input requests browser permission.<br>• Icon pulses in recording state. | [ ] |
| 6.2 | **Live Audio VU-Meter** | When speaking, horizontal VU level meter dynamically responds to voice input volume. | [ ] |
| 6.3 | **Hands-Free Live Transcription** | Spoken speech (e.g. *"Musterstraße 42"*) streams in real time into the text area with capitalization and punctuation. | [ ] |
| 6.4 | **Dispatch via Enter, Voice Command, or Auto-Send** | Speech can be submitted via `Enter`, voice trigger (*„... senden“*, *„... abschicken“*), or hands-free via VAD silence detection (`AUTO-SEND: ON`). | [ ] |
| 6.5 | **STT Text Editing Resilience** | Pressing `Backspace` or typing while dictating terminates recording immediately and updates text cleanly without duplication ([FIX-2026-10-19-01]). | [ ] |
| 6.6 | **Silent Dictation Termination** | Clicking record, remaining silent, and stopping does not leak raw Python objects like `StreamText(...)` into the input ([FIX-2026-10-18-03]). | [ ] |
| 6.7 | **TTS Speech Playback** | Clicking `[Vorlesen]` on assistant message streams natural speech playback via Web Audio API.<br>• Consecutive clicks across messages do not drop or abort socket connection ([FIX-2026-10-18-04]). | [ ] |
| 6.8 | **Acoustic STT/TTS Feedback Interlock** | While `[Vorlesen]` is actively playing, microphone dictation automatically pauses (`Paused...`) to prevent speaker echo loops. | [ ] |
| 6.9 | **TTS Playback Stop & Single-GPU Concurrency** | While playing audio, button displays `Stop` with red outline.<br>• Clicking `Stop` cancels playback immediately.<br>• Clicking `[Vorlesen]` on another message immediately halts prior playback and switches smoothly (no overlapping voices). | [ ] |
| 6.10 | **TTS Offline Graceful Degradation** | When TTS service on Port 8005 is offline:<br>• Header shows `TTS: Offline` (red).<br>• `[Vorlesen]` buttons are disabled with tooltip `Sprachausgabe offline (Port 8005)`. | [ ] |

---

### 7. Context Compression & Telemetry

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 7.1 | **Terminal Telemetry Logs** | In backend console, reaching trigger threshold (20 messages or 8,000 tokens) outputs structured telemetry:<br>```text
[CONTEXT TELEMETRY] Thread='...'
Messages: 20 -> 7 | Tokens before Trigger: ~8,150 | Savings: ~77%
Archive: data/conversation_history/..._archive.md
``` | [ ] |
| 7.2 | **Zero Data Loss Archive** | When `SUMMARIZATION_OFFLOAD_TO_FILE = True` in `src/config.py`:<br>• Pruned conversation turns are archived chronologically in `data/conversation_history/<session_id>_archive.md`. | [ ] |
| 7.3 | **DevTools SSE Telemetry Event** | Open Browser DevTools (`F12`) -> Network -> `/api/v1/chat` -> EventStream:<br>• Discrete SSE event `event: telemetry` with `{"type": "context_compacted"}` appears without cluttering user chat UI. | [ ] |

---

### 8. Completion, Read-Only Flattening & PDF Download

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 8.1 | **Completion Banner** | Upon filling all required fields:<br>• Agent confirms completion and generates download link.<br>• Progress bar displays `100% ausgefüllt`. | [ ] |
| 8.2 | **Download Delivery** | Clicking `[PDF herunterladen]` in chat or `[Download PDF]` in toolbar downloads the finalized PDF.<br>• Served from isolated session directory with `Cache-Control: no-store, private`. | [ ] |
| 8.3 | **External PDF Viewer Verification** | Open downloaded PDF in Adobe Acrobat, Edge, or Preview:<br>• All entered values appear in exact field coordinates.<br>• **ReadOnly Protection:** Form fields are locked/flattened (`/Ff | 1`) to prevent tampering. | [ ] |
| 8.4 | **Deterministic Download Safety Net** | If model omits markdown download link upon 100% completion:<br>• Frontend automatically injects `[FERTIG] Formular vollständig ausgefüllt` banner with `[PDF herunterladen]` action button ([FIX-2026-10-19-02]). | [ ] |
| 8.5 | **PDF/UA Accessibility & Tab Order** | Inspect output PDF with screenreader (NVDA/JAWS):<br>• Document specifies `/Tabs /S` (Structure Order) for tagged PDFs or `/Tabs /R` (Row Order) for untagged forms.<br>• Tab navigation moves in logical top-to-bottom sequence.<br>• Semantic structure tree (`/StructTreeRoot`), `/MarkInfo`, and `/Lang: de-DE` remain intact.<br>• Field tooltips (`/TU`) remain readable for assistive technologies. | [ ] |

---

### 9. Visual Accessibility (WCAG 2.1 AAA High-Contrast & Text Scaling)

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 9.1 | **High-Contrast Theme Activation** | Select `CONTRAST` in theme switcher:<br>• UI switches immediately to WCAG 2.1 AAA high-contrast palette.<br>• Background is deep black (`#000000`), body text pure white (`#ffffff`, 21:1 contrast), and active controls signal yellow (`#ffff00`, 19.55:1 contrast). | [ ] |
| 9.2 | **High-Visibility Focus Rings (`:focus-visible`)** | Tab through interface elements in `CONTRAST` theme:<br>• Focused elements display a sharp 2px neon yellow outline (`outline: 2px solid #ffff00; outline-offset: 2px;`). | [ ] |
| 9.3 | **Cyclic Theme Rotation (`Alt+T`)** | Repeatedly press `Alt+T` (or `Option+T`):<br>• Themes cycle: `LIVE` $\rightarrow$ `PAPER` $\rightarrow$ `CONTRAST` $\rightarrow$ `LIVE`. Active theme button reflects state. | [ ] |
| 9.4 | **Text Scaling (100% / 125% / 150%)** | Select `125%` or `150%` in header segment control:<br>• All text, message blocks, and input elements scale proportionally via CSS `rem` without clipping. | [ ] |
| 9.5 | **Cyclic Text Scaling (`Alt+S`)** | Press `Alt+S` (or `Option+S`):<br>• Scales cycle: `100%` $\rightarrow$ `125%` $\rightarrow$ `150%` $\rightarrow$ `100%`. When typing in input field, normal 's' keystrokes are unaffected. | [ ] |
| 9.6 | **Responsive Header Wrap at 150%** | Set `150%` text scaling with open PDF preview:<br>• Header controls wrap cleanly (`flex-wrap`) without overlapping or pushing action buttons off-screen. | [ ] |
| 9.7 | **F5 Persistence** | Set `CONTRAST` and `150%` and reload with `F5`:<br>• Both settings persist cleanly without flash of unstyled content (`localStorage`). | [ ] |

---

### 10. Cognitive Accessibility & Chat Progress Tracking

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 10.1 | **Pinned Progress Bar in Chat Pane** | After loading an interactive PDF form:<br>• Horizontal `ProgressBar` with W3C-ARIA semantics (`role="progressbar"`) appears above chat messages.<br>• Displays `[FORTSCHRITT: SCHRITT X VON Y]` with percentage and accent fill bar. | [ ] |
| 10.2 | **Persistence When PDF Viewport is Hidden** | Hide PDF viewport with `Alt+P` or `PDF ausblenden`:<br>• Progress bar remains pinned at the top of full-width chat pane and updates in real time. | [ ] |
| 10.3 | **Structured Step Prefix Guidance** | Assistant precedes every question with structured step prefixes:<br>• Format: `**Schritt X von Y (Thema):** [Question]`. Numbers match progress bar exactly. | [ ] |
| 10.4 | **Progress Bar Completion State** | Upon filling final field:<br>• Progress bar switches to `[FORTSCHRITT: Y/Y FELDER ABGESCHLOSSEN]`, advances to 100%, and highlights in signal green (`bg-app-success`). | [ ] |

---

### 11. Voice Commands & Hands-Free Control

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 11.1 | **Voice Command `SEND`** | Dictate with `Alt+D`: *"Max Mustermann, senden"* or *"Berlin abschicken"*:<br>• Badge `[BEFEHL: SENDEN]` illuminates for 2.5 seconds.<br>• Clean text (*"Max Mustermann"*) is submitted immediately without the trigger word. | [ ] |
| 11.2 | **Voice Command `REPEAT_QUESTION`** | Dictate *"Wiederhole die Frage"* or *"Frage wiederholen"*:<br>• Badge `[BEFEHL: WIEDERHOLE FRAGE]` appears.<br>• TTS replays the assistant's previous question with 0 additional LLM tokens. | [ ] |
| 11.3 | **Voice Command `DOWNLOAD_FORM`** | Dictate *"Formular herunterladen"* or *"PDF downloaden"*:<br>• Badge `[BEFEHL: DOWNLOAD]` appears.<br>• Finalized PDF opens in a new browser download tab. | [ ] |
| 11.4 | **Voice Command `STEP_BACK`** | Dictate *"Einen Schritt zurück"*:<br>• Badge `[BEFEHL: SCHRITT ZURÜCK]` appears and correction request is sent to the agent. | [ ] |
| 11.5 | **Disambiguation Guard (Negative Test)** | Dictate an informational question like *"Wohin soll ich das senden?"*:<br>• System recognizes non-command utterance (`type: NONE`) and enters text normally without false triggering. | [ ] |
| 11.6 | **VAD Silence Detection & Auto-Send Countdown** | Click `AUTO-SEND: OFF` (or press `Alt+A` / `Option+A`) to switch to `AUTO-SEND: ON`:<br>• Start speaking via `Alt+D`. Upon 1,800 ms silence, animated countdown badge `[AUTO-SEND IN 1S... (TASTE/SPRECHEN BRICHT AB)]` appears.<br>• **Instant Abort:** Resuming speech or pressing any key aborts countdown immediately.<br>• **Hands-Free Send:** If 1 second elapses undisturbed, recording stops and message dispatches automatically. | [ ] |
| 11.7 | **TTS Error Auto-Dismiss** | If an audio network error occurs:<br>• Red error banner dismisses automatically after **4 seconds** instead of remaining stuck in the UI. | [ ] |

---

### 12. Master Data Autofill & User Profile Notepad

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 12.1 | **Modal Invocation & Shortcut (`Alt+U`)** | Press `Alt+U` (or `Option+U`) or click `[STAMMDATEN: LEER]`:<br>• Profile modal `UserProfileModal` opens with accessible dialog semantics (`role="dialog"`).<br>• Closing via `Escape`, `[Schließen]`, or backdrop click works immediately. | [ ] |
| 12.2 | **Save Master Data (`[SPEICHERN]`)** | Enter personal profile notes (Name, Address, IBAN, Tax ID) and click `[SPEICHERN]`:<br>• Saved atomically via `POST /api/v1/user-profile` to `data/user_profile.txt`.<br>• Header badge turns emerald green: `[STAMMDATEN: AKTIV]`. | [ ] |
| 12.3 | **Local TXT Export (`[TXT EXPORTIEREN]`)** | Click `[TXT EXPORTIEREN]`:<br>• Browser downloads `user_profile.txt` backup via HTML5 Blob download with zero server roundtrip. | [ ] |
| 12.4 | **Zero-Latency TXT Import (`[TXT IMPORTIEREN]`)** | Click `[TXT IMPORTIEREN]` and pick a local `.txt` or `.md` file:<br>• HTML5 `FileReader` loads file in milliseconds into the textarea editor with success notification. | [ ] |
| 12.5 | **Payload Cap (64 KB Limit)** | Paste text exceeding 65,536 characters:<br>• Byte counter highlights red (`> 65536 Bytes`) and `[SPEICHERN]` is disabled (enforcing HTTP 413 limit). | [ ] |
| 12.6 | **Turn-1 Batch Autofill Workflow** | Upload `test_form_3.pdf` with `[STAMMDATEN: AKTIV]` and `Autofill: ON`:<br>• Agent calls `read_pdf_form` and `get_user_profile` in turn 1.<br>• Matches standard fields (Name, IBAN, Birth Date, Salary) and batch-fills them via `fill_pdf_form`.<br>• Viewer updates live and agent immediately prompts for first remaining empty field. | [ ] |
| 12.7 | **Delete Profile (`[PROFIL LÖSCHEN]`)** | Click `[PROFIL LÖSCHEN]` and confirm dialog:<br>• File is purged via `DELETE /api/v1/user-profile`.<br>• Header badge reverts immediately to `[STAMMDATEN: LEER]`. | [ ] |
| 12.8 | **Third-Party Autofill Toggle (`Autofill: ON \| OFF`)** | Under upload zone, toggle defaults to `Autofill: OFF` (Safe default for filling forms on behalf of third parties):<br>• Uploading with `OFF` skips profile pre-filling and starts neutrally from Step 1.<br>• Toggling to `Autofill: ON` re-enables pre-filling for the user's own forms. Persists across reload (`localStorage`). | [ ] |

---

### 13. Hybrid Form Filling (Action Chips & Form Inspector)

| Step | Test Case | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| 13.1 | **Interactive Action Chips (`/Btn` & `/Ch`)** | Upload `test_form_3.pdf`:<br>• When assistant asks a choice question (e.g. marital status or employment status), monospace clickable buttons render below prompt (e.g. `[ Ja ]`, `[ Nein ]`, `[ Ledig ]`, `[ Verheiratet ]`).<br>• Clicking a chip immediately submits the answer, writes the PDF, and advances conversation. | [ ] |
| 13.2 | **Hands-Free Action Chip Parity** | Activate speech dictation (`Alt+D`) while action chips are visible:<br>• Speaking the chip label out loud (e.g. *"Ja"* or *"Ledig"*) triggers the exact same action as clicking. | [ ] |
| 13.3 | **Workspace Mode Switch (`[ CHAT ]` vs. `[ FORMULAR ]`)** | Click `ANSICHT: FORMULAR` above chat pane (or press `Alt+M` / `Option+M`):<br>• Left workspace transitions smoothly to `FormInspector`.<br>• Right PDF viewer preview remains stable and interactive. | [ ] |
| 13.4 | **Form Inspector: Structured Field List** | In Form Inspector:<br>• Lists all document AcroForm fields with label, type, and status indicator (`[✓]` green for filled, `[ ]` neutral for open).<br>• Displays native inputs: text inputs for `/Tx`, select dropdowns for `/Ch`, checkboxes/radios for `/Btn`. | [ ] |
| 13.5 | **Direct Manual Form Editing & Save (`[SPEICHERN]`)** | Enter values manually in the inspector (e.g. salary `3200 €`) and check boxes:<br>• Click sticky `[SPEICHERN]` button.<br>• Success notification appears, right PDF iframe updates immediately, and progress bar increments. | [ ] |
| 13.6 | **Agent Synchronization on Mode Switch** | Edit a field in Form Inspector (e.g. salary), press `Alt+M` back to `[ CHAT ]`, and type or speak *"Weiter bitte"*:<br>• Agent reads updated PDF state via `read_pdf_form`, detects already filled fields, and resumes with the next unfilled field without repeating questions. | [ ] |

---

## Automated Verification Commands

Run automated tests before executing manual QA:

```powershell
# 1. Start Dev Environment (Backend + Frontend + Browser)
.\start_dev.ps1

# 2. Run Backend Testsuite (147 Tests)
uv run pytest

# 3. Run Frontend Unit-Tests (203 Tests)
npm test --prefix frontend

# 4. Verify Frontend Production Build
npm run build --prefix frontend
```
