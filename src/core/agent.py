import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware, SummarizationMiddleware
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage, get_buffer_string
from langgraph.checkpoint.memory import MemorySaver
from langgraph.config import get_config

from src.config import CONVERSATION_HISTORY_DIR, settings
from src.core.model_factory import create_chat_model
from src.core.tools import AVAILABLE_PDF_FORM_TOOLS
from src.core.validators import validate_form_field
from src.prompts import PDF_FORM_PROMPT, SUMMARIZATION_PROMPT

logger = logging.getLogger(__name__)


class PDFFormSummarizationMiddleware(SummarizationMiddleware):
    """
    Specialized summarization middleware for PDF form workflows.
    Compresses older messages using a structured form-filling context prompt
    and optionally offloads pruned message history to markdown files on disk.
    """

    def __init__(
        self,
        model: Any,
        trigger: Any | None = None,
        keep: Any | None = None,
        summary_prompt: str | None = None,
        trim_tokens_to_summarize: int | None = None,
        offload_to_file: bool | None = None,
        history_dir: Path | None = None,
    ):
        trigger = trigger or [
            ("tokens", settings.SUMMARIZATION_TRIGGER_TOKENS),
            ("messages", settings.SUMMARIZATION_TRIGGER_MESSAGES),
        ]
        keep = keep or ("messages", settings.SUMMARIZATION_KEEP_MESSAGES)
        summary_prompt = summary_prompt or SUMMARIZATION_PROMPT
        trim_tokens = (
            trim_tokens_to_summarize
            if trim_tokens_to_summarize is not None
            else settings.SUMMARIZATION_TRIM_TOKENS
        )
        super().__init__(
            model=model,
            trigger=trigger,
            keep=keep,
            summary_prompt=summary_prompt,
            trim_tokens_to_summarize=trim_tokens,
        )
        self.offload_to_file = (
            offload_to_file
            if offload_to_file is not None
            else settings.SUMMARIZATION_OFFLOAD_TO_FILE
        )
        self.history_dir = history_dir or CONVERSATION_HISTORY_DIR

    def _get_current_thread_id(self) -> str:
        try:
            cfg = get_config()
            thread_id = cfg.get("configurable", {}).get("thread_id", "default")
            if not thread_id:
                thread_id = "default"
            return str(thread_id)
        except Exception:
            return "default"

    def _get_archive_file(self, raw_thread_id: str) -> Path:
        # Sanitize filename (Rule 9 & Rule 21 - path traversal defense)
        safe_name = Path(raw_thread_id).name
        safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", safe_name) or "default"
        target_file = (self.history_dir / f"{safe_name}_archive.md").resolve()

        # Security boundary verification (Rule 9)
        if not target_file.is_relative_to(self.history_dir.resolve()):
            logger.warning(
                "Path traversal attempt detected in thread_id '%s'. Falling back to 'default_archive.md'",
                raw_thread_id,
            )
            target_file = (self.history_dir / "default_archive.md").resolve()
        return target_file

    def _offload_messages_to_file(self, messages_to_summarize: list[Any]) -> None:
        if not self.offload_to_file or not messages_to_summarize:
            return
        try:
            raw_thread_id = self._get_current_thread_id()
            target_file = self._get_archive_file(raw_thread_id)

            self.history_dir.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now(UTC).isoformat()
            buffer_str = get_buffer_string(messages_to_summarize)

            entry = (
                f"## Archived Messages - {timestamp}\n\n"
                f"{buffer_str}\n\n"
                f"---\n\n"
            )
            with open(target_file, "a", encoding="utf-8") as f:
                f.write(entry)
            logger.info(
                "Offloaded %d pruned messages to %s",
                len(messages_to_summarize),
                target_file,
            )
        except Exception as e:
            logger.error("Failed to offload messages to archive file: %s", e)

    def _log_telemetry(
        self,
        raw_thread_id: str,
        pre_message_count: int,
        pre_token_count: int,
        result: dict[str, Any],
    ) -> None:
        try:
            result_messages = (
                result.get("messages", []) if isinstance(result, dict) else []
            )
            # result["messages"] contains [RemoveMessage, *new_messages, *preserved_messages]
            post_message_count = max(0, len(result_messages) - 1)
            savings_pct = (
                (1.0 - (post_message_count / pre_message_count)) * 100.0
                if pre_message_count > 0
                else 0.0
            )
            archive_path = self._get_archive_file(raw_thread_id)
            try:
                rel_archive = archive_path.relative_to(Path.cwd()).as_posix()
            except Exception:
                rel_archive = archive_path.as_posix()

            logger.info(
                "[CONTEXT TELEMETRY] Thread='%s'\nMessages: %d -> %d | Tokens vor Trigger: ~%s | Ersparnis: ~%.0f%%\nArchive: %s",
                raw_thread_id,
                pre_message_count,
                post_message_count,
                f"{pre_token_count:,}".replace(",", "."),
                savings_pct,
                rel_archive,
            )
        except Exception as e:
            logger.error("Failed to compute or log summarization telemetry: %s", e)

    def before_model(self, state: Any, runtime: Any) -> dict[str, Any] | None:
        raw_thread_id = self._get_current_thread_id()
        messages = (
            state.get("messages", [])
            if isinstance(state, dict)
            else getattr(state, "messages", [])
        )
        pre_message_count = len(messages)

        result = super().before_model(state, runtime)

        if result is not None:
            try:
                pre_token_count = self.token_counter(messages) if messages else 0
                self._log_telemetry(raw_thread_id, pre_message_count, pre_token_count, result)
            except Exception as e:
                logger.error("Failed to compute or log summarization telemetry: %s", e)
        return result

    async def abefore_model(self, state: Any, runtime: Any) -> dict[str, Any] | None:
        raw_thread_id = self._get_current_thread_id()
        messages = (
            state.get("messages", [])
            if isinstance(state, dict)
            else getattr(state, "messages", [])
        )
        pre_message_count = len(messages)

        result = await super().abefore_model(state, runtime)

        if result is not None:
            try:
                pre_token_count = self.token_counter(messages) if messages else 0
                self._log_telemetry(raw_thread_id, pre_message_count, pre_token_count, result)
            except Exception as e:
                logger.error("Failed to compute or log summarization telemetry: %s", e)
        return result

    def _create_summary(self, messages_to_summarize: list[Any]) -> str:
        self._offload_messages_to_file(messages_to_summarize)
        return super()._create_summary(messages_to_summarize)

    async def _acreate_summary(self, messages_to_summarize: list[Any]) -> str:
        if self.offload_to_file:
            await asyncio.to_thread(self._offload_messages_to_file, messages_to_summarize)
        return await super()._acreate_summary(messages_to_summarize)


class PDFFormValidationMiddleware(AgentMiddleware):
    """
    Enterprise interceptor for form-filling tool calls.
    Validates field values using deterministic business logic (validators.py)
    and short-circuits execution before corrupt or invalid data hits the PDF.
    """

    def _validate_tool_args(
        self, tool_args: dict[str, Any]
    ) -> tuple[bool, str | None, str | None]:
        """
        Extracts fields from tool args and runs validation.
        Returns: (is_valid, invalid_field_name, error_message)
        """
        fields = (
            tool_args.get("field_values")
            or tool_args.get("form_data")
            or tool_args.get("fields")
            or {}
        )
        if not isinstance(fields, dict):
            f_name = tool_args.get("field_name")
            f_val = tool_args.get("field_value")
            if f_name and f_val is not None:
                fields = {str(f_name): f_val}
            else:
                fields = {}

        for field_name, value in fields.items():
            result = validate_form_field(str(field_name), value)
            if result and not result.is_valid:
                return False, str(field_name), result.error_message

        return True, None, None

    def _create_validation_error_message(
        self, request: Any, field_name: str, error_message: str
    ) -> ToolMessage:
        payload = {
            "success": False,
            "validation_failed": True,
            "field": field_name,
            "error": error_message,
            "instruction": (
                f"Das Feld '{field_name}' wurde aufgrund eines Validierungsfehlers NICHT ins PDF eingetragen. "
                "Bitte erkläre dem Nutzer den Fehler freundlich in natürlicher Sprache und erfrage den korrekten Wert."
            ),
        }
        tool_call = getattr(request, "tool_call", None)
        if tool_call is None and isinstance(request, dict):
            tool_call = request.get("tool_call", {})
        tool_call_id = tool_call.get("id", "") if isinstance(tool_call, dict) else ""
        tool_name = (
            tool_call.get("name", "fill_pdf_form") if isinstance(tool_call, dict) else "fill_pdf_form"
        )

        return ToolMessage(
            content=json.dumps(payload, ensure_ascii=False),
            tool_call_id=tool_call_id,
            name=tool_name,
        )

    def wrap_tool_call(
        self,
        request: Any,
        handler: Any,
    ) -> Any:
        tool_call = getattr(request, "tool_call", None)
        if tool_call is None and isinstance(request, dict):
            tool_call = request.get("tool_call", {})
        tool_name = tool_call.get("name") if isinstance(tool_call, dict) else None

        if tool_name != "fill_pdf_form":
            return handler(request)

        args = tool_call.get("args", {}) if isinstance(tool_call, dict) else {}
        is_valid, field_name, err = self._validate_tool_args(args)
        if not is_valid:
            logger.warning("[VALIDATION SHORT-CIRCUIT] Field '%s' invalid: %s", field_name, err)
            return self._create_validation_error_message(request, field_name or "", err or "")

        return handler(request)

    async def awrap_tool_call(
        self,
        request: Any,
        handler: Any,
    ) -> Any:
        tool_call = getattr(request, "tool_call", None)
        if tool_call is None and isinstance(request, dict):
            tool_call = request.get("tool_call", {})
        tool_name = tool_call.get("name") if isinstance(tool_call, dict) else None

        if tool_name != "fill_pdf_form":
            return await handler(request)

        args = tool_call.get("args", {}) if isinstance(tool_call, dict) else {}
        is_valid, field_name, err = self._validate_tool_args(args)
        if not is_valid:
            logger.warning("[VALIDATION SHORT-CIRCUIT] Field '%s' invalid: %s", field_name, err)
            return self._create_validation_error_message(request, field_name or "", err or "")

        return await handler(request)


class PDFFormAgent:
    """
    Autonomous ReAct agent for interactive PDF form processing and completion.
    Faithful to agent_service.py ReAct supervisor pattern.
    """

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
        self.llm = llm or create_chat_model(
            model_name=self.model_name,
            temperature=temperature,
            think_enabled=think_enabled,
        )

        # Middleware configuration
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

    async def astream_events(
        self,
        user_message: str,
        thread_id: str = "default",
    ) -> AsyncIterator[dict[str, Any]]:
        """
        Streams execution events (tokens, thoughts, tool calls, tool results) matching chat.py conventions.
        """
        config = {"configurable": {"thread_id": thread_id}}
        inputs = {"messages": [HumanMessage(content=user_message)]}

        summarization_telemetry_emitted = False

        async for chunk in self.agent.astream(
            inputs, config=config, stream_mode="messages", version="v2"
        ):
            if chunk.get("type") == "messages":
                token, _metadata = chunk.get("data", (None, {}))
                if token is None:
                    continue

                # Filter out internal summarization tokens and emit discrete telemetry event once
                if _metadata.get("lc_source") == "summarization":
                    if not summarization_telemetry_emitted:
                        summarization_telemetry_emitted = True
                        yield {
                            "event": "telemetry",
                            "data": {
                                "type": "context_compacted",
                                "thread_id": thread_id,
                                "timestamp": datetime.now(UTC).isoformat(),
                            },
                        }
                    continue

                if isinstance(token, AIMessage):
                    if hasattr(token, "tool_calls") and token.tool_calls:
                        for tc in token.tool_calls:
                            yield {"event": "tool_start", "data": tc}
                    elif hasattr(token, "content_blocks") and token.content_blocks:
                        for block in token.content_blocks:
                            if block.get("type") == "reasoning":
                                yield {
                                    "event": "thought",
                                    "data": block.get("reasoning", ""),
                                }
                            elif block.get("type") == "text":
                                yield {"event": "token", "data": block.get("text", "")}
                    elif (
                        token.additional_kwargs
                        and "reasoning_content" in token.additional_kwargs
                    ):
                        reasoning = token.additional_kwargs.get("reasoning_content")
                        if reasoning:
                            yield {"event": "thought", "data": reasoning}
                        if token.content:
                            yield {"event": "token", "data": token.content}
                    elif token.content:
                        yield {"event": "token", "data": token.content}

                elif isinstance(token, ToolMessage):
                    yield {
                        "event": "tool_end",
                        "data": {
                            "tool_call_id": token.tool_call_id,
                            "content": token.content,
                        },
                    }
