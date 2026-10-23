import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest

from src.cli import main, run_cli


@pytest.mark.asyncio
async def test_run_cli_file_not_found(capsys):
    """Verify run_cli exits with error if the specified PDF does not exist."""
    missing_file = "non_existent_form.pdf"
    with pytest.raises(SystemExit) as exc_info:
        await run_cli(missing_file)

    assert exc_info.value.code == 1
    captured = capsys.readouterr()
    assert f"Error: File '{missing_file}' does not exist." in captured.out


@pytest.mark.asyncio
async def test_run_cli_copy_file_and_initial_greeting(tmp_path, monkeypatch, capsys):
    """Verify run_cli copies PDF into session directory and streams initial greeting."""
    monkeypatch.setattr("src.cli.DATA_DIR", tmp_path)

    # Create dummy source PDF
    source_pdf = tmp_path / "sample_form.pdf"
    source_pdf.write_bytes(b"%PDF-1.4 sample content")

    mock_tool = MagicMock()
    mock_tool.invoke.return_value = '{"error": false, "total_fields": 1}'

    async def mock_astream_events(prompt, thread_id):
        yield {"event": "thought", "data": "Analyzing form..."}
        yield {"event": "token", "data": "Welcome to PDF assistant!"}

    mock_agent_instance = MagicMock()
    mock_agent_instance.astream_events = mock_astream_events

    # Exit on first user input prompt
    monkeypatch.setattr("builtins.input", lambda _: "exit")

    with (
        patch("src.cli.read_pdf_form", mock_tool),
        patch("src.cli.PDFFormAgent", return_value=mock_agent_instance),
    ):
        await run_cli(str(source_pdf), thread_id="test_session_100")

    # Verify session copy
    copied_file = tmp_path / "test_session_100" / "sample_form.pdf"
    assert copied_file.exists()
    assert copied_file.read_bytes() == b"%PDF-1.4 sample content"

    mock_tool.invoke.assert_called_once_with(
        {"filepath": "sample_form.pdf"},
        config={"configurable": {"thread_id": "test_session_100"}},
    )

    captured = capsys.readouterr()
    assert (
        "Loaded PDF 'sample_form.pdf' into session 'test_session_100'." in captured.out
    )
    assert "[Thinking: Analyzing form...]" in captured.out
    assert "Welcome to PDF assistant!" in captured.out
    assert "Exiting PDF Form Agent CLI." in captured.out


@pytest.mark.asyncio
async def test_run_cli_conversation_loop(tmp_path, monkeypatch, capsys):
    """Verify interactive conversation loop processes responses until quit."""
    monkeypatch.setattr("src.cli.DATA_DIR", tmp_path)

    source_pdf = tmp_path / "input.pdf"
    source_pdf.write_bytes(b"%PDF-1.4 data")

    mock_tool = MagicMock()
    mock_tool.invoke.return_value = "{}"

    async def mock_astream_events(prompt, thread_id):
        if "Max" in prompt:
            yield {"event": "token", "data": "Vorname gespeichert."}
        else:
            yield {"event": "token", "data": "Bitte Namen eingeben."}

    mock_agent_instance = MagicMock()
    mock_agent_instance.astream_events = mock_astream_events

    # Feed input sequence: "Max", then "quit"
    user_inputs = iter(["Max", "quit"])
    monkeypatch.setattr("builtins.input", lambda _: next(user_inputs))

    with (
        patch("src.cli.read_pdf_form", mock_tool),
        patch("src.cli.PDFFormAgent", return_value=mock_agent_instance),
    ):
        await run_cli(str(source_pdf), thread_id="chat_thread")

    captured = capsys.readouterr()
    assert "Vorname gespeichert." in captured.out
    assert "Exiting PDF Form Agent CLI." in captured.out


@pytest.mark.asyncio
async def test_run_cli_keyboard_interrupt(tmp_path, monkeypatch, capsys):
    """Verify run_cli handles KeyboardInterrupt gracefully."""
    monkeypatch.setattr("src.cli.DATA_DIR", tmp_path)

    source_pdf = tmp_path / "interrupt_form.pdf"
    source_pdf.write_bytes(b"%PDF-1.4")

    mock_tool = MagicMock()
    mock_tool.invoke.return_value = "{}"

    async def mock_astream_events(prompt, thread_id):
        yield {"event": "token", "data": "Ready"}

    mock_agent_instance = MagicMock()
    mock_agent_instance.astream_events = mock_astream_events

    def raise_interrupt(_):
        raise KeyboardInterrupt()

    monkeypatch.setattr("builtins.input", raise_interrupt)

    with (
        patch("src.cli.read_pdf_form", mock_tool),
        patch("src.cli.PDFFormAgent", return_value=mock_agent_instance),
    ):
        await run_cli(str(source_pdf), thread_id="interrupt_thread")

    captured = capsys.readouterr()
    assert "Exiting." in captured.out


def test_main_argument_parsing():
    """Verify main function parses CLI arguments and runs run_cli."""
    test_args = ["src.cli", "path/to/my_form.pdf", "--thread-id", "custom_session_99"]

    with (
        patch.object(sys, "argv", test_args),
        patch("src.cli.asyncio.run") as mock_asyncio_run,
        patch("src.cli.run_cli", return_value=None) as mock_run_cli,
    ):
        main()
        mock_run_cli.assert_called_once_with("path/to/my_form.pdf", "custom_session_99")
        mock_asyncio_run.assert_called_once()
