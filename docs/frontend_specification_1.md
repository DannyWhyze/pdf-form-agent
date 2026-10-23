# Frontend specification: PDF Form Agent (v1.0.0)

This document describes the technical architecture, data contracts, and verification rules of the `pdf_form_agent` React 19 frontend. It contains the complete schema and behavioral requirements needed to maintain or rebuild the user interface.

---

## 1. System overview and technology stack

The `pdf_form_agent` frontend is an enterprise Single Page Application (SPA) designed to connect directly with the FastAPI backend. It features real-time SSE streaming for AI reasoning and token generation, live PDF document inspection, responsive dual-pane layout, and session recovery across page refreshes (F5).

### 1.1 Technology stack
* **Language & Runtime:** TypeScript (Strict Mode) on React 19.
* **Build System:** Vite.
* **Typography:** `Inter` (UI sans-serif) & `JetBrains Mono` (code & tokens) with system fallbacks.
* **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`, `@tailwindcss/typography`) + Lucide Icons (`^0.475.0`).
* **Rich Text / Markdown:** `react-markdown` + `remark-gfm`.
* **Testing:** Vitest + React Testing Library (`@testing-library/react`, `@testing-library/jest-dom/vitest`, `jsdom`).

---

## 2. Directory layout

```text
frontend/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html                    # Vite HTML entrypoint with root container
├── public/
│   └── audio-processor.worklet.js# AudioWorklet processor (Float32 -> 16 kHz Int16 PCM)
├── src/
│   ├── vite-env.d.ts             # Vite client TypeScript definitions
│   ├── api/
│   │   ├── client.ts             # REST API client (health check, upload, form inspect/fill)
│   │   └── sse.ts                # Custom SSE parser for FastAPI text/event-stream
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Header.tsx        # Top navigation, status indicator, model badge
│   │   │   └── MobileTabNav.tsx  # Mobile view switcher (Assistant vs PDF Preview)
│   │   ├── Upload/
│   │   │   └── DocumentUploader.tsx # Drag-and-drop & file selector for AcroForms
│   │   ├── Chat/
│   │   │   ├── ActionChips.tsx   # Clickable monospace chips for quick form option selection
│   │   │   ├── ChatContainer.tsx # Scrollable chat timeline & auto-scroll anchor
│   │   │   ├── ChatMessage.tsx   # Linear workspace document feed with reasoning & tool badges
│   │   │   ├── ReasoningBlock.tsx# Collapsible thought process display
│   │   │   ├── ToolCallBadge.tsx # Tool execution status chips
│   │   │   └── ChatInput.tsx     # Message input bar with submit, stop & STT dictation
│   │   ├── Form/
│   │   │   └── FormInspector.tsx # Direct form editor with status badges and native HTML inputs
│   │   ├── PDFViewer/
│   │   │   ├── PDFViewer.tsx     # PDF object/iframe embed with error fallback
│   │   │   └── PDFToolbar.tsx    # Refresh preview & download actions
│   │   └── Modal/
│   │       ├── ShortcutsModal.tsx# Accessible keyboard shortcuts cheat sheet
│   │       └── UserProfileModal.tsx # Master data notes editor with TXT import/export
│   ├── hooks/
│   │   ├── useChatStream.ts      # SSE state machine & AbortController (side-effect free)
│   │   ├── useResizableSplit.ts  # Split pane width dragging, persistence & collapse toggle
│   │   ├── useSessionState.ts    # sessionStorage synchronization (thread-isolated)
│   │   ├── useSTTStream.ts       # Web Audio API & WebSocket client for STT streaming
│   │   ├── useTextScale.ts       # Dynamic rem font scaling (100% / 125% / 150%) & persistence
│   │   ├── useTheme.ts           # Triple-theme palette management (LIVE, PAPER, CONTRAST)
│   │   └── useTTSStream.ts       # 24 kHz gapless Linear PCM WebSocket audio player with interlock
│   ├── types/
│   │   └── index.ts              # Core TypeScript interfaces
│   ├── utils/
│   │   ├── actionChips.ts        # Question parser & option extractor for action chips
│   │   ├── cn.ts                 # Class names merger utility (clsx + tailwind-merge)
│   │   └── voiceCommands.ts      # Deterministic stateless voice command parser engine
│   ├── App.tsx                   # Main dual-pane application layout
│   ├── main.tsx                  # React entry point
│   └── index.css                 # Inter & JetBrains Mono font imports, Tailwind directives
└── tests/
    ├── setup.ts                  # JSDOM mocks for scrollIntoView, Web Audio & matchers
    ├── actionChips.test.ts       # Option extraction logic unit tests
    ├── ActionChips.test.tsx      # ActionChips component interaction & disabled state tests
    ├── AppKeyboardShortcuts.test.tsx # Global keyboard shortcut listener integration tests
    ├── ChatContainer.test.tsx    # Message feed rendering & auto-scroll anchor tests
    ├── ChatInput.test.tsx        # Message input bar, submit, stop & STT dictation tests
    ├── ChatInputAutoSend.test.tsx# Auto-send VAD silence timer integration tests
    ├── ChatMessage.test.tsx      # Markdown formatting, badges & reasoning block tests
    ├── DocumentUploader.test.tsx # File drag-and-drop & upload handler tests
    ├── FormInspector.test.tsx    # Direct form inspector editing, saving & reset tests
    ├── Header.test.tsx           # Brand, health indicator, model selector, thinking & shortcuts toggle
    ├── MobileTabNav.test.tsx     # Mobile view switching tests
    ├── PDFToolbar.test.tsx       # PDF toolbar controls and action tests
    ├── ProgressBar.test.tsx      # Deterministic progress bar rendering tests
    ├── ShortcutsModal.test.tsx   # Keyboard shortcuts modal rendering & Escape/close tests
    ├── sse.test.ts               # Custom SSE buffer and chunk parsing unit tests
    ├── themeContrast.test.ts     # WCAG 2.1 AAA luminance & contrast ratio tests
    ├── ToolCallBadge.test.tsx    # Tool badge expansion & JSON payload inspection tests
    ├── UserProfileModal.test.tsx # Master data notes editor modal tests
    ├── useChatStream.test.ts     # SSE connection state, thinking mode & AbortController tests
    ├── useResizableSplit.test.ts # Resizable split hook, mouse events & clamps tests
    ├── useSessionState.test.ts   # Thread-isolated sessionStorage synchronization tests
    ├── useSTTStream.test.ts      # Web Audio graph, worklet PCM piping & WebSocket tests
    ├── useTextScale.test.ts      # Root text scale dynamic attribute & storage tests
    ├── useTheme.test.ts          # Studio theme mode dynamic attribute & storage tests
    ├── useTTSStream.test.ts      # Web Audio PCM synthesis & TTS streaming tests
    └── voiceCommands.test.ts     # Voice command token parser tests
```

---

## 3. Component architecture and data contracts

### 3.1 Type definitions (`src/types/index.ts`)

```typescript
export interface ToolCallData {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCallData[];
  timestamp: number;
}

export interface FormProgress {
  filled: number;
  total: number;
}

export interface FormField {
  name: string;
  type: string;
  description?: string;
  value?: string;
  options?: string[];
}

export interface FormFieldsResponse {
  error: boolean;
  message?: string;
  total_fields: number;
  filled_fields: number;
  fields: FormField[];
}

export interface FormFillResponse {
  error?: boolean;
  status: string;
  message?: string;
  total_fields: number;
  filled_fields: number;
  active_page?: number;
  written_values?: Record<string, unknown>;
}

export interface DocumentUploadResponse {
  status: string;
  message: string;
  filename: string;
  thread_id: string;
  local_path: string;
  fields_summary: {
    error: boolean;
    total_fields: number;
    filled_fields?: number;
    fields: FormField[];
  };
}

export interface SSEEventChunk {
  event: 'thought' | 'token' | 'tool_start' | 'tool_end' | 'telemetry' | 'error';
  data: string | { id?: string; name?: string; args?: Record<string, unknown>; tool_call_id?: string; content?: string; type?: string; thread_id?: string; timestamp?: string };
}

export interface ModelInfo {
  name: string;
  display_name: string;
  size: number;
  parameter_size?: string;
  family?: string;
  is_current?: boolean;
}

export interface ModelsResponse {
  status: string;
  current_default: string;
  models: ModelInfo[];
}

export interface STTHealthResponse {
  status: 'online' | 'offline';
  online: boolean;
  host: string;
  port: number;
}

export interface TTSHealthResponse {
  status: 'online' | 'offline';
  online: boolean;
  host: string;
  port: number;
}

export const ALLOWED_TTS_VOICES = [
  'ger_klara_calm_female',
  'ger_uwe_newsreader_male',
  'ger_jonas_casual_male',
] as const;

export type TTSVoice = (typeof ALLOWED_TTS_VOICES)[number];

export const DEFAULT_TTS_VOICE: TTSVoice = 'ger_klara_calm_female';

export const TTS_VOICE_CONFIG: Record<TTSVoice, { label: string; previewText: string }> = {
  ger_klara_calm_female: {
    label: 'Klara (Ruhig)',
    previewText: 'Hallo, ich bin Klara.',
  },
  ger_uwe_newsreader_male: {
    label: 'Uwe (Nachrichten)',
    previewText: 'Guten Tag, ich bin Uwe.',
  },
  ger_jonas_casual_male: {
    label: 'Jonas (Lässig)',
    previewText: 'Hi, ich bin Jonas.',
  },
};

export interface TTSChunkMessage {
  data: string;
  sample_rate: number;
  chunk: number;
  done: boolean;
  error?: string;
}

export interface UseTTSStreamOptions {
  wsUrl?: string;
  defaultVoice?: TTSVoice;
  enabled?: boolean;
  onError?: (error: Error) => void;
  onPlaybackEnd?: (messageId: string) => void;
}

export interface UseTTSStreamReturn {
  isPlaying: boolean;
  activeMessageId: string | null;
  error: string | null;
  speak: (messageId: string, text: string, voice?: string) => Promise<void>;
  stop: () => void;
}

export interface UserProfileResponse {
  exists: boolean;
  content: string;
  updated_at?: string | null;
}

export interface UserProfileSaveResponse {
  status: string;
  updated_at: string;
}

export interface UserProfileDeleteResponse {
  status: string;
  message?: string;
}

export type ThemeMode = 'live' | 'paper' | 'contrast';
export type TextScale = '100' | '125' | '150';
```

---

## 4. State management and hooks

### 4.1 Session state hook (`useSessionState`)
* **Session Storage Key:** `pdf_form_agent_state_${threadId}` (isolated per thread ID to prevent session contamination).
* **Persisted Fields:**
  * `threadId`: UUID string from URL query `?thread_id=...` or newly generated.
  * `activeFilename`: String | null.
  * `messages`: `ChatMessageData[]`.
  * `pdfVersion`: Timestamp number for cache-busting iframe reloads (`?v=`).
  * `selectedModel`: String storing currently selected Ollama model identifier.
  * `thinkEnabled`: Boolean flag controlling LLM thinking/reasoning mode.
  * `formProgress`: `FormProgress | null` storing current filled and total field counts.
  * `activePage`: Number representing the currently active PDF page (default: 1).
* **Methods:**
  * `resetSession()`: Purges current and all orphaned `pdf_form_agent_state_*` keys from `sessionStorage` and navigates to new thread query param (preserves `selectedModel` and `thinkEnabled`, resets `formProgress` to null and `activePage` to 1).
  * `setActiveFilename(filename: string | null)`: Updates active document.
  * `bumpPdfVersion()`: Forces PDF reload when modified.
  * `setSelectedModel(model: string)`: Updates and persists active model choice.
  * `setThinkEnabled(enabled: boolean)`: Updates and persists thinking mode state.
  * `setFormProgress(progress: FormProgress | null)`: Updates and persists form progress.
  * `setActivePage(page: number)`: Updates and persists active page index.

### 4.2 Chat stream hook (`useChatStream`)
* **Methods & State:**
  * `isStreaming`: Boolean flag indicating active stream processing.
  * `error`: String | null describing streaming or connectivity failures.
  * `sendMessage(message: string)`: Dispatches POST to `/api/v1/chat` including optional `model_name: selectedModel` and `think_enabled: thinkEnabled`.
  * `stopStream()`: Triggers `AbortController.abort()`.
* **Side-Effect-Free Architecture:**
  * External callbacks like `onPdfUpdated()` and `onProgressUpdated(progress, activePage)` are invoked directly within the asynchronous stream reader loop, strictly outside React state reducer callbacks (`setMessages(prev => ...)`).
  * When `fill_pdf_form` completes, `onPdfUpdated()` bumps the version and `onProgressUpdated()` parses `total_fields`, `filled_fields`, and `active_page` from the tool response JSON.
  * Tool events match by `tool_call_id` or target only active `status === 'running'` invocations.
* **Error Resilience & Lifecycle Cleanup:**
  * Emitted `event: "error"` chunks update `error` state and immediately prune empty assistant placeholder messages to maintain a clean timeline.
  * Automatically resets `error` to `null` whenever `threadId` changes (e.g. on session reset).

### 4.3 Split panel hook (`useResizableSplit`)
* **Storage Keys:** `pdf_form_agent_split_ratio` and `pdf_form_agent_pdf_visible` (in `localStorage`).
* **Bounds:** Clamped between 25% and 65% (default: 40% chat, 60% PDF).
* **Methods & State:**
  * `splitRatio`: Number representing current chat pane width percentage.
  * `isDragging`: Boolean flag indicating active mouse dragging.
  * `isPdfVisible`: Boolean flag controlling whether the PDF viewport is open (default: `true`).
  * `startDragging(e)`: Initializes pointer drag tracking on window.
  * `resetRatio()`: Restores standard 40% split ratio on double-click.
  * `setIsPdfVisible(visible: boolean)`: Directly sets and persists PDF viewport visibility.
  * `togglePdfVisibility()`: Toggles between open and collapsed PDF viewport state.


### 4.4 Speech-to-text hook and pipeline (`useSTTStream`)
* **Raw Audio Architecture (Rule 30 Compliance):**
  * Uses `AudioWorkletNode` (`public/audio-processor.worklet.js`) running directly in the Web Audio rendering thread to capture raw PCM before any browser container compression (avoiding WebM/Opus phase and frequency degradation).
  * Converts native AudioContext frames into 16 kHz mono 32-bit linear PCM (`Float32Array` in `[-1.0, 1.0]`) with high-precision linear resampling.
  * Streams uncompressed binary chunks (320 ms / 5120 samples / 20480 bytes) directly via WebSocket to `/ws/stream` (proxied to STT microservice at port 8002).
* **Handshake & Streaming Protocol:**
  * Handshake on connect: `{"action": "start", "language": "de-DE", "chunk_ms": 320, "lookahead": 3}`.
  * Partial updates: Merges `committed` (finalized words) and `tentative` (lookahead tokens) via `[committed, tentative].filter(Boolean).join(' ')` for immediate visual responsiveness.
  * Graceful stop protocol: On stop, immediately stops audio media tracks and AudioContext, flushes remaining worklet buffer, transmits `{"action": "stop"}` over WebSocket, and waits for `StreamFinalEvent` (or a 1500 ms safety fallback timeout) before closing the connection.
  * Concurrency guard: Catches `StreamBusyEvent` (`event: "busy"`) and WebSocket code 4029, displaying user-friendly guidance ("Spracherkennungsdienst ist ausgelastet").
* **State & Methods:**
  * `isRecording`: Boolean flag indicating active microphone recording and WebSocket streaming.
  * `transcript`: String holding the latest live transcription text.
  * `error`: String or `null` containing human-readable error descriptions.
  * `audioLevel`: Number in range `[0.0, 1.0]` representing real-time RMS microphone amplitude calculated via `AnalyserNode` (`fftSize = 256`, `smoothingTimeConstant = 0.5`). Resets to `0` on teardown.
  * `startRecording()`: Requests microphone permissions (`echoCancellation: true, noiseSuppression: true, autoGainControl: false`), initializes Web Audio graph, connects AnalyserNode, launches requestAnimationFrame RMS metering loop, and opens WebSocket connection.
  * `stopRecording()`: Gracefully halts media capture, stops metering animation frame, flushes audio buffers, sends stop handshake, awaits final transcription event, and closes WebSocket.
* **Continuous hands-free dictation and auto-resume cycle.**
  * `isHandsFree`: Boolean state in `ChatInput` enabling continuous voice interaction across multi-step form interviews.
  * When hands-free is enabled:
    * While user speaks: microphone active, `Recording...` state with 4-segment DAW VU-meter.
    * When message is sent or while agent is streaming response (`isStreaming === true`): microphone pauses automatically (`Paused...`), preventing acoustic echo and feedback.
    * When agent finishes streaming answer (`isStreaming` transitions from `true` to `false`): microphone automatically re-arms and resumes recording without requiring manual user interaction.
    * User can cancel hands-free mode at any time by clicking the Dictate button or pressing Alt+D (Windows/Linux) / Option+D (macOS).
* **Resilience & DoS Safeguards:**
  * Cross-platform keyboard shortcut: Evaluates `e.code === 'KeyD'` alongside `e.key === 'd' || e.key === 'D'`, enabling key detection on macOS where `Option+D` outputs the character `∂`. Dynamically detects the OS to render `Option+D` or `Alt+D` in tooltips.
  * Timer invalidation: `startRecording()` explicitly invalidates any pending `finalizeTimeoutRef` timers before instantiating new audio/WebSocket sessions, eliminating premature connection closures.
  * Port fallback in `resolveSTTWsUrl()`: Automatically maps port 8001 host requests to dedicated STT service port 8002 (`ws://127.0.0.1:8002/ws/stream`).
  * Client-side DoS guard: Automatically terminates recording after 60 seconds (`maxDurationSeconds: 60`).
  * Mutual exclusion & STT-Interlock: Speech-to-text recording is strictly paused while LLM response generation is active (`isStreaming === true`) OR while TTS speech synthesis is active (`isTtsPlaying === true`) to eliminate acoustic feedback loops. Once both streaming and speech output are idle, hands-free mode automatically resumes recording.
  * Human-in-the-Loop review: Transcribed text is inserted live into the `ChatInput` textarea, enabling the user to review, edit, or cancel before submitting to the PDF form assistant. Trailing final events are dropped after message submission via `ignoreTranscriptsRef`.
  * Accessible Controls & DAW VU-Meter (Rule 22): Toggle button with `<Mic />` active pulsing SVG icon, textual `Dictate` / `Recording...` / `Paused...` labels, 4-segment technical LED VU-meter bars (`[||--]`), cross-platform Alt+D / Option+D keyboard shortcut, and zero decorative emojis.

### 4.5 Theme hook (`useTheme`)
* **Storage Key:** `pdf_form_agent_theme` (in `localStorage`).
* **Supported Themes:** `ThemeMode = 'live' | 'paper' | 'contrast'`.
  * `'live'`: Ableton Live 12 Studio Dark Theme (deep matte charcoal, DAW contrast).
  * `'paper'`: Swiss Archival / Paper & Ink Light Theme (warm archival paper, carbon ink, Bauhaus vermilion).
  * `'contrast'`: High-Contrast Theme (WCAG 2.1 Level AAA certified, deep black `#000000`, crisp white `#ffffff`, signal yellow `#ffff00`, neon focus rings).
* **State & Methods:**
  * `theme`: `ThemeMode` representing active theme (defaults to `'live'`).
  * `setTheme(mode: ThemeMode)`: Updates theme state, synchronizes `data-theme` attribute on `document.documentElement`, and writes to `localStorage`.
  * `toggleTheme()`: Cycles through `'live'` -> `'paper'` -> `'contrast'` -> `'live'`.
* **Zero-FOUC & Resilience:** Safely handles SSR/window undefined scenarios, falling back gracefully to `'live'` upon malformed or missing storage data.

### 4.6 Text scale hook and accessibility scaling (`useTextScale`)
* **Storage Key:** `pdf_form_agent_text_scale` (in `localStorage`).
* **Supported Scales:** `TextScale = '100' | '125' | '150'`.
* **Root Font Scaling Model:** Synchronizes root HTML document attribute `data-text-scale="100|125|150"`. In CSS:
  * `html[data-text-scale="100"]`: `font-size: 100%` (standard 16px baseline).
  * `html[data-text-scale="125"]`: `font-size: 125%` (large 20px baseline).
  * `html[data-text-scale="150"]`: `font-size: 150%` (extra-large 24px baseline).
* **Relative rem Architecture:** All typography and component padding across the application use relative `rem` units (Tailwind classes), allowing smooth and uniform text scaling without breaking layout splitters or causing horizontal viewport overflows.
* **State & Methods:**
  * `textScale`: `TextScale` representing active scaling factor (defaults to `'100'`).
  * `setTextScale(scale: TextScale)`: Updates scale state, synchronizes `data-text-scale` on `document.documentElement`, and persists to `localStorage`.
  * `cycleTextScale()`: Cycles sequentially through `'100'` -> `'125'` -> `'150'` -> `'100'`.

### 4.7 Privacy and input protection in `ChatInput`
* **Dictionary Isolation & Anti-Autocomplete:** `<textarea>` enforces strict privacy attributes to prevent browsers from capturing or persisting sensitive form entries (names, IBANs, tax IDs) in global predictive text dictionaries:
  * `autoComplete="off"`
  * `autoCorrect="off"`
  * `spellCheck={false}`
  * `data-gramm="false"` (disables third-party grammar extensions like Grammarly)

### 4.8 Speech synthesis hook and pipeline (`useTTSStream`)
* **Web Audio API 24 kHz Linear-PCM Architecture (Rule 26 Compliance):**
  * Decodes base64-encoded signed 16-bit PCM chunks (`int16 / 32768.0`) into 32-bit float audio buffers at 24.000 Hz (1 channel).
  * Implements gapless chunk scheduling using `AudioContext.currentTime` queue progression (`nextStartTimeRef = Math.max(ctx.currentTime, nextStartTime) + buffer.duration`).
  * Lazy initialization: `AudioContext` is instantiated on first user interaction to comply with browser autoplay security policies.
* **Security & Concurrency Architecture:**
  * **Voice Whitelist Validation (Rules 9 & 21):** Strictly validates voice strings against `ALLOWED_TTS_VOICES` (`'ger_klara_calm_female'`, `'ger_uwe_newsreader_male'`, `'ger_jonas_casual_male'`). Invalid values or path traversal strings are normalized to `DEFAULT_TTS_VOICE` (`'ger_klara_calm_female'`).
  * **Text Sanitization & DoS Cap (Rules 9 & 23):** `sanitizeTextForTTS` strips code blocks, inline code, markdown formatting (`*`, `_`, `~`, `#`), images, links, and HTML tags, collapses whitespace, and strictly clamps output to 4,000 characters before WebSocket dispatch.
  * **Single-GPU Concurrency Lock (Rule 25):** Exactly one active speech synthesis stream is permitted at any time. Triggering playback on another message immediately stops previous audio nodes and closes previous WebSocket connections.
  * **Audio Interlock:** Propagates `isTTSPlaying` to `ChatInput`, preventing microphone self-feedback through speakers.
* **State & Methods:**
  * `isPlaying`: Boolean flag indicating active speech playback or streaming.
  * `activeMessageId`: ID of the message currently being read aloud (`string | null`).
  * `error`: Error message or `null`. Includes a 4,000 ms auto-dismiss timer (`setAutoDismissError`) that automatically clears transient connection failures without freezing error banners on screen.
  * `enabled?: boolean`: Configuration option passed via `UseTTSStreamOptions`. When set to `false`, immediately tears down active audio sources, and causes `speak()` calls to abort gracefully as a no-op without creating WebSocket connections.
  * `speak(messageId, text, voice?)`: Connects to `ws://127.0.0.1:8005/ws/tts`, sends payload `{"text": "<sanitized>", "voice": "<voice>"}`, and streams audio chunks into the Web Audio API pipeline.
  * `stop()`: Immediately stops all playing buffer sources, closes WebSocket, and resets playback state.
* **Voice selection and audition preview.**
  * **Header Dropdown & Audition:** Exposes a voice selector dropdown (`voice-select`) offering all 3 whitelisted voices (`Klara (Ruhig)`, `Uwe (Nachrichten)`, `Jonas (Lässig)`) alongside a dedicated audition button `[Probe]` (`voice-preview-btn`).
  * **Immediate Audition on Switch:** Selecting a new voice immediately triggers an audition playback with a sample phrase (e.g. *"Hallo, ich bin Klara."*, *"Guten Tag, ich bin Uwe."*, *"Hi, ich bin Jonas."*) via `speakTTS('preview_' + voice, config.previewText, voice)` if `ttsEnabled` is `true` and the TTS microservice is healthy.
  * **Persistence:** Selected voice is persisted across sessions in `localStorage` under `pdf_form_agent_tts_voice` (defaults to `DEFAULT_TTS_VOICE`: `'ger_klara_calm_female'`).
  * **Streaming & Status Disable:** Both the voice dropdown and audition button are disabled when `!ttsEnabled` or during active SSE response streaming (`isStreaming === true`).
  * **Full Pipeline Sync:** The chosen voice is passed dynamically as `defaultVoice` to `useTTSStream`, and explicitly used for answer read-aloud (`onSpeak`) and voice command question repeats (`handleRepeatQuestion`).

### 4.9 Document upload lifecycle and autofill toggle (`DocumentUploader`)
* **Error Resilience:** Catches file validation errors (e.g. non-PDF) and backend HTTP upload errors (e.g. HTTP 413 "File too large").
* **Reset Lifecycle:** Contains a `useEffect` on `threadId` that automatically resets `uploadError` to `null`, `isUploading` to `false`, and clears the hidden file input element value when starting a new session.
* **Declarative Remounting:** Rendered in `App.tsx` with `key={threadId}` for complete state isolation across session switches.
* **Autofill toggle for third parties.**
  * **Props:** Accepts `autofillEnabled?: boolean`, `onToggleAutofill?: (enabled: boolean) => void`, and `hasUserProfile?: boolean`.
  * **UI Controls (Rule 22 Compliant):** Monospace control bar below the dropzone featuring:
    * Toggle button: `Autofill: ON` (accent styling when active) vs `Autofill: OFF` (raised neutral styling when inactive) without decorative parentheses or emojis.
    * Status label: Displays `Stammdaten aktiv` when `autofillEnabled` is `true`, or `Leeres Formular` when `false`.
    * Profile status indicator: Shows an LED dot (`bg-app-success` if `hasUserProfile === true`, `bg-app-border` otherwise) along with `Profil vorhanden` or `Kein Profil`.
  * **Persistence:** User choice is persisted in `localStorage` under `pdf_form_agent_autofill_enabled` (defaults to `false` / `OFF` as a safe default for third-party forms).
  * **Third-Party Directive:** When `autofillEnabled === false`, upon upload `App.tsx` sends a specialized system-directive prompt to the agent:
    `"Ich habe das Dokument <filename> hochgeladen. WICHTIG: Das Formular wird für eine andere Person ausgefüllt. Verwende KEINE gespeicherten Profil-Stammdaten und rufe kein get_user_profile auf, sondern frage alle Felder ab Schritt 1 neutral ab."`
    instructing the LLM to bypass profile autofill and start fresh from Step 1 for third-party applicants (e.g. children, partners, clients).

### 4.10 Progress bar component (`ProgressBar`)
* **Contract & Props:** Accepts `progress?: FormProgress | null`.
* **Zero Dirty Display & Conditional Rendering:** If `progress` is `null` or `progress.total <= 0`, renders nothing (`null`), leaving the chat workspace clean and unencumbered.
* **W3C-ARIA Semantics:** Root container implements `role="progressbar"`, `aria-valuenow={filled}`, `aria-valuemin={0}`, `aria-valuemax={total}`, and `aria-label="Formular-Ausfüllfortschritt"`.
* **Visual States & DAW Styling (Rule 22):**
  * In-progress state: Monospace tracking `[FORTSCHRITT: SCHRITT ${currentStep} VON ${total}]` where `currentStep = Math.min(filled + 1, total)`. Dynamic percentage (`${percentage}%`) and indicator bar in `bg-app-accent`.
  * Completed state (`filled >= total`): Header shifts to `[FORTSCHRITT: ${total}/${total} FELDER ABGESCHLOSSEN]`, percentage `100%`, and indicator bar in `bg-app-success`.
* **Workspace Placement:** Positioned in the left chat pane directly below `DocumentUploader` and above the message feed. Guarantees that filling progress remains continuously visible even when the PDF preview pane is collapsed (`isPdfVisible === false`) or on mobile devices.

### 4.11 Voice commands engine and auto-send (`voiceCommands.ts`)
* **Stateless Deterministic Parser Engine (`parseVoiceCommand`):**
  * Evaluates live STT transcript tokens and returns structured `VoiceCommandResult` (`type`, `badgeLabel`, optional `cleanedText`).
  * Supported Commands:
    * `SEND`: Triggered by sentence-end phrases (*"... senden"*, *"... abschicken"*, *"... eintragen"*). Extracts preceding text (`cleanedText`), strips punctuation/trailing whitespace, and returns `badgeLabel: "SENDEN"`. Questions (*"Wohin soll ich das senden?"*, starting with W-question words or ending with `?`) are explicitly rejected as `NONE`.
    * `REPEAT_QUESTION`: Triggered by phrases like *"Wiederhole die Frage"*, *"Frage wiederholen"*, *"Nochmal vorlesen"*. Returns `badgeLabel: "WIEDERHOLE FRAGE"`.
    * `DOWNLOAD_FORM`: Triggered by phrases like *"Formular herunterladen"*, *"PDF herunterladen"*, *"pdf downloaden"*, *"bitte formular speichern"*. Returns `badgeLabel: "DOWNLOAD"`.
    * `STEP_BACK`: Triggered by phrases like *"Einen Schritt zurück"*, *"schritt zurück"*, *"bitte zurück"*. Returns `badgeLabel: "SCHRITT ZURÜCK"`.
* **VAD silence detection and auto-send grace period.**
  * **DAW Toggle Control (`AUTO-SEND: ON | OFF`):** Positioned directly in `ChatInput` adjacent to the Dictate button. Default is `OFF` to prevent accidental submissions during sensitive data readouts. State persists across sessions in `localStorage` under `pdf_form_agent_auto_send`. Can be toggled globally via shortcut `Alt+A` / `Option+A`.
  * **Deterministic Client-Side VAD:** Continuously tracks Web Audio API `audioLevel` (0.0 to 1.0) while `isRecording` and `isAutoSend` are active and `input.trim().length > 0`.
  * **Silence Threshold:** If `audioLevel <= 0.03` persists uninterrupted for 1,800 ms, initiates the auto-send sequence.
  * **Grace-Period Countdown:** Renders a 1-second animated monospace banner `[AUTO-SEND IN 1S... (TASTE/SPRECHEN BRICHT AB)]` (`data-testid="auto-send-countdown-badge"`) above the input textarea.
  * **Instant User Abort:** Immediately halts and resets all silence/countdown timers if the user resumes speaking (`audioLevel > 0.05`), edits text (`onChange`), or presses any keyboard key (`onKeyDown`), ensuring zero accidental submissions.
  * **Autonomous Turn Submission:** If the 1-second countdown runs to completion uninterrupted, halts audio capture via `stopRecording()`, dispatches `onSendMessage(input.trim())`, clears input, and flashes `[BEFEHL: AUTO-SEND]`.
* **ChatInput Interceptor Lifecycle:**
  * When a command is detected during STT dictation:
    1. Sets `ignoreTranscriptsRef.current = true` to immediately ignore trailing in-flight WebSocket packets.
    2. Gracefully halts audio capture via `stopRecording()`.
    3. Clears input and base input references (`setInput('')`, `baseInputRef.current = ''`).
    4. Displays an ephemeral DAW monospace badge `[BEFEHL: <NAME>]` (`data-testid="voice-command-badge"`) in `bg-app-accent text-app-accent-contrast` with a 2,500 ms auto-dismiss timer.
    5. Dispatches the respective action: `onSendMessage(cleanedText)` for `SEND`, `onSendMessage("Einen Schritt zurück bitte")` for `STEP_BACK`, `onRepeatQuestion()` for `REPEAT_QUESTION`, or `onDownloadForm()` for `DOWNLOAD_FORM`.
* **App-Level Orchestration (`App.tsx`):**
  * `handleRepeatQuestion`: Searches message history backwards for the last assistant prompt (`m.role === 'assistant'`) and reads it aloud via `speakTTS(m.content, m.id)` without consuming LLM tokens (0-token fast path). Strictly checks `if (!ttsEnabled || !isTtsHealthy) return;` before execution to prevent false-positive connection error popups when speech output is intentionally turned off or the TTS microservice is offline.
  * `handleDownloadForm`: Opens `/api/v1/download/{threadId}/{filename}?download=true` in a new tab via `window.open`.
* **Shortcuts & Voice Help Discovery:**
  * `ShortcutsModal` exposes dedicated entries in `Chat & Spracheingabe` and `Sprachbefehle (Freihand / Diktat)` documenting all 4 voice triggers alongside `Alt+A` / `Option+A` (Auto-Send toggle) and other keyboard shortcuts.

---

### 4.12 User profile editor modal (`UserProfileModal.tsx`)

* **Purpose & Workflow:**
  * Implements an accessible, distraction-free modal dialog for viewing, editing, importing, and exporting unstructured master data notes (`user_profile.txt`) used by the agent during Turn-1 form pre-filling.
* **Component Architecture:**
  * W3C ARIA Dialog semantics (`role="dialog"`, `aria-modal="true"`, `aria-labelledby="user-profile-modal-title"`).
  * Monospace DAW studio styling adhering strictly to Rule 22 (zero decorative emojis).
  * Features an editable `<textarea>` pre-populated with a standard personal master data template (Name, Date of Birth, Address, Phone, Email, IBAN, Tax ID, etc.) when empty, or the saved profile notes loaded from `GET /api/v1/user-profile`.
* **Zero-Latency Local File Import (`[TXT IMPORTIEREN]`):**
  * Uses a hidden HTML5 file input (`accept=".txt,.md"`) coupled with `FileReader.readAsText(file, "utf-8")`.
  * Instantly loads local note files into the textarea with 0 ms network overhead. Enforces a 64 KB client-side file size limit before reading.
* **Local File Export (`[TXT EXPORTIEREN]`):**
  * Creates an in-memory `Blob([content], { type: 'text/plain;charset=utf-8' })` and triggers a browser download for `user_profile.txt`.
* **Byte Counter & Payload Cap Enforcement:**
  * Dynamically computes UTF-8 byte length via `new TextEncoder().encode(content).length`.
  * Visual indicator: `{contentByteSize} / 65536 Bytes`. Disables the save action and warns the user if content exceeds 64 KB.
* **Persistence & State Sync:**
  * `[SPEICHERN]`: Submits content to `POST /api/v1/user-profile`. On success, updates timestamp, displays confirmation feedback, and triggers `onProfileUpdated` callback.
  * `[PROFIL LÖSCHEN]`: Prompts user confirmation via `window.confirm`, calls `DELETE /api/v1/user-profile`, resets textarea to template, and updates parent status.
  * Dismissible via backdrop click, `[SCHLIEßEN]` / `Abbrechen` buttons, or the `Escape` key.

### 4.13 Interactive action chips (`actionChips.ts`, `ActionChips.tsx`)
* **Dual-Channel Selection Principle:**
  * For fast, unambiguous responses to choice questions, interactive monospace action chips (`[ Ja ]`, `[ Nein ]`, or extracted options) are rendered beneath the active assistant prompt.
  * Clicking an action chip instantly dispatches `onSendMessage(option)` via the existing chat stream pipeline.
  * Voice dictation (`Alt+D` / `Option+D`) remains 100% equivalent (dual-channel approach).
* **Option Extraction Engine (`extractActionChips`):**
  * Evaluates question text and matching AcroForm field definitions:
    1. Parenthesized slash choices: Extracts options like `(Ledig / Verheiratet / Geschieden)` or `(Ja / Nein)`.
    2. Yes/No prompts: Matches keywords (`ja/nein`, `ankreuzen`, `anhaken`, `zutreffend`) and returns `['Ja', 'Nein']`.
    3. Numbered lists: Matches patterns like `1) Option A\n2) Option B` or `1. Option A\n2. Option B`.
    4. Metadata matching: Uses active step name to map against AcroForm choice options (`/Ch`) or checkbox/radio button options (`/Btn`).
* **Component Architecture & UX:**
  * Rendered exclusively on the latest assistant turn (`isLatestAssistant && !isStreaming`).
  * Displays prefix `Auswahl:` in `text-[10px] font-mono text-app-muted uppercase tracking-wider`.
  * Renders buttons styled with `border border-app-border bg-app-raised font-mono text-xs hover:border-app-accent hover:text-app-accent active:bg-app-accent active:text-app-accent-contrast`.
  * Disabled when `isStreaming` is `true`.

### 4.14 Form inspector component (`FormInspector.tsx`)
* **Hybrid Workflow:**
  * Offers an instant overview of all AcroForm fields alongside the conversational assistant.
  * Switchable via the workspace view switcher (`ANSICHT: [ CHAT | FORMULAR ]`) or global shortcut `Alt+M` / `Option+M`.
* **Field Controls & Semantic Mapping:**
  * `/Tx` (Text fields): Native text input with label, description, and live value.
  * `/Ch` (Choice dropdowns): Native `<select>` element populated with canonical AcroForm `/Opt` items.
  * `/Btn` (Checkboxes & Radios): Native checkbox input (`checked` state mapped from non-empty / non-`/Off` values).
* **Status Badges & Filtering:**
  * Visual status badges for every field: `[✓]` (green `text-app-success`) for filled fields, `[ ]` (muted `text-app-muted`) for unfilled fields.
  * Real-time search/filter input (`data-testid="form-inspector-search"`) filtering fields by name, description, or value.
* **Direct REST Synchronization (0 LLM Tokens):**
  * `[SPEICHERN]` button: Calls `POST /api/v1/forms/{thread_id}/fill` with modified field values directly without LLM invocation. Updates the physical PDF synchronously.
  * Triggers `onPdfUpdated()` to force live iframe preview reload, updates `ProgressBar` via `onProgressUpdated()`, and re-queries the canonical field state.
  * `[ZURÜCKSETZEN]` button: Discards unsaved local edits and re-syncs state from the latest PDF.
* **Agent Context Synchronization:**
  * When switching back to `CHAT` view, the assistant automatically reads the modified PDF via `read_pdf_form` in the next conversational turn (Single Source of Truth in PDF).

---

## 5. Layout and responsive design

### 5.1 Desktop layout (`md:` breakpoint >= 768px)
* Compact top header with 2-zone layout (`justify-between`): Left workspace zone (brand, triple service health indicators `API: Online/Offline` via `status-indicator-api`, `STT: Online/Offline` via `status-indicator-stt`, and `TTS: Online/Offline` via `status-indicator-tts`, model selector dropdown for Ollama LLMs, thinking mode toggle `Thinking: ON` / `Thinking: OFF`, TTS speech synthesis master toggle `TTS: ON` / `TTS: OFF` with `Alt+V` / `Option+V` shortcut, TTS voice selection dropdown `Voice: [Klara | Uwe | Jonas]` with adjacent audition preview button `[Probe]`, thread ID badge, and session reset button `New Session`) and right viewport/theme zone (`ml-auto` with master data profile indicator `[STAMMDATEN: AKTIV]` / `[STAMMDATEN: LEER]`, PDF viewport toggle button `PDF ausblenden` / `PDF anzeigen` directly above the PDF viewer pane, theme switcher `THEME: [LIVE | PAPER | CONTRAST]`, text-scaling control `TEXT: [100% | 125% | 150%]`, and `Shortcuts` discovery button).
* Keyboard Shortcuts Discovery & Global Handlers: Accessible modal dialog (`ShortcutsModal`) triggered via the `Shortcuts` header button or pressing `?` (when no input is focused). Global keyboard shortcuts: `Alt+M` / `Option+M` (toggle workspace view: Chat <-> Formular), `Alt+A` / `Option+A` (toggle auto-send on speech pause), `Alt+V` / `Option+V` (toggle TTS speech synthesis), `Alt+U` / `Option+U` (toggle master data / user profile modal), `Alt+P` / `Option+P` (toggle PDF viewport), `Alt+T` / `Option+T` (cycle theme: Live -> Paper -> Contrast -> Live), `Alt+S` / `Option+S` (cycle text scale: 100% -> 125% -> 150% -> 100%), `Enter` (send message), `Shift+Enter` (newline in textarea), `Alt+D` / `Option+D` (toggle speech dictation), `?` (open shortcuts modal), and `Escape` (dismiss modal). Dynamic OS-aware tooltips indicate active shortcuts on interactive elements.
* Dynamic resizable split workspace:
  * Left pane: Configurable width via `splitRatio%`, document upload trigger, workspace view switcher (`ANSICHT: [ CHAT | FORMULAR ]` rendered when `activeFilename` is set to toggle between conversational chat feed and direct `FormInspector` editor), persistent horizontal progress indicator (`ProgressBar`), flat-PDF warning banner (`[INFO] Kein interaktives Formular: Dieses Dokument enthält keine digitalen Formularfelder.`), scrollable linear document workspace feed (or Form Inspector when active), sticky auto-resizing chat input. Assistant responses include interactive action chips (`[ Ja ]`, `[ Nein ]`, or extracted options) and an accessible, emoji-free read-aloud action button (`[Vorlesen]` / `[Stop]`) with state tracking, Single-GPU concurrency management, and offline detection. When PDF viewport is closed (`isPdfVisible === false`), the left pane expands to 100% full width (`w-full flex-1`).
  * Draggable Resizer Bar: Visual divider handle with `cursor-col-resize`, double-click reset, and transparent iframe-shield overlay during drag operations. Hidden when PDF viewport is closed.
  * Right pane: Takes remaining space (`flex-1`), live PDF preview toolbar with monospace progress indicator (`[PROGRESS: X/Y (Z%)]`), active page indicator (`[PAGE N]`), action buttons (`Refresh`, `Download PDF`, `Close`), and full-height PDF viewport with `#page=N&view=FitH` parameter for responsive page-width fitting and active-page synchronization. Completely hidden when closed.

### 5.2 Mobile layout (`< 768px`)
* Single full-height pane.
* `MobileTabNav` switches active view:
  * Tab 1: `Assistent` (Chat workspace feed + Input)
  * Tab 2: `PDF Vorschau` (Live PDF Embed)
* Fallback button `PDF im Browser öffnen` and `Open Tab` toolbar button remain persistently available to accommodate mobile browser PDF rendering limitations.

### 5.3 Theme architecture and contrast standards
* **Aesthetic Philosophy (De-Slop):** Replaces generic AI-demo templates (slate blue `#090d16`, floating pill cards, glowing neon cyan/blue) with an industrial, multi-mode system without decorative emojis (Rule 22):
  * **LIVE (Ableton Live 12 Dark Theme):** Designed for low-light environments, studio workflows, and eye-friendly extended sessions:
    * `--theme-bg: #141414` (Deep Charcoal), `--theme-surface: #1e1e1e` (Studio Slate), `--theme-raised: #282828`, `--theme-active: #323232`.
    * Primary Accent: Ableton Orange (`#ff763b`), Contrast text: `#000000`.
    * Borders: `#383838`, Subtle: `#292929`. Text: Clean Off-White (`#e6e6e6`), Muted: `#9c9c9c`.
  * **PAPER (Swiss Archival Light Theme):** Designed for bright daylight and office environments, inspired by Swiss typography (Bauhaus, Dieter Rams) and archival print:
    * `--theme-bg: #dfd9cc` (Warm Archival Canvas), `--theme-surface: #ebe7dc` (Archival Desk Surface), `--theme-raised: #f4f1ea` (Pure Archival Sheet), `--theme-active: #ded8cb`.
    * Primary Accent: Swiss Bauhaus Vermilion (`#d63426`), Contrast text: `#ffffff`.
    * Secondary Accent: Prussian Ink Blue (`#1d3557`), Success: Forest Green Stamp (`#2d6a4f`).
    * Borders: Hairline Ruling (`#b8b09f`), Subtle: `#cac2b2`. Text: Deep Carbon Ink (`#121212`), Muted: Dark Graphite Ink (`#38342e` > 8:1 contrast), Dim: Medium Ink (`#5c564c`).
  * **CONTRAST (WCAG 2.1 Level AAA High-Contrast Theme):** Certified high-contrast mode for visual accessibility:
    * `--theme-bg: #000000` (Pitch Black), `--theme-surface: #000000`, `--theme-raised: #121212`, `--theme-active: #242424`.
    * High-Contrast Borders: `#ffffff` (21:1 pure white contrast), Subtle: `#d4d4d4` (14.2:1).
    * Primary Accent: Signal Yellow (`#ffff00`, 19.55:1 contrast against black), Active text on Yellow: `#000000` (19.55:1).
    * Status Colors: Secondary Cyan (`#00ffff`, 16.6:1), Success Green (`#00ff66`, 14.8:1), Danger Red (`#ff3333`, 7.5:1).
    * Typography: Pure White (`#ffffff`, 21:1), Muted Text: `#e0e0e0` (16:1, far exceeds AAA 7:1 threshold), Dim Text: `#cccccc` (13:1).
    * Accessible Focus Rings: `[data-theme="contrast"] :focus-visible` enforces an unambiguous `2px solid #ffff00 !important` outline with `2px` offset.
* **Semantic Tailwind Token Mapping:** All UI components bind to semantic variables (`bg-app-bg`, `bg-app-surface`, `bg-app-raised`, `border-app-border`, `text-app-text`, `text-app-accent`, `bg-app-accent`, `bg-app-success`, `text-app-success-contrast`, `text-app-secondary`, etc.), guaranteeing instantaneous and flicker-free theme switching.
* **DAW Segment Switchers:** Flat, emoji-free monospace segmented controls in the Header (`THEME: [LIVE | PAPER | CONTRAST]` and `TEXT: [100% | 125% | 150%]`) adhering strictly to Rule 22.
* **Responsive Header Flex-Wrap:** Adaptive height (`min-h-12 h-auto py-2 shrink-0`) with coordinated row wrapping (`gap-y-2 gap-x-4`) and inline brand/health indicator alignment, preventing layout clipping under 125% and 150% text zoom.
* **De-Slop Pure Studio Iconography:** Eliminates all decorative and illustrative SVG icons across the entire interface. The sole icon retained is the functional `<Mic />` microphone icon in `ChatInput` for recording status, accompanied by crisp, technical DAW typography (`[LOAD]`, `[ERR]`, `[PDF]`, `[RUNNING]`, `[DONE]`, `Send`, `Stop`, `Refresh`, `Download PDF`, `Vorlesen`). Zero decorative emojis (Rule 22).

---

## 6. Service layer and API clients (`src/api/client.ts`)

The frontend interacts with the FastAPI backend via type-safe async functions:
* `uploadDocument(file: File, threadId?: string): Promise<DocumentUploadResponse>`: Uploads PDF via `multipart/form-data`.
* `fetchModels(): Promise<ModelsResponse>`: Fetches available Ollama models.
* `fetchSTTHealth(): Promise<STTHealthResponse>`: Checks status of the STT microservice (Port 8002).
* `fetchTTSHealth(): Promise<TTSHealthResponse>`: Checks status of the TTS microservice (Port 8005).
* `fetchUserProfile(): Promise<UserProfileResponse>`: Retrieves saved master data notes.
* `saveUserProfile(content: string): Promise<UserProfileSaveResponse>`: Saves master data notes (max 64 KB).
* `deleteUserProfile(): Promise<UserProfileDeleteResponse>`: Deletes saved master data notes.
* `fetchFormFields(threadId: string, filename: string): Promise<FormFieldsResponse>`: Directly inspects canonical AcroForm fields from PDF via `GET /api/v1/forms/{thread_id}/{filename}/fields` with 0 LLM tokens.
* `fillFormDirect(threadId: string, filename: string, fieldValues: Record<string, unknown>): Promise<FormFillResponse>`: Directly fills AcroForm fields via `POST /api/v1/forms/{thread_id}/fill`, updating the PDF, read-only bits, and accessibility tags synchronously.

---

## 7. Operational rules compliance

1. **Rule 22 (No Emojis in Labels):** All buttons, triggers and badges use clean, professional textual labels without decorative emojis or artificial bracket wrappers, e.g., `PDF-Formular hier ablegen oder auswählen`, `Datei wählen`, `Send`, `Stop`, `Refresh`, `Download PDF`, `New Session`, `Thinking: ON`, `Thinking: OFF`, `PDF ausblenden`, `PDF anzeigen`, `LIVE`, `PAPER`, `CONTRAST`, `100%`, `125%`, `150%`, `Close`, `Vorlesen`, `CHAT`, `FORMULAR`, `[SPEICHERN]`, `[ZURÜCKSETZEN]`.
2. **Rule 47 (Session Persistence & UX Verification):** Thread ID and conversation state survive page reloads (F5) without losing connection or context. Theme selection is persisted in `localStorage` under `pdf_form_agent_theme`, text scale under `pdf_form_agent_text_scale`, PDF visibility under `pdf_form_agent_pdf_visible`, and voice selection under `pdf_form_agent_tts_voice`.
3. **SPA Single-Service Delivery:** FastAPI mounts the compiled `frontend/dist` directory at root `/` with `html=True` using `src.config.PROJECT_ROOT`.

---

## 8. Test suite contract and verification

All frontend components, utilities, and hooks must satisfy the Vitest test suite (**203/203 passing tests across 26 test files**):

1. **`tests/themeContrast.test.ts` (3 tests):** Verifies WCAG 2.1 relative luminance calculation and guarantees $\ge 7:1$ AAA contrast ratios across text, muted text, dim text, accent yellow, status cyan, and success green against pitch-black background.
2. **`tests/useTextScale.test.ts` (5 tests):** Verifies root font-scale initialization (`100`), DOM attribute reflection (`data-text-scale`), `localStorage` persistence, fallback behavior on invalid storage values, and cycling through `100` -> `125` -> `150` -> `100`.
3. **`tests/useTheme.test.ts` (6 tests):** Verifies default theme initialization (`live`), DOM attribute reflection (`data-theme`), `localStorage` persistence for `live`, `paper`, and `contrast`, fallback behavior on invalid storage values, and 3-step toggle cycling (`live` -> `paper` -> `contrast` -> `live`).
4. **`tests/useResizableSplit.test.ts` (5 tests):** Verifies mouse event tracking, clamping within `[25%, 65%]` boundaries, `localStorage` persistence under `pdf_form_agent_split_ratio`, double-click reset to default `40%`, and `isPdfVisible` panel collapse/restore state and persistence.
5. **`tests/useSessionState.test.ts` (6 tests):** Verifies thread-isolated `sessionStorage` state synchronization, active filename management, cache-busting `pdfVersion` bumps, preservation of `selectedModel` and `thinkEnabled`, formProgress / activePage persistence and reset, and purging of all orphaned session keys from `sessionStorage` on `resetSession`.
6. **`tests/useChatStream.test.ts` (7 tests):** Verifies SSE streaming lifecycle, propagation of `model_name` and `think_enabled` in POST body, token/thought message accumulation, `stopStream` abort handling, `fill_pdf_form` tool completion with `onProgressUpdated` parsing, error reset on `threadId` change, and SSE error chunk handling with placeholder pruning.
7. **`tests/useSTTStream.test.ts` (20 tests):** Verifies WebSocket URL resolution, microphone audio graph initialization, AudioWorklet Float32 PCM chunk forwarding, AnalyserNode audioLevel initialization and teardown reset, partial event transcript combination (committed + tentative), graceful finalize stop handshake (`{"action": "stop"}` -> `StreamFinalEvent`), safety timeout closure, busy/pool exhaustion handling (code 4029), permission error handling (`NotAllowedError`), client-side DoS timeout enforcement, and filtering/extraction of Python `StreamText` object representations.
8. **`tests/useTTSStream.test.ts` (21 tests):** Verifies TTS WebSocket URL resolution (port 8001 to 8005 mapping and fallbacks), strict voice whitelist validation (`ALLOWED_TTS_VOICES`) and path traversal protection, text sanitization (stripping code blocks, markdown links, HTML, formatting, and enforcing 4,000 character DoS cap), lazy Web Audio API AudioContext initialization, 24 kHz linear PCM chunk decoding and gapless scheduling, Single-GPU concurrency locking, service offline error handling without UI crash, 4-second error auto-dismiss timer, `enabled: false` execution guard and dynamic teardown, graceful stop/completion handshakes, multi-turn consecutive `speak()` resilience, and stale socket handler detachment.
9. **`tests/Header.test.tsx` (17 tests):** Verifies brand rendering, triple service health indicators (`API: Online/Offline`, `STT: Online/Offline`, and `TTS: Online/Offline` badges with respective test IDs and color states), model selector dropdown population and switching, thinking mode toggle transitions (`Thinking: ON` / `Thinking: OFF`), speech synthesis master toggle (`TTS: ON` / `TTS: OFF`), voice selector dropdown (`voice-select`) and audition preview button (`voice-preview-btn`) with disabled states, PDF visibility action toggle (`PDF ausblenden` / `PDF anzeigen`), theme switcher segment control (`LIVE | PAPER | CONTRAST`), text scale segment control (`100% | 125% | 150%`), shortcuts discovery button and `onOpenShortcuts` callback invocation, user profile / master data status button (`[STAMMDATEN: AKTIV]` / `[STAMMDATEN: LEER]`) and `onOpenUserProfile` callback invocation, thread ID badge display, and reset session confirmation modal.
10. **`tests/DocumentUploader.test.tsx` (5 tests):** Verifies drag-and-drop zone events, file input selection with value reset, upload error display with automatic error cleanup on `threadId` change, and autofill toggle switch (`Autofill: ON` / `Autofill: OFF`) with profile indicator.
11. **`tests/ChatContainer.test.tsx` (3 tests):** Verifies empty-state rendering, chronological message feed layout, and auto-scroll execution.
12. **`tests/ChatMessage.test.tsx` (9 tests):** Verifies role-based styling (`user` vs `assistant`), tool execution chip rendering, collapsible reasoning process block, markdown text formatting, action chips integration on the active assistant turn, read-aloud button rendering (`Vorlesen` / `Stop`), absence on user messages, click handling, disabled state when TTS service is offline, and disabled state when `ttsEnabled` is false.
13. **`tests/PDFToolbar.test.tsx` (4 tests):** Verifies PDF toolbar actions (`Refresh`, `Download PDF`, `Open Tab`), `Close` button click handling, progress badge `[PROGRESS: X/Y (Z%)]`, and active page badge `[PAGE N]`.
14. **`tests/MobileTabNav.test.tsx` (1 Test):** Verifies switching between `Assistent` and `PDF Vorschau` tabs on mobile viewport screens (< 768px).
15. **`tests/ChatInput.test.tsx` (19 tests):** Verifies textarea input state, submission on Enter (without Shift), newline on Shift+Enter, Stop button and callback when streaming, Dictate button state and disabled conditions, Alt+D and macOS Option+D (KeyD) keyboard shortcuts, live transcript streaming into the textarea, DAW VU-meter rendering when recording, permission denial error rendering, continuous hands-free pause/resume cycle, privacy/anti-autocomplete attributes, STT-Interlock pausing during TTS speech output and auto-resuming on completion, voice command interceptor execution for `SEND` (with cleaned text), `REPEAT_QUESTION`, `DOWNLOAD_FORM`, `STEP_BACK`, and 2,500 ms auto-dismissing `[BEFEHL: ...]` badge.
16. **`tests/ShortcutsModal.test.tsx` (6 tests):** Verifies accessible modal dialog semantics (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`), conditional rendering on `isOpen`, rendering of all key bindings across Chat, Voice Commands (`[SPRACHBEFEHLE (FREIHAND / DIKTAT)]`), and Workspace sections (including `Alt+M` view switching, `Alt+T` theme rotation, `Alt+S` text scaling, and `Alt+U` master data editor), close button interaction, backdrop click-to-close with content click propagation prevention, and Escape key listener.
17. **`tests/AppKeyboardShortcuts.test.tsx` (10 tests):** Verifies global keyboard shortcut integration on `window`: toggling shortcuts modal with `?` when focus is outside inputs, preventing modal trigger when textarea is focused, toggling `UserProfileModal` with `Alt+U` and dismissing on Escape, toggling `TTS: ON | OFF` with `Alt+V` / `Option+V` with `localStorage` persistence, toggling workspace view with `Alt+M` / `Option+M` between Chat and Formular when document is loaded, cycling themes between `live`, `paper`, and `contrast` with `Alt+T`, cycling text scaling between `100`, `125`, and `150` with `Alt+S`, toggling PDF visibility with `Alt+P`, and mounting `ProgressBar` in the chat workspace when form progress is active.
18. **`tests/sse.test.ts` (1 Test):** Verifies chunk aggregation, boundary splitting, and parsing of `event:` and `data:` payloads into `SSEEventChunk` objects.
19. **`tests/ToolCallBadge.test.tsx` (5 tests):** Verifies expandable tool call badge rendering, inspection toggle (`[DETAILS]` / `[COLLAPSE]`), and parameter/result presentation.
20. **`tests/ProgressBar.test.tsx` (4 tests):** Verifies deterministic rendering lifecycle: returns `null` when `progress` is `null` or `progress.total === 0`, renders active step counter `[FORTSCHRITT: SCHRITT X VON Y]`, percentage, and W3C-ARIA progressbar attributes (`aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`), and shifts to completed state `[FORTSCHRITT: Y/Y FELDER ABGESCHLOSSEN]` with `bg-app-success` when all fields are populated.
21. **`tests/voiceCommands.test.ts` (18 tests):** Verifies stateless voice commands parser engine (`parseVoiceCommand`): `SEND` detection and text extraction with trailing punctuation, standalone `senden`, rejection of questions and mid-sentence triggers as `NONE`, `REPEAT_QUESTION` variants with `WIEDERHOLE FRAGE` badge, `DOWNLOAD_FORM` variants with `DOWNLOAD` badge, `STEP_BACK` variants with `SCHRITT ZURÜCK` badge, and default `NONE` for normal dictation.
22. **`tests/UserProfileModal.test.tsx` (9 tests):** Verifies accessible dialog semantics (`role="dialog"`), loading existing profile content, fallback to default template, editing and saving with byte counter validation, deletion with confirmation dialog, zero-latency local `.txt` file import via `FileReader`, 64 KB client-side upload rejection, text Blob export download, and modal dismissal on close button and Escape key.
23. **`tests/ChatInputAutoSend.test.tsx` (7 tests):** Verifies `AUTO-SEND: ON/OFF` toggle state and `localStorage` persistence, `Alt+A` / `Option+A` keyboard shortcut integration, silence detection threshold (1,800 ms at `audioLevel <= 0.03`) initiating the 1-second countdown, autonomous submission upon countdown completion with `[BEFEHL: AUTO-SEND]` feedback badge, immediate countdown cancellation upon voice resumption (`audioLevel > 0.05`), immediate cancellation upon user typing/keystrokes, and protection against empty textarea auto-submission.
24. **`tests/actionChips.test.ts` (5 tests):** Verifies pure option extraction from assistant messages: parenthesized slash choices `(A / B)`, binary `Ja/Nein` questions, numbered lists `1) A 2) B`, and matching against AcroForm field definitions.
25. **`tests/ActionChips.test.tsx` (3 tests):** Verifies action chips rendering, disabled state during `isStreaming`, and user click dispatch triggering `onSelect(opt)`.
26. **`tests/FormInspector.test.tsx` (4 tests):** Verifies Form Inspector component rendering of all AcroForm field types (`/Tx`, `/Ch`, `/Btn`), real-time search filtering, field value edits and direct `fillFormDirect` save dispatch, and `[ZURÜCKSETZEN]` action resetting unsaved inputs.





