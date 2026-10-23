import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver

from src.config import settings
from src.core.agent import (
    PDFFormAgent,
    PDFFormSummarizationMiddleware,
    PDFFormValidationMiddleware,
)
from src.core.tools import AVAILABLE_PDF_FORM_TOOLS
from src.prompts import PDF_FORM_PROMPT


def test_agent_initialization_defaults():
    """Verify PDFFormAgent initializes correctly with default configuration."""
    with (
        patch("src.core.agent.create_chat_model") as mock_create_model,
        patch("src.core.agent.create_agent") as mock_create_agent,
    ):
        mock_llm = MagicMock()
        mock_create_model.return_value = mock_llm
        mock_agent_instance = MagicMock()
        mock_create_agent.return_value = mock_agent_instance

        agent = PDFFormAgent()

        assert agent.model_name == settings.MODEL_NAME
        assert agent.system_prompt == PDF_FORM_PROMPT
        assert agent.tools == AVAILABLE_PDF_FORM_TOOLS
        assert isinstance(agent.memory, MemorySaver)
        assert agent.llm == mock_llm
        assert agent.agent == mock_agent_instance
        assert agent.enable_summarization is True
        assert len(agent.middleware) == 2
        assert isinstance(agent.middleware[0], PDFFormValidationMiddleware)
        assert isinstance(agent.middleware[1], PDFFormSummarizationMiddleware)

        mock_create_model.assert_called_once_with(
            model_name=settings.MODEL_NAME,
            temperature=0.0,
            think_enabled=False,
        )
        mock_create_agent.assert_called_once_with(
            model=mock_llm,
            system_prompt=PDF_FORM_PROMPT,
            checkpointer=agent.memory,
            tools=AVAILABLE_PDF_FORM_TOOLS,
            middleware=agent.middleware,
            name="supervisor",
        )


def test_agent_initialization_custom_params():
    """Verify PDFFormAgent handles custom configuration and dependencies."""
    custom_model = "custom-ollama:latest"
    custom_prompt = "Custom system prompt for testing."
    custom_tools = [MagicMock(name="custom_tool")]
    custom_checkpointer = MagicMock(name="custom_checkpointer")
    custom_middleware = [MagicMock(name="custom_middleware")]

    with (
        patch("src.core.agent.create_chat_model") as mock_create_model,
        patch("src.core.agent.create_agent") as mock_create_agent,
    ):
        mock_llm = MagicMock()
        mock_create_model.return_value = mock_llm
        mock_agent_instance = MagicMock()
        mock_create_agent.return_value = mock_agent_instance

        agent = PDFFormAgent(
            model_name=custom_model,
            system_prompt=custom_prompt,
            custom_tools=custom_tools,
            temperature=0.7,
            think_enabled=True,
            checkpointer=custom_checkpointer,
            custom_middleware=custom_middleware,
        )

        assert agent.model_name == custom_model
        assert agent.system_prompt == custom_prompt
        assert agent.tools == custom_tools
        assert agent.memory == custom_checkpointer
        assert agent.llm == mock_llm
        assert agent.agent == mock_agent_instance
        assert agent.middleware == custom_middleware
        assert agent.enable_summarization is True

        mock_create_model.assert_called_once_with(
            model_name=custom_model,
            temperature=0.7,
            think_enabled=True,
        )
        mock_create_agent.assert_called_once_with(
            model=mock_llm,
            system_prompt=custom_prompt,
            checkpointer=custom_checkpointer,
            tools=custom_tools,
            middleware=custom_middleware,
            name="supervisor",
        )


def test_agent_initialization_summarization_disabled():
    """Verify PDFFormAgent handles disabled summarization middleware."""
    with (
        patch("src.core.agent.create_chat_model") as mock_create_model,
        patch("src.core.agent.create_agent") as mock_create_agent,
    ):
        mock_llm = MagicMock()
        mock_create_model.return_value = mock_llm
        mock_agent_instance = MagicMock()
        mock_create_agent.return_value = mock_agent_instance

        agent = PDFFormAgent(enable_summarization=False)

        assert agent.enable_summarization is False
        assert len(agent.middleware) == 1
        assert isinstance(agent.middleware[0], PDFFormValidationMiddleware)
        mock_create_agent.assert_called_once_with(
            model=mock_llm,
            system_prompt=PDF_FORM_PROMPT,
            checkpointer=agent.memory,
            tools=AVAILABLE_PDF_FORM_TOOLS,
            middleware=agent.middleware,
            name="supervisor",
        )


@pytest.mark.asyncio
async def test_astream_events_tool_calls():
    """Verify tool_start events are yielded when AIMessage contains tool calls."""
    with (
        patch("src.core.agent.create_chat_model"),
        patch("src.core.agent.create_agent"),
    ):
        agent = PDFFormAgent()

    tool_call_data = {
        "name": "read_pdf_form",
        "args": {"filepath": "sample.pdf"},
        "id": "call_123",
    }
    ai_msg = AIMessage(content="", tool_calls=[tool_call_data])

    async def mock_astream(*args, **kwargs):
        yield {"type": "messages", "data": (ai_msg, {})}

    agent.agent.astream = mock_astream

    events = [event async for event in agent.astream_events("Fill this form")]
    assert len(events) == 1
    assert events[0]["event"] == "tool_start"
    assert events[0]["data"]["name"] == "read_pdf_form"
    assert events[0]["data"]["args"] == {"filepath": "sample.pdf"}
    assert events[0]["data"]["id"] == "call_123"


@pytest.mark.asyncio
async def test_astream_events_content_blocks_reasoning_and_text():
    """Verify thought and token events are yielded for structured content_blocks."""
    with (
        patch("src.core.agent.create_chat_model"),
        patch("src.core.agent.create_agent"),
    ):
        agent = PDFFormAgent()

    ai_msg = AIMessage(
        content="",
        content_blocks=[
            {"type": "reasoning", "reasoning": "Inspecting fields..."},
            {"type": "text", "text": "Please provide your first name."},
        ],
    )

    async def mock_astream(*args, **kwargs):
        yield {"type": "messages", "data": (ai_msg, {})}

    agent.agent.astream = mock_astream

    events = [event async for event in agent.astream_events("Hello")]
    assert len(events) == 2
    assert events[0] == {"event": "thought", "data": "Inspecting fields..."}
    assert events[1] == {"event": "token", "data": "Please provide your first name."}


@pytest.mark.asyncio
async def test_astream_events_additional_kwargs_reasoning():
    """Verify thought events are yielded from additional_kwargs['reasoning_content']."""
    with (
        patch("src.core.agent.create_chat_model"),
        patch("src.core.agent.create_agent"),
    ):
        agent = PDFFormAgent()

    ai_msg = AIMessage(
        content="Final answer text.",
        additional_kwargs={"reasoning_content": "Chain-of-thought steps."},
    )

    async def mock_astream(*args, **kwargs):
        yield {"type": "messages", "data": (ai_msg, {})}

    agent.agent.astream = mock_astream

    events = [event async for event in agent.astream_events("What is next?")]
    assert len(events) == 2
    assert events[0] == {"event": "thought", "data": "Chain-of-thought steps."}
    assert events[1] == {"event": "token", "data": "Final answer text."}


@pytest.mark.asyncio
async def test_astream_events_plain_token():
    """Verify standard text tokens are yielded for regular AIMessage content."""
    with (
        patch("src.core.agent.create_chat_model"),
        patch("src.core.agent.create_agent"),
    ):
        agent = PDFFormAgent()

    ai_msg = AIMessage(content="Hello, how can I help you with your PDF?")

    async def mock_astream(*args, **kwargs):
        yield {"type": "messages", "data": (ai_msg, {})}

    agent.agent.astream = mock_astream

    events = [event async for event in agent.astream_events("Hi")]
    assert len(events) == 1
    assert events[0] == {
        "event": "token",
        "data": "Hello, how can I help you with your PDF?",
    }


@pytest.mark.asyncio
async def test_astream_events_tool_end():
    """Verify tool_end events are yielded when a ToolMessage is received."""
    with (
        patch("src.core.agent.create_chat_model"),
        patch("src.core.agent.create_agent"),
    ):
        agent = PDFFormAgent()

    tool_msg = ToolMessage(
        content='{"status": "success", "filled_fields": 2}',
        tool_call_id="call_123",
    )

    async def mock_astream(*args, **kwargs):
        yield {"type": "messages", "data": (tool_msg, {})}

    agent.agent.astream = mock_astream

    events = [event async for event in agent.astream_events("Done")]
    assert len(events) == 1
    assert events[0] == {
        "event": "tool_end",
        "data": {
            "tool_call_id": "call_123",
            "content": '{"status": "success", "filled_fields": 2}',
        },
    }


@pytest.mark.asyncio
async def test_astream_events_filters_non_messages_and_none():
    """Verify non-messages chunks and None tokens are skipped gracefully."""
    with (
        patch("src.core.agent.create_chat_model"),
        patch("src.core.agent.create_agent"),
    ):
        agent = PDFFormAgent()

    valid_msg = AIMessage(content="Valid output")

    async def mock_astream(*args, **kwargs):
        yield {"type": "custom_event", "data": "ignored"}
        yield {"type": "messages", "data": (None, {})}
        yield {"type": "messages", "data": (valid_msg, {})}

    agent.agent.astream = mock_astream

    events = [event async for event in agent.astream_events("Test filter")]
    assert len(events) == 1
    assert events[0] == {"event": "token", "data": "Valid output"}


@pytest.mark.asyncio
async def test_astream_events_thread_id_and_input_propagation():
    """Verify thread_id and user message are correctly passed to agent.astream."""
    with (
        patch("src.core.agent.create_chat_model"),
        patch("src.core.agent.create_agent"),
    ):
        agent = PDFFormAgent()

    captured_inputs = None
    captured_config = None
    captured_kwargs = None

    async def mock_astream(inputs, config=None, **kwargs):
        nonlocal captured_inputs, captured_config, captured_kwargs
        captured_inputs = inputs
        captured_config = config
        captured_kwargs = kwargs
        yield {"type": "messages", "data": (AIMessage(content="OK"), {})}

    agent.agent.astream = mock_astream

    _ = [
        event
        async for event in agent.astream_events(
            user_message="Hello thread", thread_id="thread_session_777"
        )
    ]

    assert captured_config == {"configurable": {"thread_id": "thread_session_777"}}
    assert len(captured_inputs["messages"]) == 1
    msg = captured_inputs["messages"][0]
    assert isinstance(msg, HumanMessage)
    assert msg.content == "Hello thread"
    assert captured_kwargs.get("stream_mode") == "messages"
    assert captured_kwargs.get("version") == "v2"


@pytest.mark.asyncio
async def test_astream_events_filters_summarization_tokens():
    """Verify chunks with lc_source == summarization emit discrete telemetry event and filter raw tokens."""
    with (
        patch("src.core.agent.create_chat_model"),
        patch("src.core.agent.create_agent"),
    ):
        agent = PDFFormAgent()

    summarization_chunk1 = AIMessage(content="Internal ")
    summarization_chunk2 = AIMessage(content="summarization chunk")
    user_facing_msg = AIMessage(content="Final assistant response")

    async def mock_astream(*args, **kwargs):
        yield {"type": "messages", "data": (summarization_chunk1, {"lc_source": "summarization"})}
        yield {"type": "messages", "data": (summarization_chunk2, {"lc_source": "summarization"})}
        yield {"type": "messages", "data": (user_facing_msg, {})}

    agent.agent.astream = mock_astream

    events = [
        event
        async for event in agent.astream_events(
            "Summarize test", thread_id="session_test_99"
        )
    ]

    # Exactly 2 events: 1 discrete telemetry event (deduplicated!) + 1 user token event
    assert len(events) == 2
    assert events[0]["event"] == "telemetry"
    assert events[0]["data"]["type"] == "context_compacted"
    assert events[0]["data"]["thread_id"] == "session_test_99"
    assert "timestamp" in events[0]["data"]

    assert events[1]["event"] == "token"
    assert events[1]["data"] == "Final assistant response"


@pytest.mark.asyncio
async def test_summarization_middleware_telemetry_logging_abefore_model(tmp_path, caplog):
    """Verify abefore_model logs structured telemetry when summarization triggers."""
    import logging

    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    from src.core.agent import PDFFormSummarizationMiddleware

    history_dir = tmp_path / "telemetry_hist"
    model = FakeListChatModel(responses=["Summary content"])
    middleware = PDFFormSummarizationMiddleware(
        model=model,
        trigger=[("messages", 2)],
        keep=("messages", 1),
        offload_to_file=True,
        history_dir=history_dir,
    )

    state = {
        "messages": [
            HumanMessage(content="Hello 1"),
            AIMessage(content="Hi 1"),
            HumanMessage(content="Hello 2"),
        ]
    }

    with caplog.at_level(logging.INFO):
        result = await middleware.abefore_model(state, runtime=None)

    assert result is not None
    assert "[CONTEXT TELEMETRY]" in caplog.text
    assert "Thread='default'" in caplog.text
    assert "Messages: 3 ->" in caplog.text
    assert "Tokens vor Trigger:" in caplog.text
    assert "Ersparnis:" in caplog.text
    assert "Archive:" in caplog.text


def test_summarization_middleware_telemetry_logging_before_model(tmp_path, caplog):
    """Verify synchronous before_model logs structured telemetry when summarization triggers."""
    import logging

    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    from src.core.agent import PDFFormSummarizationMiddleware

    history_dir = tmp_path / "telemetry_hist_sync"
    model = FakeListChatModel(responses=["Sync summary"])
    middleware = PDFFormSummarizationMiddleware(
        model=model,
        trigger=[("messages", 2)],
        keep=("messages", 1),
        offload_to_file=True,
        history_dir=history_dir,
    )

    state = {
        "messages": [
            HumanMessage(content="Message A"),
            AIMessage(content="Message B"),
            HumanMessage(content="Message C"),
        ]
    }

    with caplog.at_level(logging.INFO):
        result = middleware.before_model(state, runtime=None)

    assert result is not None
    assert "[CONTEXT TELEMETRY]" in caplog.text
    assert "Thread='default'" in caplog.text
    assert "Messages: 3 ->" in caplog.text
    assert "Ersparnis:" in caplog.text


@pytest.mark.asyncio
async def test_summarization_middleware_telemetry_skipped_when_no_trigger(caplog):
    """Verify telemetry logging is completely skipped when summarization is not triggered."""
    import logging

    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    from src.core.agent import PDFFormSummarizationMiddleware

    model = FakeListChatModel(responses=["Not called"])
    middleware = PDFFormSummarizationMiddleware(
        model=model,
        trigger=[("messages", 10)],
        keep=("messages", 2),
        offload_to_file=False,
    )

    state = {"messages": [HumanMessage(content="One message")]}

    with caplog.at_level(logging.INFO):
        result = await middleware.abefore_model(state, runtime=None)

    assert result is None
    assert "[CONTEXT TELEMETRY]" not in caplog.text


def test_summarization_middleware_telemetry_resilience():
    """Verify telemetry calculation errors do not abort model invocation (STOP 2)."""
    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    from src.core.agent import PDFFormSummarizationMiddleware

    model = FakeListChatModel(responses=["Summary"])
    middleware = PDFFormSummarizationMiddleware(
        model=model,
        trigger=[("messages", 1)],
        keep=("messages", 1),
        offload_to_file=False,
    )

    state = {
        "messages": [
            HumanMessage(content="A"),
            AIMessage(content="B"),
        ]
    }

    with patch.object(middleware, "_log_telemetry", side_effect=RuntimeError("Logging failed")):
        # Should not raise exception
        result = middleware.before_model(state, runtime=None)
        assert result is not None

