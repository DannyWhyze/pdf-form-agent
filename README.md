# PDF Form Agent

A local web application and API service for filling PDF forms step by step through chat. It inspects AcroForm fields, validates user inputs with deterministic Python rules, updates the PDF live in the browser, and locks fields on completion.

---

## Features

* **AcroForm discovery.** Reads interactive form fields, field types (`/FT`), tooltips (`/TU`), and pre-existing values directly from the document.
* **Context extraction.** Pulls surrounding page text to resolve cryptic field names, like mapping `Text1` to `First Name`.
* **Field-by-field chat.** Prompts the user for one field at a time using a LangChain supervisor agent and local Ollama models. Speaks in plain language and never exposes internal variable names.
* **Live PDF preview.** A split-screen React 19 interface updates the PDF iframe as soon as a field is filled.
* **Form inspector.** Users can switch from chat to a structured form mask (`Alt+M`) to edit fields directly. Changes save immediately to the PDF.
* **Action chips.** Clickable buttons render below prompts for quick answers on choices, dropdowns, and checkboxes. Voice dictation accepts the same options.
* **Deterministic validation.** Standard library rules verify inputs before touching the PDF. Checks include ISO 7064 Modulo-97 IBANs, Gregorian calendar dates, German postal codes, and positive currency amounts. Invalid data stops the tool call before anything writes to disk.
* **Voice input and speech output.** 16 kHz AudioWorklet STT streaming over WebSocket with real-time text transcription, hands-free voice commands (`SEND`, `REPEAT_QUESTION`, `DOWNLOAD_FORM`, `STEP_BACK`), and VAD auto-send. 24 kHz gapless TTS playback with single-GPU concurrency locking and acoustic feedback prevention.
* **Accessibility and themes.** Three palettes: dark, paper light, and WCAG 2.1 AAA high-contrast (black and yellow, with at least 7:1 contrast ratio). Root font scaling at 100%, 125%, and 150% (`Alt+S`). Retains PDF/UA tags (`/StructTreeRoot`, `/MarkInfo`) and tab order (`/Tabs /S` or `/Tabs /R`).
* **Master data notepad.** Stores local notes (`data/user_profile.txt`) for batch autofill on turn 1. Includes a toggle to disable autofill when filling forms for someone else.
* **Context compression.** Summarization middleware trims conversation history once it hits 20 messages or 8,000 tokens, offloading pruned turns to markdown files.
* **Read-only export.** Sets the ReadOnly bit (`/Ff | 1`) on all widgets after the last field is filled to lock the document.

---

## System architecture

1. **Domain engine and LangChain facade (`src/core/pdf/`, `src/core/tools.py`, `src/core/user_profile.py`).** Low-level PDF manipulation, security inspection, radio and checkbox normalization, PDF/UA flattening, master data storage, and LangChain `@tool` adapter facade.
2. **Agent runtime (`src/core/agent.py`, `src/core/model_factory.py`).** ReAct supervisor agent and local ChatOllama factory.
3. **Application interfaces (`src/api/app.py`, `src/cli.py`).** FastAPI REST and SSE endpoints, root SPA static mounting, and terminal CLI.
4. **React 19 frontend (`frontend/`).** TypeScript, Vite, Tailwind CSS v4, Lucide Icons, AudioWorklet STT streaming, and Vitest test suite.
5. **Speech services (optional).** Companion microservices for real-time audio: [nemotron-asr-streaming](https://github.com/DannyWhyze/nemotron-asr-streaming) for STT (port 8002) and [qwen3-tts-websocket-server](https://github.com/DannyWhyze/qwen3-tts-websocket-server) for TTS (port 8005).

---

## Quickstart

### Prerequisites
* Python `>= 3.12`
* Node.js `>= 20.0`
* Local Ollama instance
* Optional speech services:
  * STT (port 8002): [nemotron-asr-streaming](https://github.com/DannyWhyze/nemotron-asr-streaming)
  * TTS (port 8005): [qwen3-tts-websocket-server](https://github.com/DannyWhyze/qwen3-tts-websocket-server)

### 1. Web application (fullstack)

#### Option A: One-click startup
Start both backend and frontend development servers with a single command:

* **Windows (PowerShell):**
  ```powershell
  .\start_dev.ps1
  ```
* **Linux and macOS (Bash):**
  ```bash
  chmod +x ./start_dev.sh
  ./start_dev.sh
  ```
This starts the FastAPI backend (`http://localhost:8001`), the Vite dev server (`http://localhost:5173`), and opens your browser.

#### Option B: Manual startup (two terminals)
* **Terminal 1 (Backend):**
  ```bash
  uv run python -m src.main
  ```
* **Terminal 2 (Frontend):**
  ```bash
  cd frontend
  npm run dev
  ```
  Open `http://localhost:5173` in your browser.

#### Option C: Production mode
When `frontend/dist/` is built (`npm run build` in `frontend/`), start only the backend:
```bash
uv run python -m src.main
```
Open `http://localhost:8001` directly in your browser.

### 2. Interactive terminal CLI
Run the interactive CLI on any fillable PDF form:
```bash
uv run python -m src.cli data/input/pdfs/test_form.pdf --thread-id my_session
```

---

## Keyboard shortcuts

The chat input console provides keyboard shortcuts for mouse-free work:

| Shortcut (Windows / Linux) | Shortcut (macOS) | Action | Description |
|---|---|---|---|
| `Alt + D` | `Option + D` (`⌥D`) | Toggle Dictation | Toggles speech-to-text dictation |
| `Alt + A` | `Option + A` (`⌥A`) | Toggle Auto-Send | Toggles automatic message submission on speech pause |
| `Alt + P` | `Option + P` (`⌥P`) | Toggle PDF Viewport | Hides or shows the PDF preview panel |
| `Alt + M` | `Option + M` (`⌥M`) | Toggle Workspace Mode | Switches between chat and direct Form Inspector |
| `Alt + V` | `Option + V` (`⌥V`) | Toggle Speech Synthesis | Turns text-to-speech output on or off |
| `Alt + U` | `Option + U` (`⌥U`) | Toggle Profile Editor | Opens the master data notes editor modal |
| `Alt + T` | `Option + T` (`⌥T`) | Toggle Theme | Cycles through Dark, Light, and High-Contrast palettes |
| `Alt + S` | `Option + S` (`⌥S`) | Cycle Text Scale | Cycles root font text scaling (100% -> 125% -> 150% -> 100%) |
| `?` | `?` | Keyboard Shortcuts | Opens the keyboard shortcuts dialog (when outside text inputs) |
| `Esc` | `Esc` | Close Dialog | Closes the active modal dialog |
| `Enter` | `Enter` (`↩`) | Send Message | Submits the current message to the agent |
| `Shift + Enter` | `Shift + Enter` (`⇧↩`) | New Line | Inserts a line break into the textarea without submitting |

---

## Voice commands (hands-free dictation)

While dictation is active (`Alt + D`), speaking these phrases triggers immediate actions:

| Voice command | Trigger phrases | Action |
|---|---|---|
| `SEND` | *„... senden“*, *„... abschicken“*, *„... eintragen“* | Strips the trigger word at sentence end and sends the cleaned text |
| `REPEAT_QUESTION` | *„Wiederhole die Frage“*, *„Frage wiederholen“*, *„Nochmal vorlesen“* | Reads the last assistant question through TTS with zero LLM tokens |
| `DOWNLOAD_FORM` | *„Formular herunterladen“*, *„PDF herunterladen“*, *„pdf downloaden“* | Opens browser download for the completed PDF |
| `STEP_BACK` | *„Einen Schritt zurück“*, *„Schritt zurück“*, *„bitte zurück“* | Sends correction prompt *„Einen Schritt zurück bitte“* to the agent |

---

## Speech services (optional)

Real-time voice dictation and speech synthesis connect to two standalone WebSocket microservices:

* **Speech-to-text (STT, port 8002).** [nemotron-asr-streaming](https://github.com/DannyWhyze/nemotron-asr-streaming) receives 16 kHz uncompressed linear PCM audio from the browser AudioWorklet and returns real-time German transcriptions.
* **Text-to-speech (TTS, port 8005).** [qwen3-tts-websocket-server](https://github.com/DannyWhyze/qwen3-tts-websocket-server) streams 24 kHz linear PCM audio for reading agent responses aloud and repeating questions.

---

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves compiled React 19 SPA frontend |
| `GET` | `/health` | Service health status |
| `GET` | `/api/v1/stt-health` | Probes STT microservice socket availability |
| `GET` | `/api/v1/tts-health` | Probes TTS microservice socket availability |
| `GET` | `/api/v1/models` | Discovers available local Ollama LLMs with parameter specs |
| `POST` | `/api/v1/upload-document` | Uploads fillable PDF and returns extracted fields summary |
| `POST` | `/api/v1/chat` | Server-Sent-Events (SSE) streaming chat endpoint |
| `GET` | `/api/v1/download/{thread_id}/{filename}` | Previews (`inline`) or downloads (`?download=true`) PDF |
| `GET` | `/api/v1/user-profile` | Retrieves stored user profile master data notes |
| `POST` | `/api/v1/user-profile` | Creates or updates user profile notes (max 64 KB cap) |
| `DELETE` | `/api/v1/user-profile` | Deletes stored user profile notes |
| `GET` | `/api/v1/forms/{thread_id}/{filename}/fields` | Inspects form fields, types, and values for Form Inspector |
| `POST` | `/api/v1/forms/{thread_id}/fill` | Fills form fields directly with ReadOnly flattening and live metrics |

---

## Configuration

Configure settings in `.env` or environment variables:

```dotenv
MODEL_NAME=gemma4:e4b
OLLAMA_BASE_URL=http://localhost:11434
NUM_CTX=16384
ENABLE_SUMMARIZATION=true
SUMMARIZATION_TRIGGER_TOKENS=8000
SUMMARIZATION_TRIGGER_MESSAGES=20
SUMMARIZATION_KEEP_MESSAGES=6
SUMMARIZATION_TRIM_TOKENS=4000
SUMMARIZATION_OFFLOAD_TO_FILE=true
STT_HOST=127.0.0.1
STT_PORT=8002
TTS_HOST=127.0.0.1
TTS_PORT=8005
CORS_ORIGINS=["http://localhost:8001","http://127.0.0.1:8001","http://localhost:5173","http://127.0.0.1:5173"]
VITE_STT_WS_URL=ws://localhost:8002/ws/stream
VITE_TTS_WS_URL=ws://localhost:8005/ws/tts
```

---

## Testing and specifications

Technical specifications and manual test checklists live in [`docs/`](docs/):
* [`docs/backend_specification_1.md`](docs/backend_specification_1.md): Technical architecture, domain engine, security filters, and API specifications.
* [`docs/frontend_specification_1.md`](docs/frontend_specification_1.md): UI layout, WCAG 2.1 AAA accessibility, state persistence, and component contracts.
* [`docs/manual_testing_checklist_1.md`](docs/manual_testing_checklist_1.md): 13-station end-to-end manual testing checklist.

### Backend test suite (147 tests across 14 test files)
```bash
uv run pytest -v
```

### Frontend test suite (203 tests across 26 test files)
```bash
cd frontend
npm test
```

---

## License

This project is licensed under the [MIT License](LICENSE).

Individual model weights and companion services (such as Ollama models, FastConformer STT, and Kokoro/Piper TTS) remain subject to their respective upstream licenses and terms of use.
