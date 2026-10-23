# Backend specification: PDF Form Agent (v1.0.0)

This document describes the technical architecture, data contracts, and verification rules of the `pdf_form_agent` backend. It contains the complete schema and behavioral requirements needed to maintain or rebuild the service. It is designed to enable any human engineer or LLM to understand, maintain, or completely rebuild the service 1:1 without needing access to the original codebase.

---

## 1. System architecture and directory layout

The `pdf_form_agent` backend handles interactive, step-by-step PDF form completion. It discovers AcroForm fields, extracts contextual text to decode ambiguous labels, prompts users for values via a conversational ReAct agent, fills fields, and locks the output with read-only widget flags.

```text
pdf_form_agent/
├── AGENTS.md                    # Mandatory agent onboarding & core operational rules
├── LICENSE                      # Project license (MIT)
├── README.md                    # Project overview & developer guide
├── pyproject.toml               # Project dependencies & Python requirements (>=3.12)
├── src/
│   ├── __init__.py
│   ├── config.py                # Environment configuration & session path management
│   ├── main.py                  # Uvicorn web server entry point
│   ├── cli.py                   # Terminal CLI for interactive testing
│   ├── api/
│   │   ├── __init__.py
│   │   └── app.py               # FastAPI application, CORS, REST & SSE endpoints
│   ├── core/
│   │   ├── __init__.py
│   │   ├── agent.py             # ReAct Supervisor Agent (create_agent with MemorySaver)
│   │   ├── model_factory.py     # Dynamic model routing (NVIDIA NIM / Ollama)
│   │   ├── tools.py             # LangChain adapter facade exposing @tool decorators
│   │   ├── user_profile.py      # Master data text notes reader, writer, and deleter
│   │   └── pdf/                 # Pure domain PDF manipulation & security engine
│   │       ├── __init__.py      # Domain engine re-exports
│   │       ├── security.py      # Active payload & script threat inspection
│   │       ├── extractor.py     # Path resolution, AcroForm field & page text extraction
│   │       ├── normalizer.py    # Radio, checkbox & dropdown choice normalization
│   │       └── writer.py        # PDF/UA ISO 14289-1 filling, flattening & page detection
│   └── prompts/
│       ├── __init__.py          # Resilient prompt loader (load_prompt, in-memory fallback)
│       ├── pdf_form_agent.yaml  # Form-agent ReAct system prompt configuration
│       └── summarization.yaml   # Form-filling context compression prompt
├── data/
│   ├── conversation_history/    # Archived pruned conversations: {thread_id}_archive.md
│   └── session_docs/            # Root document storage (includes sessions/{thread_id}/)
├── docs/
│   ├── backend_specification_1.md
│   └── frontend_specification_1.md
├── docs_dw/                     # Internal developer notes, journals, and rules
└── tests/
    ├── test_agent.py            # Unit tests for PDFFormAgent & event streaming
    ├── test_api.py              # Unit tests for FastAPI endpoints (REST & SSE)
    ├── test_cli.py              # Unit tests for terminal CLI interface
    ├── test_pdf_extractor.py    # Unit tests for PDF path resolution, options & text
    ├── test_pdf_form_agent.py   # Integration & PDF tools verification suite
    ├── test_pdf_normalizer.py   # Unit tests for radio, checkbox & choice normalizers
    ├── test_pdf_security.py     # Unit tests for PDF active content threat detector
    ├── test_pdf_ua_accessibility.py # Unit tests for PDF/UA ISO 14289-1 accessibility
    ├── test_pdf_writer.py       # Unit tests for form writing, flattening & active page
    ├── test_prompts.py          # Unit tests for YAML prompt loader & fallback
    ├── test_user_profile.py     # Unit tests for user profile REST API endpoints
    ├── test_user_profile_core.py# Unit tests for user profile domain module
    ├── test_validation_middleware.py # Unit tests for deterministic validation middleware
    └── test_validators.py       # Unit tests for pure-Python format validators
```

---

## 2. Configuration and environment (`src/config.py`)

Centralized configuration is managed via `pydantic-settings` (`BaseSettings`).

### 2.1 Settings schema

```python
class Settings(BaseSettings):
    PROJECT_NAME: str = "PDF Form Agent"
    API_V1_STR: str = "/api/v1"
    MODEL_NAME: str = "gemma4:e4b"          # Default local model
    OLLAMA_BASE_URL: str = "http://localhost:11434" # Local Ollama service URL
    NUM_CTX: int = 16384                    # Context window size in tokens (16k)

    # Summarization Middleware settings (LangChain 1.4+)
    ENABLE_SUMMARIZATION: bool = True
    SUMMARIZATION_TRIGGER_TOKENS: int = 8000
    SUMMARIZATION_TRIGGER_MESSAGES: int = 20
    SUMMARIZATION_KEEP_MESSAGES: int = 6
    SUMMARIZATION_TRIM_TOKENS: int = 4000
    SUMMARIZATION_OFFLOAD_TO_FILE: bool = True

    STT_HOST: str = "127.0.0.1"             # STT microservice host
    STT_PORT: int = 8002                    # STT microservice port
    TTS_HOST: str = "127.0.0.1"             # TTS microservice host (Qwen3-TTS)
    TTS_PORT: int = 8005                    # TTS microservice port
    CORS_ORIGINS: list[str] = [             # Whitelisted CORS origins
        "http://localhost:8001",
        "http://127.0.0.1:8001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
```

* **`BASE_DIR`**: Path to `src/` directory.
* **`PROJECT_ROOT`**: Parent directory of `BASE_DIR`.
* **`DATA_DIR`**: `PROJECT_ROOT / "data" / "session_docs"`. Guaranteed to exist at startup via `mkdir(parents=True, exist_ok=True)`.
* **`SESSIONS_DIR`**: `DATA_DIR / "sessions"`. Isolated destination for ephemeral session directories. Guaranteed to exist at startup via `mkdir(parents=True, exist_ok=True)`.
* **`CONVERSATION_HISTORY_DIR`**: `PROJECT_ROOT / "data" / "conversation_history"`. Destination for offloaded conversation archives. Guaranteed to exist at startup via `mkdir(parents=True, exist_ok=True)`.
* **Config Dictionary**: `SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore")`.

---

## 3. Domain engine, user profile, and LangChain facade (`src/core/pdf/`, `src/core/user_profile.py`, `src/core/tools.py`)

The PDF processing and master data subsystem is structured as a Clean Architecture domain engine, strictly decoupling computational PDF manipulation from the LangChain agent framework:

1. **Pure Domain Engine (`src/core/pdf/`):** Contains zero LangChain dependencies and can be used as an independent, deterministic PDF processing library.
   * `security.py`: `inspect_pdf_security(pdf_source)` scans for active content threats (`/Launch`, `/JavaScript`, `/AA`, attachments).
   * `extractor.py`: `resolve_pdf_path`, `read_pdf_form_data`, `extract_pdf_page_text`, and `extract_choice_options`.
   * `normalizer.py`: `discover_btn_on_keys`, `discover_radio_groups`, and `normalize_field_values`.
   * `writer.py`: `write_pdf_form` executes AcroForm filling, PDF/UA accessibility attributes (`/Tabs /S` or `/Tabs /R`, `/Lang: de-DE`), widget ReadOnly flattening (`/Ff | 1`), active page detection, and output verification.
2. **Master Data Storage (`src/core/user_profile.py`):** Provides atomic, safe read, save, and delete operations for user profile text notes (`data/user_profile.txt`).
3. **LangChain Adapter Facade (`src/core/tools.py`):** Thin wrapper around the domain engine exposing tools decorated with `@tool` (`read_pdf_form`, `read_pdf_text_for_form`, `fill_pdf_form`, `get_user_profile`) and maintaining 100% backwards-compatible exports for all legacy imports and tests.

### 3.1 Path resolution and security (`resolve_pdf_path`)

All file accesses enforce strict path traversal sanitization:

```python
def resolve_pdf_path(
    filepath: str,
    thread_id: str | None = None,
    config: Any | None = None,
    base_dir: Path | None = None,
) -> Path: ...
```

**Resolution Priority:**
1. **Isolated Session Directory:** `SESSIONS_DIR / safe_thread_id / safe_filename` (if `SESSIONS_DIR` exists and `thread_id` is supplied).
2. **Thread Session Directory:** `DATA_DIR / safe_thread_id / safe_filename` (if `thread_id` is provided in `config["configurable"]["thread_id"]` or parameter).
3. **Direct Data Directory:** `DATA_DIR / safe_filename`.
4. **Local Relative Path:** `Path(filepath)` if it exists on disk.
5. **Fallback Path:** Defaults to session path under `DATA_DIR`.

**Security Validation:** Every resolved path is sanitized with `Path(filepath).name` and validated using `.resolve().is_relative_to(...)` to prevent directory traversal (`../`).

---

### 3.2 Tool 1: `read_pdf_form`

Discovers all interactive AcroForm fields in a PDF, including text fields (`/Tx`), checkboxes (`/Btn`), and choice dropdowns (`/Ch`).

* **Signature:** `read_pdf_form(filepath: str, config: RunnableConfig) -> str`
* **Execution steps:**
  * Opens PDF using `pypdf.PdfReader`.
  * Calls `reader.get_fields()`.
  * Extracts field dictionary properties: `/FT` (Field Type), `/TU` (Tooltip / Alternative Description), `/V` (Current Value).
  * **Choice / Dropdown Option Extraction:** If `/FT == "/Ch"` or `/Opt` is present in the field dictionary, executes `_extract_choice_options(info)` to parse the allowed selection list (supporting both simple string arrays `["Opt1", "Opt2"]` and `[export_val, display_val]` pairs).
* **Return format (JSON string):**
  ```json
  {
    "error": false,
    "total_fields": 3,
    "filled_fields": 0,
    "fields": [
      {
        "name": "txt_nachname",
        "type": "/Tx",
        "description": "Nachname der antragstellenden Person",
        "value": ""
      },
      {
        "name": "chk_wohnen_allein",
        "type": "/Btn",
        "description": "Ich bewohne die Unterkunft allein",
        "value": "/Off"
      },
      {
        "name": "drp_familienstand",
        "type": "/Ch",
        "description": "Familienstand auswählen",
        "value": "",
        "options": [
          "Ledig",
          "Verheiratet / Eingetragene Lebenspartnerschaft",
          "Dauernd getrennt lebend",
          "Geschieden",
          "Verwitwet"
        ]
      }
    ]
  }
  ```
* **Edge Cases:** If no AcroForm fields exist, returns `total_fields: 0` with message `"Keine AcroForm-Felder gefunden. Dieses PDF enthält kein ausfüllbares Formular."`.

---

### 3.3 Tool 2: `read_pdf_text_for_form`

Extracts visible page text to deduce cryptic field names (e.g., matching `"Text1"` to adjacent text `"First Name:"`).

* **Signature:** `read_pdf_text_for_form(filepath: str, config: RunnableConfig) -> str`
* **Execution steps:**
  * Iterates over `reader.pages`.
  * Extracts text per page: `f"--- SEITE {i + 1} ---\n{text.strip()}"`.
* **Fallback:** Returns `"Kein extrahierbarer Text gefunden (gescanntes PDF oder leere Seiten)."` if pages contain no parseable text.

---

### 3.4 Tool 3: `fill_pdf_form`

Populates AcroForm fields, normalizes standalone checkboxes (`/Btn`), hierarchical radio groups (`/Btn`), and dropdown inputs (`/Ch`), and applies read-only flattening.

* **Signature:** `fill_pdf_form(filepath: str, field_values: dict[str, Any], output_filename: str, config: RunnableConfig) -> str`
* **Execution steps:**
  1. Resolves and sanitizes file paths (`_resolve_pdf_path`).
  2. **Standalone checkbox on-key discovery (`_discover_btn_on_keys`).** Scans page annotations and AcroForm fields for 2-state `/Btn` checkboxes (excluding radio groups where `Ff & 32768 != 0`) and inspects `/AP/N` dictionaries to find the document's active on-state key (`/Yes`, `/Ja`, `/On`, etc.).
  3. **Hierarchical radio group discovery (`_discover_radio_groups`).** Discovers 1-of-N radio groups (`/FT == /Btn` with `Ff & 32768 != 0` or `/Kids` with multiple states) and extracts their appearance states (`/0`, `/1`, etc.) and associated option labels (`/Opt`).
  4. **Choice option discovery (`_discover_choice_options`).** Reads available `/Opt` lists for all Choice dropdowns (`/Ch`).
  5. **Value normalization (`_normalize_field_values`).**
     * **Radio groups.** Maps 1-based numeric indices (`"1"` -> `states[0]`, `"2"` -> `states[1]`), option label matches (case-insensitive & prefix matches such as `"ja"` or `"nein"`), or states (`"/0"`, `"/1"`) to the correct appearance state. Falsy strings like `"nein"` in a `['ja', 'nein']` group resolve to `states[1]` (`/1`), preventing accidental `/Off` deactivations.
     * **Standalone checkboxes.** Matches against `_CHECKBOX_FALSY_STRINGS` (`"false"`, `"0"`, `"nein"`, `"no"`, `"off"`, `"none"`, `"nicht"`, `""`, `None`). Any affirmative value or free text (e.g., `"männlich"`, `"allein"`, `"ja"`, `True`, `"x"`, `"checked"`, `"zutreffend"`) reliably activates the checkbox (`on_key`, e.g. `/Yes`). Falsy values deactivate it (`/Off`).
     * **Choice dropdowns.** Maps 1-based numeric indices (e.g. `"1"`) or case-insensitive string matches to the exact `/Opt` choices.
  6. Instantiates `pypdf.PdfWriter(clone_from=resolved_path)`.
  7. Updates form fields across **all pages** (`for page in writer.pages: writer.update_page_form_field_values(page, normalized_values)`).
  8. **PDF/UA and BITV 2.0 accessibility enforcement (ISO 14289-1 § 7.18.1).**
     * **Structure and tag preservation.** Retains existing `/StructTreeRoot` and `/MarkInfo` (with `/Marked = True`) on tagged documents.
     * **Deterministic tab order.** Enforces `/Tabs /S` (Structure Order) across all pages when `/StructTreeRoot` is present, or `/Tabs /R` (Row Order) on untagged documents to prevent erratic focus jumping in external PDF readers.
     * **Document language.** Preserves existing `/Lang` attribute or sets default `de-DE` (`TextStringObject("de-DE")`) in the document catalog (`/Root`) to ensure screenreaders use correct phonetics.
     * **Accessible field labels.** Retains `/TU` (tooltips) and `/T` (field names) unmutated during Read-Only flattening.
  9. **Read-only flattening.**
     * Traverses `writer.pages` and inspects `/Annots`.
     * Identifies annotations where `/Subtype == "/Widget"`.
     * Sets the ReadOnly bit (`bit 1`): `annot[NameObject("/Ff")] = NumberObject(ff_val | 1)`.
  10. **Active page detection.**
      * Traverses `writer.pages` to locate the 1-based page index `active_page` containing any of the modified widget annotations (`/T` or `/Parent/T` matching modified keys).
  11. Writes output PDF to `DATA_DIR / safe_thread_id / safe_output_filename`.
  12. **Output verification and metrics parity.** Delegates post-write verification to `read_pdf_form_data(output_path)` to ensure strict metrics parity between upload and writing operations (accurately counting `total_fields` and `filled_fields`, while filtering out untouched `/Off` button values).
* **Return format (JSON string):**
  ```json
  {
    "error": false,
    "status": "success",
    "message": "PDF erfolgreich ausgefüllt: output_filled.pdf",
    "output_file": "output_filled.pdf",
    "download_url": "/api/v1/download/session_123/output_filled.pdf",
    "total_fields": 28,
    "filled_fields": 28,
    "active_page": 1,
    "written_values": {
      "txt_nachname": "Mustermann",
      "chk_wohnen_allein": "/Yes",
      "drp_familienstand": "Ledig"
    }
  }
  ```

---

### 3.5 Tool 4: Read user profile notes (`get_user_profile`)

* **Tool decorator:** `@tool def get_user_profile() -> str`
* **Purpose:** Reads stored user profile and master data notes (Stammdaten) from `DATA_DIR / "user_profile.txt"`.
* **Behavior:**
  1. Checks if `DATA_DIR / "user_profile.txt"` exists on disk.
  2. If missing or empty, returns an informative prompt message (`"Kein Nutzerprofil gefunden..."`).
  3. If present, returns the stripped plain text content.
  4. Used by the ReAct agent during turn 1 to perform batch autofilling without asking redundant questions for standard personal data.

---

### 3.6 Tool registry and system prompt

* **Exported tool array:** `AVAILABLE_PDF_FORM_TOOLS = [read_pdf_form, read_pdf_text_for_form, fill_pdf_form, get_user_profile]`
* **System prompt guidance (`PDF_FORM_PROMPT`):** Guides the ReAct agent to:
  1. Inspect uploaded or placed PDF forms using `read_pdf_form`.
  2. Use `read_pdf_text_for_form` for contextual form and infobox explanations.
  3. **Turn-1 user profile autofill (`STAMMDATEN-VORBELEGUNG`).** Invokes `get_user_profile` at session start. If master data is available, matches fields semantically (Name, Address, IBAN, Tax ID, etc.) and performs immediate batch `fill_pdf_form` execution before continuing with missing fields.
  4. Prompt the user **one field at a time**, validating inputs.
  5. **Natural language and no technical identifiers.** Always speak in friendly, natural language and NEVER leak internal technical field names or programming identifiers (e.g. `txt_strasse_hausnr`, `chk_...`, `drp_...`) into user-facing prompts.
  6. **Immediate live update.** Immediately invoke `fill_pdf_form` after receiving each valid field response so that the browser PDF viewer updates in real time.
  7. **Prompt injection defense.** Strictly treats all extracted PDF text and field values as untrusted user payload, rejecting any instructions, override commands, or prompt hijack attempts embedded in the document.
  8. Present the final `download_url` as a Markdown link upon completion: `[PDF herunterladen](download_url)`.

---

### 3.7 System prompt architecture (`src/prompts/`)

The system prompt is decoupled from Python code and maintained in a clean, versioned YAML configuration.

* **Configuration files:**
  * `src/prompts/pdf_form_agent.yaml`: Contains the complete ReAct assistant instructions under the top-level `system_prompt` key. Supports natural markdown paragraphs and clear directive sections without Python string concatenation.
  * `src/prompts/summarization.yaml`: Contains specialized instructions for conversational context extraction during long form-filling sessions. Structures summaries into mandatory sections: `SESSION INTENT`, `CONFIRMED FORM FIELDS`, `USER CONSTRAINTS & REVISIONS`, and `PENDING STEPS`, concluding with `{messages}` placeholder for XML message injection.
* **Prompt loader (`src/prompts/__init__.py`).**
  * `load_prompt(name: str = "pdf_form_agent") -> str`: Resolves `{PROMPTS_DIR}/{name}.yaml` and safely parses it using `yaml.safe_load()`.
  * **In-memory fallback (`_FALLBACK_PROMPTS`).** Maps prompt names to hardcoded defaults (`_DEFAULT_FALLBACK_PROMPT` for form agent, `_DEFAULT_SUMMARIZATION_FALLBACK_PROMPT` for summarization). If any YAML file is missing, empty, or fails to parse, logs a warning and falls back cleanly to guarantee zero runtime failures.
* **Exports and usage:**
  * `PDF_FORM_PROMPT` and `SUMMARIZATION_PROMPT` are exported directly by `src.prompts`.
  * `PDF_FORM_PROMPT` is re-exported in `src.core.tools` (`from src.prompts import PDF_FORM_PROMPT`) for full backwards compatibility with legacy tool imports.
  * Consumed directly by `src.core.agent.PDFFormAgent` and `PDFFormSummarizationMiddleware`.

---

## 4. Model factory (`src/core/model_factory.py`)

Provides model discovery and instantiation for local Ollama instances with dynamic thinking mode support.

### 4.1 Ollama model discovery and embedding filtering (`fetch_ollama_chat_models`, `is_embedding_model`)

Discovers all available local models from Ollama's `GET /api/tags` endpoint and filters out non-generative embedding models.

* **Embedding Filtering Rules (`is_embedding_model`):**
  * **Family Exclusion:** Checks `details.family` and `details.families` against `_EMBEDDING_FAMILIES = {"nomic-bert", "bert", "clip", "colbert"}`.
  * **Pattern Matching:** Checks model name against `_EMBEDDING_KEYWORDS = ("embed", "embedding", "bge-", "bge_", "gte-", "gte_", "minilm")`.
* **Async Discovery (`fetch_ollama_chat_models`):**
  * Executes asynchronous HTTP GET to `OLLAMA_BASE_URL/api/tags` with a 2.0s timeout using `httpx.AsyncClient`.
  * Returns formatted metadata list: `name`, `display_name`, `size`, `parameter_size`, `family`, `is_current`.
  * **Fallback Behavior:** If Ollama is offline or unreachable, returns a single fallback entry matching `settings.MODEL_NAME`.

### 4.2 Factory instantiation (`create_chat_model`)

```python
def create_chat_model(
    model_name: str | None = None,
    temperature: float = 0.0,
    num_ctx: int | None = None,
    think_enabled: bool = False,
    **kwargs: Any,
) -> ChatOllama: ...
```

* **Local Ollama Instantiation:** Instantiates `ChatOllama(model=model, reasoning=think_enabled, num_ctx=target_num_ctx, temperature=temperature)` where `target_num_ctx` defaults to `settings.NUM_CTX` (16,384 tokens), preventing VRAM buffer exhaustion while accommodating large multi-page form prompts.

---

## 5. Agent supervisor runtime (`src/core/agent.py`)

Built on LangChain's `create_agent` pattern and LangGraph checkpointing.

### 5.1 `PDFFormAgent` class structure

`PDFFormAgent` sources its default system prompt from the modular YAML prompt loader (`src.prompts.PDF_FORM_PROMPT`, loaded from `src/prompts/pdf_form_agent.yaml`).

```python
class PDFFormAgent:
    def __init__(
        self,
        model_name: str | None = None,
        system_prompt: str | None = None,
        custom_tools: list[Any] | None = None,
        temperature: float = 0.0,
        think_enabled: bool = False,
        checkpointer: Any | None = None,
        enable_summarization: bool | None = None,
        custom_middleware: list[Any] | None = None,
        llm: Any | None = None,
    ):
        self.model_name = model_name or settings.MODEL_NAME
        self.system_prompt = system_prompt or PDF_FORM_PROMPT
        self.tools = custom_tools or AVAILABLE_PDF_FORM_TOOLS
        self.memory = checkpointer or MemorySaver()
        self.llm = llm or create_chat_model(...)
        
        # Summarization middleware setup
        if custom_middleware is not None:
            self.middleware = custom_middleware
            self.enable_summarization = bool(custom_middleware)
        else:
            self.enable_summarization = (
                enable_summarization
                if enable_summarization is not None
                else settings.ENABLE_SUMMARIZATION
            )
            self.middleware = [PDFFormValidationMiddleware()]
            if self.enable_summarization:
                self.middleware.append(PDFFormSummarizationMiddleware(model=self.llm))

        self.agent = create_agent(
            model=self.llm,
            system_prompt=self.system_prompt,
            checkpointer=self.memory,
            tools=self.tools,
            middleware=self.middleware,
            name="supervisor",
        )
```

### 5.2 Context compression and summarization middleware (`PDFFormSummarizationMiddleware`)

Inherits directly from LangChain's native `SummarizationMiddleware` (`langchain.agents.middleware.SummarizationMiddleware`) to prevent KV cache bloat and context window overflow during extended form-filling sessions.

* **Trigger configuration.** Configurable dual triggers evaluated before model invocation:
  * Token threshold: `settings.SUMMARIZATION_TRIGGER_TOKENS` (default 8,000 tokens).
  * Message threshold: `settings.SUMMARIZATION_TRIGGER_MESSAGES` (default 20 messages).
* **Retention window (`keep`).** Preserves the most recent `settings.SUMMARIZATION_KEEP_MESSAGES` (default 6 messages) intact, ensuring active conversational immediacy.
* **Trim limit.** `settings.SUMMARIZATION_TRIM_TOKENS` (default 4,000 tokens) caps the maximum tokens compressed in a single summarization pass.
* **Pruned message archiving.**
  * When `settings.SUMMARIZATION_OFFLOAD_TO_FILE` is `True`, all pruned messages destined for summarization are asynchronously serialized (via `asyncio.to_thread`) to `data/conversation_history/{thread_id}_archive.md`.
  * Sanitizes `thread_id` using `Path(raw_id).name` and regex character whitelisting `[a-zA-Z0-9_\-]`, validating boundary confinement (`.is_relative_to(CONVERSATION_HISTORY_DIR)`) to strictly prevent directory traversal attacks (Rule 9).
  * Formatted with ISO UTC timestamps and markdown separation blocks for full auditability.
* **Context telemetry.**
  * Implemented via lifecycle hooks `before_model` and `abefore_model`.
  * Evaluates pre-compaction message counts and token estimates (`self.token_counter(messages)`) strictly when summarization triggers, guaranteeing zero execution overhead (< 0.001 ms) for regular conversational turns.
  * Calculates compaction savings percentage: `(1 - post_message_count / pre_message_count) * 100`.
  * Emits structured terminal logs in Uvicorn console output:
    ```
    [CONTEXT TELEMETRY] Thread='session_123'
    Messages: 20 -> 7 | Tokens vor Trigger: ~8.150 | Ersparnis: ~77%
    Archive: data/conversation_history/session_123_archive.md
    ```
  * Enclosed in fault-tolerant `try...except` handling, ensuring telemetry or file resolution issues never interrupt agent conversation turns.

### 5.3 Deterministic field validation engine (`src/core/validators.py`)

A pure Python standard library validation engine providing deterministic business rules without LLM latency or hallucination risks:

* **`ValidationResult` data model.**
  ```python
  @dataclass(frozen=True)
  class ValidationResult:
      is_valid: bool
      cleaned_value: Any | None = None
      error_message: str | None = None
  ```
* **Validation functions:**
  1. `validate_iban(iban: Any) -> ValidationResult`: Implements the ISO 7064 Modulo-97 algorithm. For German IBANs (`DE`), strictly enforces 22 alphanumeric characters with 20 trailing digits.
  2. `validate_date(date_val: Any, is_birthdate: bool = False, min_age: int = 0, max_age: int = 120, reference_date: date | None = None) -> ValidationResult`: Validates calendar validity against Gregorian rules (including leap year edge cases like `29.02.2024`). Normalizes valid dates to `DD.MM.YYYY`. For birth dates, enforces non-future constraints and bounds check on computed age.
  3. `validate_postal_code(plz: Any) -> ValidationResult`: Strictly enforces 5-digit German postal codes (`^[0-9]{5}$`), preserving leading zeroes.
  4. `validate_currency_amount(amount: Any, allow_negative: bool = False) -> ValidationResult`: Strips currency symbols (`€`, `EUR`) and whitespace, correctly normalizes German notation (`1.250,50` -> `1250.50`), and returns rounded floats.
  5. `validate_email(email: Any) -> ValidationResult`: Validates RFC 5322 syntax and normalizes addresses to lowercase.
  6. `validate_form_field(field_name: str, value: Any) -> ValidationResult | None`: Heuristic dispatcher routing field names to the appropriate validator. Safely ignores boolean toggles, widget prefixes (`chk_`, `cb_`, `btn_`, `rbtn_`, `rad_`), German data fields containing `daten` (e.g. `chk_datenschutz`, `stammdaten`, distinguishing them from English `date`), and explicit non-date fields like `geburtsort` (birthplace).

### 5.4 Form validation middleware (`PDFFormValidationMiddleware`)

Inherits from LangChain's native `AgentMiddleware` (`langchain.agents.middleware.AgentMiddleware`) and implements the Intercepting Filter Pattern across `wrap_tool_call` (sync) and `awrap_tool_call` (async):

* **Interception target.** Intercepts invocations where `request.tool_call["name"] == "fill_pdf_form"`. All other tools pass through unaltered.
* **Short-circuiting on validation failure.** If any form field fails validation:
  * The actual PDF writing handler `handler(request)` is **never invoked**, preventing disk I/O, partial corrupt writes, and file mutation.
  * Emits a warning log `[VALIDATION SHORT-CIRCUIT] Field '...' invalid: ...`.
  * Generates a synthetic `ToolMessage` containing a structured JSON response:
    ```json
    {
      "success": false,
      "validation_failed": true,
      "field": "txt_geburtsdatum",
      "error": "Das Datum '31.02.1990' existiert im Kalender nicht.",
      "instruction": "Das Feld 'txt_geburtsdatum' wurde aufgrund eines Validierungsfehlers NICHT ins PDF eingetragen. Bitte erkläre dem Nutzer den Fehler freundlich in natürlicher Sprache und erfrage den korrekten Wert."
    }
    ```
* **Agent recovery.** The LLM receives the error directly as a tool execution result, allowing it to explain the error naturally to the user and request corrected input without crashing or hallucinating successful writes.

### 5.5 Event-driven streaming (`astream_events`)

Provides a unified asynchronous generator streaming tokens, tool calls, reasoning steps, and observability events.

* **Signature:** `astream_events(user_message: str, thread_id: str = "default") -> AsyncIterator[dict[str, Any]]`
* **Invocation:** Calls `self.agent.astream({"messages": [HumanMessage(content=user_message)]}, config={"configurable": {"thread_id": thread_id}}, stream_mode="messages", version="v2")`.
* **Token filtering and telemetry emission.**
  * Automatically filters out internal summarization tokens (`_metadata.get("lc_source") == "summarization"`), isolating client UI chat from background context compression.
  * Emits exactly one discrete observability event per summarization run for browser developer tools:
    `{"event": "telemetry", "data": {"type": "context_compacted", "thread_id": <thread_id>, "timestamp": <iso_utc>}}`.
* **Event protocols:**
  1. **Telemetry Event:** `{"event": "telemetry", "data": {"type": "context_compacted", "thread_id": <thread_id>, "timestamp": <iso_utc>}}` (deduplicated once per summarization pass).
  2. **Tool Invocation:** `{"event": "tool_start", "data": <tool_call_dict>}` (when `AIMessage.tool_calls` is present).
  3. **Model Thought / Reasoning:** `{"event": "thought", "data": <reasoning_string>}` (extracted from `content_blocks` where `type == "reasoning"` or `additional_kwargs["reasoning_content"]`).
  4. **Content Tokens:** `{"event": "token", "data": <text_string>}` (extracted from `content_blocks` where `type == "text"` or `AIMessage.content`).
  5. **Tool Execution Result:** `{"event": "tool_end", "data": {"tool_call_id": <id>, "content": <result_string>}}` (from `ToolMessage`).

---

## 6. FastAPI web application (`src/api/app.py`)

FastAPI application exposing REST and Server-Sent-Events (SSE) endpoints.

### 6.1 Middleware and global configuration

* **Security headers middleware.** Every HTTP response includes headers preventing clickjacking, MIME sniffing, forensic disk caching, and cross-origin referrer leaks:
  * `X-Frame-Options: SAMEORIGIN`
  * `X-Content-Type-Options: nosniff`
  * `Content-Security-Policy: frame-ancestors 'self'`
  * `Referrer-Policy: strict-origin-when-cross-origin`
  * `Cache-Control: no-store, no-cache, must-revalidate, private`
  * `Pragma: no-cache`
* **Ephemeral storage cleanup (`cleanup_ephemeral_sessions`).** Scans `DATA_DIR` and purges session directories older than 60 minutes (`max_age_seconds=3600`) at server startup (via FastAPI `lifespan`) and proactively during document uploads.
* **CORS:** Restricts cross-origin requests strictly to whitelisted origins (`settings.CORS_ORIGINS`), blocking unauthorized drive-by requests from third-party websites while permitting credentials, methods, and headers.
* **Router prefix.** `/api/v1` (`settings.API_V1_STR`).
* **Multi-model agent registry.** `get_agent_instance(model_name: str | None = None, think_enabled: bool = False) -> PDFFormAgent` caches agent instances keyed by `(model_name, think_enabled)` (defaulting to `(settings.MODEL_NAME, False)`), all sharing a single `MemorySaver()` checkpointer to preserve session state across model and reasoning mode switches.

---

### 6.2 Endpoint specifications

#### 1. `GET /health`
* **Summary:** Health check endpoint.
* **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "service": "pdf_form_agent"
  }
  ```

---

#### 2. `GET /api/v1/models`
* **Summary:** Returns available Ollama chat/generation models after filtering out non-generative embedding models.
* **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "current_default": "gemma4:e4b",
    "models": [
      {
        "name": "gemma4:e4b",
        "display_name": "gemma4:e4b",
        "size": 4920755200,
        "parameter_size": "4B",
        "family": "gemma",
        "is_current": true
      }
    ]
  }
  ```

---

#### 3. `GET /api/v1/download/{thread_id}/{filename}`
* **Summary:** Serves processed or uploaded PDF documents.
* **Query Parameters:**
  * `download: bool` (default `False`): If `True`, sets `Content-Disposition: attachment`; otherwise `Content-Disposition: inline`.
* **Security Check:** Validates that target file exists and `is_relative_to(DATA_DIR)`. Returns HTTP 404 (`"Document not found."`) if invalid.
* **Response:** `FileResponse` with `media_type="application/pdf"` and explicit privacy headers (`Cache-Control: no-store, no-cache, must-revalidate, private` and `Pragma: no-cache`).

---

#### 4. `POST /api/v1/upload-document`
* **Summary:** Uploads a PDF form and immediately executes field analysis.
* **Form data:**
  * `file: UploadFile` (Multipart file upload)
  * `thread_id: str` (Session thread identifier)
* **Security and background execution.**
  * Dispatches `cleanup_ephemeral_sessions()` to `BackgroundTasks` to avoid blocking request latency.
  * Rejects files not ending with `.pdf` with HTTP 400 (`"Only PDF files are allowed."`).
  * Enforces maximum upload payload size of 25 MB (`MAX_UPLOAD_SIZE = 25 * 1024 * 1024`), returning HTTP 413 (`"File too large (max. 25 MB)."`) upon violation.
  * Validates PDF magic bytes signature (`content.startswith(b"%PDF-")`), rejecting invalid headers with HTTP 400 (`"Invalid PDF file header (magic bytes mismatch)."`).
  * Executes deep PDF active content inspection (`await asyncio.to_thread(inspect_pdf_security, content)`), rejecting documents containing `/Launch` actions, document-level JavaScript (`/Names/JavaScript`), `/OpenAction` scripts, `/AA` actions, or embedded attachment payloads with HTTP 400 (`"Security violation: Unsafe active content detected in PDF..."`).
* **Processing steps:**
  1. Offloads file disk write to worker thread: `await asyncio.to_thread(_write_upload_file, target_path, content)`.
  2. Offloads synchronous tool execution to worker thread: `await asyncio.to_thread(read_pdf_form.invoke, {"filepath": filename}, config)`.
* **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "message": "Document analyzed successfully.",
    "filename": "form.pdf",
    "thread_id": "session_abc",
    "local_path": "/path/to/data/session_docs/session_abc/form.pdf",
    "fields_summary": {
      "error": false,
      "total_fields": 2,
      "fields": [...]
    }
  }
  ```

---

#### 5. `POST /api/v1/chat`
* **Summary:** SSE streaming chat endpoint for interactive agent interaction.
* **Request body (`ChatRequest`):**
  ```json
  {
    "thread_id": "session_abc",
    "message": "Mein Vorname ist Max",
    "model_name": "llama3.1:8b",
    "think_enabled": false
  }
  ```
* **Response:** `StreamingResponse` (`media_type="text/event-stream"`).
* **Wire protocol:**
  ```text
  data: {"event": "thought", "data": "Validating input..."}\n\n
  data: {"event": "token", "data": "Danke Max! Bitte geben Sie..."}\n\n
  data: [DONE]\n\n
  ```
  * **Error handling.** When the local Ollama daemon is unreachable (detecting `httpx.ConnectError` or `httpx.ConnectTimeout` across exception causes), the stream catches the exception and emits an actionable error payload without server crash or traceback leakage:
    ```text
    data: {"event": "error", "data": "Ollama-Dienst auf Port 11434 nicht erreichbar. Bitte 'ollama serve' starten."}\n\n
    data: [DONE]\n\n
    ```
    Unexpected agent exceptions yield `data: {"event": "error", "data": "Fehler bei der Kommunikation mit dem KI-Modell: <detail>"}\n\ndata: [DONE]\n\n`.

---

#### 6. `GET /api/v1/stt-health`
* **Summary:** Returns live connectivity status of the STT speech-to-text microservice (port 8002) via a non-blocking socket probe (`asyncio.to_thread(_probe_stt_socket)`).
* **Response (200 OK):**
  ```json
  {
    "status": "online",
    "online": true,
    "host": "127.0.0.1",
    "port": 8002
  }
  ```

---

#### 7. `GET /api/v1/tts-health`
* **Summary:** Returns live connectivity status of the TTS text-to-speech microservice (port 8005) via a non-blocking socket probe (`asyncio.to_thread(_probe_tts_socket)`).
* **Response (200 OK):**
  ```json
  {
    "status": "online",
    "online": true,
    "host": "127.0.0.1",
    "port": 8005
  }
  ```

---

#### 8. `GET /api/v1/user-profile`
* **Summary:** Retrieves stored user profile / master data notes from `DATA_DIR / "user_profile.txt"`.
* **Security & Cache Headers:** Enforces strict privacy caching directives: `Cache-Control: no-store, no-cache, must-revalidate, private` and `Pragma: no-cache`.
* **Response (200 OK):**
  ```json
  {
    "exists": true,
    "content": "Name: Erika Mustermann\nIBAN: DE12345678901234567890",
    "updated_at": "2026-10-20T12:00:00+00:00"
  }
  ```

---

#### 9. `POST /api/v1/user-profile`
* **Summary:** Creates or updates user profile / master data notes in atomic fashion using a temporary file replacement.
* **Payload constraints.** Enforces a maximum payload size of 64 KB (`MAX_USER_PROFILE_SIZE = 64 * 1024`). Rejects oversized payloads with HTTP 413 (`"Profile content exceeds maximum allowed size of 64 KB."`).
* **Request body (`UserProfileUpdateRequest`):**
  ```json
  {
    "content": "Name: Erika Mustermann\nStraße: Hauptstr. 1\n..."
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "updated_at": "2026-10-20T12:00:00+00:00"
  }
  ```

---

#### 10. `DELETE /api/v1/user-profile`
* **Summary:** Permanently removes stored user profile notes from `DATA_DIR / "user_profile.txt"`.
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "message": "User profile deleted."
  }
  ```

---

#### 11. `GET /api/v1/forms/{thread_id}/{filename}/fields`
* **Summary:** Retrieves all interactive AcroForm fields, types (`/Tx`, `/Btn`, `/Ch`), options, descriptions (`/TU`), and current values for direct UI inspection (`FormInspector`).
* **Validation and security.** Sanitizes path parameters with `Path(...).name`, verifies `.pdf` extension, resolves session path via `resolve_pdf_path`, returning HTTP 404 if the document does not exist.
* **Concurrency.** Offloads PDF parsing to a background worker thread via `await asyncio.to_thread(read_pdf_form_data, pdf_path)` (Rule 24).
* **Response (200 OK):**
  ```json
  {
    "error": false,
    "total_fields": 4,
    "filled_fields": 2,
    "fields": [
      {
        "name": "Vorname",
        "type": "/Tx",
        "description": "Vorname des Antragstellers",
        "value": "Max"
      },
      {
        "name": "Familienstand",
        "type": "/Ch",
        "description": "Familienstand",
        "value": "Ledig",
        "options": ["Ledig", "Verheiratet", "Geschieden"]
      }
    ]
  }
  ```

---

#### 12. `POST /api/v1/forms/{thread_id}/fill`
* **Summary:** Directly writes field values into the PDF form without LLM inference, updating both disk and session metrics synchronously for hybrid form-filling (`FormInspector`).
* **Request body (`FormFillRequest`):**
  ```json
  {
    "filename": "formular.pdf",
    "field_values": {
      "Vorname": "Max",
      "Familienstand": "Ledig"
    }
  }
  ```
* **Processing steps:** Offloads field normalization, ISO 14289-1 PDF/UA accessibility updates, read-only flattening, and disk writes to a background worker thread via `await asyncio.to_thread(write_pdf_form, ...)` (Rule 24).
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "message": "PDF erfolgreich ausgefüllt: formular.pdf",
    "output_file": "formular.pdf",
    "total_fields": 4,
    "filled_fields": 3,
    "active_page": 1,
    "written_values": {
      "Vorname": "Max",
      "Familienstand": "Ledig"
    }
  }
  ```

---

## 7. Interactive terminal CLI (`src/cli.py`)

A direct terminal-based workflow for local testing and demonstration without a browser.

* **Usage:** `python -m src.cli <path_to_pdf> [--thread-id <id>]`
* **Workflow:**
  1. Copies specified PDF into session folder `DATA_DIR / thread_id / <filename>`.
  2. Runs `read_pdf_form` and prints the initial field discovery summary.
  3. Sends initial greeting prompt to `PDFFormAgent.astream_events`.
  4. Runs a standard interactive REPL loop reading `input()` and streaming token/thought events to stdout until `exit` or `quit`.

---

## 8. Server entry point (`src/main.py`)

Starts the production Uvicorn ASGI server:

```python
import uvicorn

if __name__ == "__main__":
    uvicorn.run("src.api.app:app", host="0.0.0.0", port=8001, reload=True)
```

---

## 9. Test suite contract and verification

All implementations must satisfy the full automated test suite (**141/141 passing tests across 14 test files**):

1. **`tests/test_prompts.py` (10 tests):**
   * Verifies YAML prompt loading, core directive presence, named loading, missing file fallback, prompt injection defense directive, tool mandate directive, cognitive step guidance directive, turn-1 user profile autofill directive, summarization prompt loading, and backwards-compatible re-export in `src.core.tools`.
2. **`tests/test_agent.py` (15 tests):**
   * Default & custom `PDFFormAgent` instantiation with YAML prompt and middleware configuration.
   * Disabled summarization middleware initialization (`enable_summarization=False`).
   * Streaming branches: `tool_start`, `thought`, `token`, `tool_end`, summarization token filtering (`lc_source == "summarization"`), and non-message chunk filters.
   * `thread_id` configuration propagation to LangGraph runtime.
   * Structured telemetry logging on `abefore_model` and `before_model` when summarization threshold is triggered.
   * Telemetry skipping when context threshold is not reached (zero execution overhead).
   * Telemetry error resilience ensuring conversational turns never abort on logging issues (STOP 2).
   * Discrete telemetry SSE event emission (`context_compacted`) in `astream_events`.
3. **`tests/test_api.py` (26 tests):**
   * Health check, agent singleton caching by `(model_name, think_enabled)`.
   * Document download (`inline` vs `attachment`, 404 handling, fallback between `SESSIONS_DIR` and `DATA_DIR`).
   * Complete round-trip flow: upload document, fill AcroForm via `fill_pdf_form`, and download filled PDF (`test_upload_fill_and_download_flow`).
   * Security headers (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'self'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cache-Control: no-store, private`, `Pragma: no-cache`).
   * PDF upload validation (valid PDF, non-PDF extension rejection, upload size limit HTTP 413, magic bytes `%PDF-` validation, raw JSON fallback).
   * Active content threat defense (rejects `/Launch` actions and document-level scripts with HTTP 400).
   * Ephemeral storage TTL cleanup (`cleanup_ephemeral_sessions`).
   * STT microservice health check (`test_stt_health_endpoint`).
   * TTS microservice health check (`test_tts_health_endpoint`).
   * CORS origin whitelisting (`test_cors_origins_whitelisting`).
   * Privacy cache control headers on downloads (`test_download_document_cache_control_headers`).
   * SSE `/chat` stream framing and `[DONE]` termination.
   * SSE `/chat` Ollama connectivity error handling (`test_chat_stream_ollama_connect_error`).
   * SSE `/chat` generic model exception handling (`test_chat_stream_generic_error`).
   * Root SPA frontend mounting (`test_root_spa_mount`).
   * Model discovery and embedding filtering (`test_list_models_success`).
   * Fallback model listing when Ollama is offline (`test_list_models_fallback_when_offline`).
   * Custom `model_name` routing in `/chat` requests (`test_chat_stream_with_custom_model_propagation`).
   * Thinking mode flag routing in `/chat` requests (`test_chat_stream_with_thinking_mode_propagation`).
4. **`tests/test_cli.py` (5 tests):**
   * File not found error exits (`sys.exit(1)`).
   * PDF copy to session directory and initial greeting streaming.
   * Multi-turn REPL conversation loop and exit commands (`quit`/`exit`).
   * Graceful `KeyboardInterrupt` exit.
   * CLI argument parsing (`pdf`, `--thread-id`).
5. **`tests/test_pdf_form_agent.py` (20 tests):**
   * Path traversal attack prevention (`_resolve_pdf_path`).
   * PDF active content & threat inspection (`test_inspect_pdf_security_threat_detection`).
   * AcroForm field & text extraction (`read_pdf_form`, `read_pdf_text_for_form`).
   * ReadOnly bit flattening (`/Ff | 1`) verification across widgets.
   * Checkbox `/Btn` on-key discovery and boolean/string normalization (`test_fill_checkbox_and_bank_details`).
   * Choice `/Ch` dropdown option extraction (`/Opt`), 1-based index resolution, and case-insensitive matching (`test_read_and_fill_choice_dropdown_fields`).
   * Separation of visible page Infobox explanation text (`read_pdf_text_for_form`) and short field tooltips (`read_pdf_form`) (`test_vermoegen_infobox_text_and_field_separation`).
   * Sequential incremental filling without data loss across multiple steps (`test_incremental_sequential_form_filling`).
   * Checkbox free-text affirmative and falsy string normalization (`test_checkbox_freetext_and_falsy_normalization`).
   * Hierarchical radio button group discovery, appearance state mapping, and child widget `/AS` state resolution (`test_hierarchical_radio_group_resolution`).
   * Pure choice, radio, and checkbox test form generation, discovery and filling (`test_create_test_form_2_pure_choice_and_checkboxes`).
   * Compact 8-field all-in-one test form generation, discovery and multi-field filling (`test_create_test_form_3_compact_all_cases`).
   * Unicode umlaut cleaning and unescaping (`test_unicode_umlauts_and_escape_sequence_cleaning`).
   * Local ChatOllama model instantiation and parameter verification (`create_chat_model`).
   * Streaming events with reasoning content blocks (`test_astream_events_reasoning`).
   * FastAPI upload, download, and health endpoints (`test_fastapi_endpoints`).
   * Summarization prompt loading, structure, and missing file fallback (`test_summarization_prompt_loading_and_fallback`).
   * Pruned message file offloading to disk with path traversal defense (`test_summarization_middleware_file_offload`).
   * Multi-turn end-to-end conversation compression, message pruning, state checkpointer verification, and stream filtering (`test_agent_summarization_end_to_end`).
6. **`tests/test_validation_middleware.py` (10 tests):**
   * Pre-execution interception of invalid dates, passing valid dates.
   * Pre-execution interception of invalid IBAN checksums, passing valid IBANs.
   * Pre-execution interception of malformed postal codes (< 5 digits).
   * Pre-execution interception of negative income/salary amounts and parsing European currencies (synchronous and asynchronous).
   * Transparent passthrough of unvalidated arbitrary text fields.
   * Strict Zero Dirty Writes guarantee (tool execution short-circuits without disk touch).
7. **`tests/test_validators.py` (27 tests):**
   * Deterministic ISO 7064 Modulo-97 IBAN checksum calculations and formatting.
   * Calendar date validation (Gregorian calendar bounds, leap years, min/max age rules).
   * Date boundary matching with English `date` and German `daten` exclusion (FIX-2026-10-23-01).
   * Checkbox/radio widget prefix bypass and toggle validation passthrough.
   * German 5-digit postal code format and leading-zero preservation (`01067`).
   * European currency and amount parsing (standardizing thousand separators and decimal commas).
8. **`tests/test_pdf_ua_accessibility.py` (3 tests):**
   * Verifies `/StructTreeRoot`, `/MarkInfo` (`/Marked = True`), and `/Lang` preservation on tagged forms, enforcing `/Tabs /S` (Structure Order) across all pages (ISO 14289-1 § 7.18.1).
   * Enforces `/Tabs /R` (Row Order) across all pages on untagged forms and defaults catalog `/Lang` to `de-DE`.
   * Verifies that `/TU` (tooltips) and `/T` (field names) remain intact after form filling and read-only bit flattening.
9. **`tests/test_user_profile.py` (5 tests):**
   * Verifies `GET /api/v1/user-profile` empty response when no profile exists.
   * Verifies `POST` and `GET` roundtrip for creating/updating user profile with ISO timestamp verification.
   * Verifies `DELETE` profile removal and idempotent re-deletion.
   * Verifies strict 64 KB upload payload enforcement with HTTP 413.
   * Verifies `get_user_profile` tool registration in `AVAILABLE_PDF_FORM_TOOLS` and disk read behavior.
10. **`tests/test_pdf_security.py` (7 tests):**
    * Verifies clean PDF byte and path inspection returning zero threats.
    * Verifies malformed and unparseable byte streams detection.
    * Verifies document-level JavaScript `/Names/JavaScript` detection.
    * Verifies unsafe `/OpenAction` with `/Launch` and `/JavaScript` detection.
    * Verifies document-level Additional Actions `/AA` detection.
    * Verifies page-level annotation action `/A` (`/Launch`) detection.
11. **`tests/test_pdf_extractor.py` (5 tests):**
    * Verifies unicode escape decoding (`_clean_unicode_escapes`).
    * Verifies choice option parsing from `/Opt` arrays (`extract_choice_options`).
    * Verifies path resolution prioritizing session directories and preventing path traversal (`resolve_pdf_path`).
    * Verifies AcroForm data reading, counting total and filled fields (`read_pdf_form_data`).
    * Verifies page text extraction formatting (`extract_pdf_page_text`).
12. **`tests/test_pdf_normalizer.py` (4 tests):**
    * Verifies falsy checkbox string definitions.
    * Verifies standalone checkbox truthy/falsy normalization against active on-keys.
    * Verifies hierarchical radio group state resolution, direct state matching, and boolean translation.
    * Verifies dropdown choice normalization, 1-based index resolution, and case-insensitive matching.
13. **`tests/test_pdf_writer.py` (3 tests):**
    * Verifies input existence and field_values type validation in `write_pdf_form`.
    * Verifies successful form filling, PDF/UA `/Lang: de-DE` and `/Tabs /R` injection, ReadOnly bit 1 flattening, and active page detection.
    * Verifies that unselected radio buttons and unchecked checkboxes (`/Off`) are not falsely counted as filled in execution metrics.
14. **`tests/test_user_profile_core.py` (4 tests):**
    * Verifies user profile path resolution (`get_user_profile_path`).
    * Verifies missing and empty user profile informative messages (`read_user_profile`).
    * Verifies atomic user profile saving and reading (`save_user_profile`).
    * Verifies user profile deletion and idempotent behavior (`delete_user_profile`).



