"""
Integration and unit tests for PDFFormValidationMiddleware (src/core/agent.py).
Verifies the Intercepting Filter Pattern, short-circuiting on invalid form data,
and preservation of valid tool execution.
"""

import json
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest
from langchain_core.messages import ToolMessage

from src.core.agent import PDFFormAgent, PDFFormSummarizationMiddleware, PDFFormValidationMiddleware


class DummyToolCallRequest:
    """Mock object representing LangChain ToolCallRequest."""

    def __init__(self, name: str, args: dict, call_id: str = "call_test_1"):
        self.tool_call = {
            "name": name,
            "args": args,
            "id": call_id,
        }
        self.state = {}
        self.runtime = MagicMock()


class TestPDFFormValidationMiddlewareSync:
    """Tests for synchronous wrap_tool_call."""

    def test_pass_through_non_fill_tools(self):
        middleware = PDFFormValidationMiddleware()
        req = DummyToolCallRequest("read_pdf_form", {"filepath": "doc.pdf"})
        handler = MagicMock(return_value=ToolMessage(content="ok", tool_call_id="call_test_1"))

        res = middleware.wrap_tool_call(req, handler)
        handler.assert_called_once_with(req)
        assert res.content == "ok"

    def test_pass_through_valid_form_data(self):
        middleware = PDFFormValidationMiddleware()
        valid_args = {
            "filepath": "form.pdf",
            "field_values": {
                "txt_geburtsdatum": "15.03.1990",
                "txt_plz": "01067",
                "vorname": "Max",
            },
            "output_filename": "out.pdf",
        }
        req = DummyToolCallRequest("fill_pdf_form", valid_args)
        handler = MagicMock(return_value=ToolMessage(content='{"success": true}', tool_call_id="call_test_1"))

        res = middleware.wrap_tool_call(req, handler)
        handler.assert_called_once_with(req)
        assert res.content == '{"success": true}'

    def test_pass_through_checkbox_with_string_toggle(self):
        # FIX-2026-10-23-01: chk_datenschutz with string 'Nein' must pass through to tool handler
        middleware = PDFFormValidationMiddleware()
        args = {
            "filepath": "test_form_3.pdf",
            "field_values": {
                "chk_datenschutz": "Nein",
                "chk_newsletter": "/Off",
                "rbtn_erwerbstaetig": "ja",
            },
            "output_filename": "out.pdf",
        }
        req = DummyToolCallRequest("fill_pdf_form", args, call_id="call_chk_toggle")
        handler = MagicMock(return_value=ToolMessage(content='{"success": true}', tool_call_id="call_chk_toggle"))

        res = middleware.wrap_tool_call(req, handler)
        handler.assert_called_once_with(req)
        assert res.content == '{"success": true}'

    def test_short_circuit_on_invalid_date(self):
        middleware = PDFFormValidationMiddleware()
        invalid_args = {
            "filepath": "form.pdf",
            "field_values": {
                "txt_geburtsdatum": "31.02.1990",  # Non-existent calendar date
                "vorname": "Max",
            },
            "output_filename": "out.pdf",
        }
        req = DummyToolCallRequest("fill_pdf_form", invalid_args, call_id="call_err_date")
        handler = MagicMock()

        res = middleware.wrap_tool_call(req, handler)

        # Handler must NOT have been called (Zero Dirty Writes)
        handler.assert_not_called()
        assert isinstance(res, ToolMessage)
        assert res.tool_call_id == "call_err_date"
        assert res.name == "fill_pdf_form"

        data = json.loads(res.content)
        assert data["success"] is False
        assert data["validation_failed"] is True
        assert data["field"] == "txt_geburtsdatum"
        assert "existiert im Kalender nicht" in data["error"]
        assert "freundlich in natürlicher Sprache" in data["instruction"]

    def test_short_circuit_on_invalid_iban(self):
        middleware = PDFFormValidationMiddleware()
        invalid_args = {
            "field_values": {
                "txt_iban": "DE89370400440532013001",  # Invalid checksum
            }
        }
        req = DummyToolCallRequest("fill_pdf_form", invalid_args, call_id="call_err_iban")
        handler = MagicMock()

        res = middleware.wrap_tool_call(req, handler)
        handler.assert_not_called()

        data = json.loads(res.content)
        assert data["validation_failed"] is True
        assert data["field"] == "txt_iban"
        assert "Zahlendreher" in data["error"]

    def test_short_circuit_on_negative_currency_amount(self):
        middleware = PDFFormValidationMiddleware()
        invalid_args = {
            "field_values": {
                "txt_gehalt": "-1500 €",
            }
        }
        req = DummyToolCallRequest("fill_pdf_form", invalid_args, call_id="call_err_curr")
        handler = MagicMock()

        res = middleware.wrap_tool_call(req, handler)
        handler.assert_not_called()

        data = json.loads(res.content)
        assert data["validation_failed"] is True
        assert data["field"] == "txt_gehalt"
        assert "positiven numerischen Wert" in data["error"]


class TestPDFFormValidationMiddlewareAsync:
    """Tests for asynchronous awrap_tool_call."""

    @pytest.mark.asyncio
    async def test_async_pass_through_valid(self):
        middleware = PDFFormValidationMiddleware()
        req = DummyToolCallRequest(
            "fill_pdf_form",
            {"field_values": {"txt_plz": "10115"}},
            call_id="call_async_valid",
        )
        handler = AsyncMock(return_value=ToolMessage(content="done", tool_call_id="call_async_valid"))

        res = await middleware.awrap_tool_call(req, handler)
        handler.assert_awaited_once_with(req)
        assert res.content == "done"

    @pytest.mark.asyncio
    async def test_async_short_circuit_on_invalid_plz(self):
        middleware = PDFFormValidationMiddleware()
        req = DummyToolCallRequest(
            "fill_pdf_form",
            {"field_values": {"txt_plz": "123"}},  # Only 3 digits
            call_id="call_async_err",
        )
        handler = AsyncMock()

        res = await middleware.awrap_tool_call(req, handler)
        handler.assert_not_awaited()

        data = json.loads(res.content)
        assert data["validation_failed"] is True
        assert data["field"] == "txt_plz"
        assert "5 Ziffern" in data["error"]

    @pytest.mark.asyncio
    async def test_async_short_circuit_on_negative_currency_amount(self):
        middleware = PDFFormValidationMiddleware()
        req = DummyToolCallRequest(
            "fill_pdf_form",
            {"field_values": {"txt_gehalt": "-2500"}},
            call_id="call_async_err_curr",
        )
        handler = AsyncMock()

        res = await middleware.awrap_tool_call(req, handler)
        handler.assert_not_awaited()

        data = json.loads(res.content)
        assert data["validation_failed"] is True
        assert data["field"] == "txt_gehalt"
        assert "positiven numerischen Wert" in data["error"]


class TestAgentMiddlewareIntegration:
    """Verifies that PDFFormAgent properly wires validation middleware."""

    def test_default_initialization_includes_validation_and_summarization(self):
        with (
            patch("src.core.agent.create_chat_model"),
            patch("src.core.agent.create_agent"),
        ):
            agent = PDFFormAgent(enable_summarization=True)
            assert len(agent.middleware) == 2
            assert isinstance(agent.middleware[0], PDFFormValidationMiddleware)
            assert isinstance(agent.middleware[1], PDFFormSummarizationMiddleware)

    def test_initialization_without_summarization_retains_validation(self):
        with (
            patch("src.core.agent.create_chat_model"),
            patch("src.core.agent.create_agent"),
        ):
            agent = PDFFormAgent(enable_summarization=False)
            assert len(agent.middleware) == 1
            assert isinstance(agent.middleware[0], PDFFormValidationMiddleware)
