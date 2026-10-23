# AGENTS.md

## Mandatory Session Onboarding
1. Every agent MUST read **`docs_dw/rules.md`** at the beginning of each session. If further explanations, background context, safety guidelines, or hardware specifications are needed for any rule or situation, **`docs_dw/memories.md`** MUST be consulted (where all rules are documented in full detail).
2. Every agent MUST read the **latest entries in the most recent `docs_dw/JOURNAL_N.md`** at the beginning of each session to understand the exact current development status.

---

## 🛑 Critical Working Principles (Highest Priority)

* **Rule 1 – Consultation Before Action & Transparency (CRITICAL):**
  * Never copy, move, delete files, or install packages autonomously without explicit user approval.
  * When encountering missing files or import errors, **stop immediately and report transparently** what is missing instead of attempting silent background fixes.
* **Rule 7 – Exact Request Fulfillment & Anti-Overdelivering (STRICT):**
  * Strictly adhere to the given task and never implement, change, or manipulate more in the codebase or filesystem than explicitly requested.
* **Rule 22 – No Decorative Emojis in UI / Developer Labels (STRICT):**
  * Never use decorative emojis in UI buttons, badges, status indicators, or action labels (e.g. use `Thinking: ON` / `Thinking: OFF`, `New Session`, `Refresh`, never brain/smile emojis).
* **Rule 39 – Documentation Maintenance & IDEAS Exclusivity:**
  * `docs_dw/IDEAS.md` is strictly maintained **only by Danny** (autonomous modification by AI agents is strictly forbidden). `AGENTS.md` is updated **only upon explicit user request**.

---

## 🏛️ Architecture: The 5 Pillars of the System

1. **PDF & AcroForm Domain Engine (`src/core/pdf/`, `src/core/tools.py`):**
   * **Clean Architecture Domain Engine (`src/core/pdf/`):**
     * Pure, 100% LangChain-free Python/pypdf domain logic decoupled from agent frameworks for lightning-fast (< 2 ms) isolated testing.
     * `security.py`: Proactive payload inspection (`inspect_pdf_security`) detecting active scripts, `/Launch`, `/JavaScript`, `/AA`, and unsafe attachments.
     * `extractor.py`: Resolves storage paths (`resolve_pdf_path`), extracts AcroForm fields, values, tooltips (`/TU`), choice options (`extract_choice_options`), and full page text (`extract_pdf_page_text`).
     * `normalizer.py`: Discovers radio button groups (`discover_radio_groups`), checkbox on-keys (`discover_btn_on_keys`), and normalizes values (`normalize_field_values`). **Never assume `/Btn` is a simple boolean!** Radio groups map option labels/indices to appearance states (`/0`, `/1`), where `"nein"` / `"off"` options must never deactivate the group.
     * `writer.py`: Populates fields via `write_pdf_form`, enforces PDF/UA ISO 14289-1 & BITV 2.0 Tab-Order (`/Tabs /S` for tagged, `/Tabs /R` for untagged documents), catalogues `/Lang: de-DE` fallback, flattens fields via ReadOnly-Bit (`/Ff | 1`), and determines active page.
   * **LangChain Adapter Facade (`src/core/tools.py`):**
     * Slim adapter layer wrapping domain functions into `@tool` definitions (`read_pdf_form`, `read_pdf_text_for_form`, `fill_pdf_form`, `get_user_profile`) and exporting `AVAILABLE_PDF_FORM_TOOLS`.
   * **UTF-8 & Unicode Integrity:** All JSON serialization and field filling must enforce `ensure_ascii=False` and apply `_clean_unicode_escapes` to prevent raw `\u00xx` escape artefacts in PDFs.

2. **Agent & Model Runtime (`src/core/agent.py`, `src/core/model_factory.py`):**
   * **`create_agent` Pattern:** Built directly on LangChain's `create_agent` runtime with memory checkpointing (`MemorySaver`).
   * **Cascading Middleware Chain:** Agents run with a cascading middleware chain: `[PDFFormValidationMiddleware(), PDFFormSummarizationMiddleware()]`.
   * **Deterministic Validation Interceptor (`PDFFormValidationMiddleware`, `src/core/validators.py`):**
     * Intercepts `fill_pdf_form` via native `wrap_tool_call` / `awrap_tool_call` hooks before the tool executes.
     * Evaluates field inputs against pure Python standard library validators (ISO 7064 Modulo-97 IBAN, Gregorian calendar dates & age limits, 5-digit German PLZ, European currency parsing with automatic rejection of negative amounts).
     * **Zero Dirty Writes:** Short-circuits immediately on validation failure without invoking the PDF engine or touching disk; returns structured synthetic `ToolMessage`s guiding conversational correction.
   * **Turn-1 Master Data Autofill & Tool Mandate (Prompt v1.5.0, Plan 040):**
     * Reads formless master data notes (`data/user_profile.txt`) upon session start and automatically batch-fills known standard fields (Name, Anschrift, IBAN, Steuer-ID) in turn 1 without asking redundant questions.
     * **STRIKTES VERBOT REIN TEXTUELLER AUTOFILL-BEHAUPTUNGEN:** Models are strictly prohibited from claiming in text that fields were prefilled from profile notes without technically calling `fill_pdf_form` in the exact same turn (*„Ein reiner Text-Chat füllt keine Formularfelder aus!“*).
   * **Reference Form `test_form_3.pdf` (Plan 039):**
     * Features exactly 8 AcroForm fields (4x /Tx, 1x /Ch, 3x /Btn), specifically including `txt_gehalt` (/Tx) for currency normalization and negative amount rejection, and `txt_iban` (/Tx) for Modulo-97 validation and Turn-1 profile autofill.
   * **Guided Conversation & Tool Mandate:** Interactively prompts the user field-by-field. **Strictly forbids leaking technical field names** (e.g. `txt_strasse_hausnr`) to the user; speaks exclusively in natural language. Enforces mandatory tool execution (`WERKZEUG-PFLICHT`): models must never claim fields are filled in text without technically calling `fill_pdf_form`.
   * **Local Ollama Runtime:** Operates 100% locally with private Ollama models, supporting dynamic model discovery and thinking mode.
   * **Thinking Mode & Reasoning Streaming:** Splits model reasoning blocks (`content_blocks["type"] == "reasoning"` or `additional_kwargs["reasoning_content"]`) from content tokens, streaming distinct `thought` and `token` events via `astream_events`.

3. **Modular Prompt Configuration (`src/prompts/`):**
   * System prompts are **never hardcoded** in tools or agent code.
   * Stored in clean, versioned YAML files (`src/prompts/<name>.yaml`, e.g. `pdf_form_agent.yaml`).
   * Loaded dynamically via `src.prompts.load_prompt` with an in-memory fallback for maximum resilience.

4. **Application Interfaces & Frontend (`src/api/app.py`, `src/cli.py`, `frontend/`):**
   * **FastAPI Backend & Physical Session Isolation:**
     * Temporary form uploads and generated PDFs reside strictly in `SESSIONS_DIR = DATA_DIR / "sessions"`.
     * **Strict Path Synchronization ([FIX-2026-10-21-01]):** Upload (`upload_document`), domain field filling (`fill_pdf_form`), and download delivery (`download_document`) operate strictly and synchronously on `SESSIONS_DIR / safe_thread_id / safe_filename` (eliminating iframe preview desyncs).
     * `cleanup_ephemeral_sessions` purges strictly `SESSIONS_DIR` (protecting persistent files like `data/user_profile.txt` and `data/conversation_history/` from TTL) and executes as a non-blocking FastAPI `BackgroundTask`.
     * **Rule 24 Concurrency:** Heavy file I/O, security scans, and AcroForm parsing run strictly in worker threads via `await asyncio.to_thread(...)`.
     * REST endpoints for PDF upload (`/upload-document`), download (`/download/{thread_id}/{filename}`), models (`/models`), master data profile (`/api/v1/user-profile`), and SSE chat streaming (`/chat`).
   * **Composite Agent Cache:** Agent instances are cached in `_agent_instances` strictly by the composite key `(model_name, think_enabled)` with shared session memory (`MemorySaver`).
   * **Single-Service Delivery:** Mounts compiled `frontend/dist` directly at root `/`.
   * **React 19 Frontend:** Split-screen dual-pane workspace with live PDF iframe preview, draggable resizer, thread-isolated `sessionStorage` persistence, and no-emoji UI.
   * **Master Data Profile Modal (`UserProfileModal.tsx`):**
     * Monospace modal with zero-latency HTML5 `FileReader` `.txt`-import and blob export, header status `[STAMMDATEN: AKTIV|LEER]`, byte counter, and global shortcut `Alt+U`.
   * **Accessibility & Ergonomics (WCAG 2.1 AAA & Text Scaling):**
     * Triple-theme palette (`LIVE`, `PAPER`, and `CONTRAST` with $\ge 7:1$ contrast ratio).
     * Flexible root `rem`-based text scaling (100% / 125% / 150%) via header segment controls and shortcut `Alt+S`.
     * **Responsive Header Flex-Wrap & Viewport Resiliency (Plan 041):** Header employs adaptive height (`min-h-12 h-auto py-2 shrink-0 flex-wrap gap-x-4 gap-y-2`) instead of rigid heights, with compact inline brand/status indicators and `whitespace-nowrap` protections. Guarantees zero overlapping, zero clipping, and clean multi-row wrapping under 125% and 150% text scaling. `PDFToolbar` assigns `shrink-0` to action buttons and `min-w-0 flex-1` to document title to prevent edge cutoff.
     * Monospace `ShortcutsModal.tsx` (`?`) for instant keyboard discovery.
   * **ToolCallBadge Inspection:** Displays expandable monospace inspection blocks (`[DETAILS]` / `[COLLAPSE]`) for tool parameters (`[INPUT]`) and JSON responses (`[OUTPUT]`).
   * **Deterministic Completion Safety Net:** Renders an automatic `[FERTIG] Formular vollständig ausgefüllt` download banner under assistant messages upon 100% field completion if the model omits the markdown download link.
   * **Screenreader & Streaming Isolation:** `aria-live="polite"` must never be placed on rapidly mutating SSE streaming tokens. Screenreader announcements for assistant responses are buffered and emitted exclusively via a dedicated `sr-only` announcer after stream completion (`!isStreaming`).
   * **Deterministic Progress & Cognitive Guidance:** Progress bars (`role="progressbar"`) derive strictly from verified tool return values (`formProgress: { filled, total }`) and remain pinned in the chat pane regardless of PDF viewer visibility or viewport size.
   * **Tiered State Persistence:** Thread-specific session data (AcroForm values, thread ID, PDF cache versions) resides in `sessionStorage` (cleared on session reset), whereas global accessibility preferences (high-contrast theme, text scaling) persist across sessions in `localStorage`.
   * **Interactive CLI:** Direct terminal-based workflow for local testing and debugging.

5. **Real-Time Voice & Audio Pipeline (STT & TTS Microservices):**
   * **Multi-Service Port Allocation:** FastAPI Backend: Port `8001` (`src/main.py`), STT Microservice: Port `8002` (`transcribe.cpp`), TTS Microservice: Port `8005` (`Kokoro/Piper`), Vite Dev Server: Port `5173`.
   * **STT Engine (Port 8002):** Uncompressed 16 kHz Float32/Int16 PCM streaming via Web Audio API AudioWorklet to the local FastConformer service (`/ws/stream`). Dedicated launchers (`start_server_gpu.ps1` and `start_server_cpu.ps1`) pass explicit `--port 8002` to prevent default port 8001 collisions with the FastAPI backend.
   * **TTS Engine (Port 8005):** Streaming of 24 kHz Linear-PCM chunks via WebSocket (`/ws/tts`) to the client-side Web Audio API player with strict voice whitelist and Markdown sanitization.
   * **Stateless Voice Commands Engine (`frontend/src/utils/voiceCommands.ts`):**
     * Intercepts 4 hands-free voice commands directly in `ChatInput.tsx` with monospace badge `[BEFEHL: ...]`:
       * `SEND`: Trigger at utterance end (*„... senden“*, *„... abschicken“*, *„... eintragen“*) with immediate (< 50 ms) dispatch.
       * `REPEAT_QUESTION`: 0-token fast-path to repeat the last assistant question via TTS.
       * `DOWNLOAD_FORM`: Instantly triggers form download in a new tab.
       * `STEP_BACK`: Prompts step correction dialog.
   * **VAD Silence Detection & Auto-Send Toggle (`ChatInput.tsx`):**
     * Switchable `AUTO-SEND: ON | OFF` toggle (defaults to `OFF`, persistent in `localStorage`, shortcut `Alt+A`).
     * When `ON`: 1,800 ms silence detection (`audioLevel <= 0.03`) followed by animated 1-second grace-period countdown badge `[AUTO-SEND IN 1S...]` with instant abort on user speech (`audioLevel > 0.05`) or typing/keystroke (`handleKeyDown` / `handleInputChange`).
   * **Single-GPU Concurrency & Dual-Level Interlock (Rule 25):** Synchronous teardown of prior audio buffers upon new interactions. STT/TTS acoustic interlock: microphone pauses automatically during TTS playback to prevent speaker echo feedback. In-App TTS to Screenreader interlock: active In-App TTS playback (`isTTSPlaying`) automatically switches W3C ARIA live regions to `aria-live="off"` to prevent simultaneous dual-voice collision.
   * **Dev-Proxy Disambiguation:** In `vite.config.ts`, specific `/ws/tts` (Port 8005) must strictly precede the catch-all `/ws` (Port 8002) rule.
   * **Error Transparency:** Audio WebSocket errors must always surface in the UI error banner instead of aborting silently.
