import sys
from pathlib import Path
from unittest.mock import mock_open, patch

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest

from src.core.tools import PDF_FORM_PROMPT as RE_EXPORTED_PROMPT
from src.prompts import PDF_FORM_PROMPT, PROMPTS_DIR, load_prompt


def test_pdf_form_prompt_loaded_successfully():
    """Verify that PDF_FORM_PROMPT is loaded and contains core directives."""
    assert isinstance(PDF_FORM_PROMPT, str)
    assert len(PDF_FORM_PROMPT) > 100
    assert "Du bist ein Formular-Assistent" in PDF_FORM_PROMPT
    assert "read_pdf_form" in PDF_FORM_PROMPT
    assert "fill_pdf_form" in PDF_FORM_PROMPT
    assert "NATÜRLICHE SPRACHE" in PDF_FORM_PROMPT
    assert "LIVE-AKTUALISIERUNG" in PDF_FORM_PROMPT
    assert "WERKZEUG-PFLICHT" in PDF_FORM_PROMPT
    assert "STRIKTES VERBOT REIN TEXTUELLER BESTÄTIGUNGEN" in PDF_FORM_PROMPT
    assert "STAMMDATEN-VORBELEGUNG" in PDF_FORM_PROMPT
    assert "get_user_profile" in PDF_FORM_PROMPT


def test_load_prompt_explicit_name():
    """Verify load_prompt loads the specified YAML prompt."""
    prompt = load_prompt("pdf_form_agent")
    assert prompt == PDF_FORM_PROMPT


def test_load_prompt_missing_file_fallback():
    """Verify fallback prompt is returned when prompt YAML does not exist."""
    fallback = load_prompt("non_existent_prompt_name_xyz")
    assert isinstance(fallback, str)
    assert "Du bist ein Formular-Assistent" in fallback


def test_load_prompt_invalid_yaml_fallback():
    """Verify fallback prompt is returned when YAML parsing fails or is empty."""
    with patch("builtins.open", mock_open(read_data="system_prompt: ''")):
        fallback = load_prompt("pdf_form_agent")
        assert "Du bist ein Formular-Assistent" in fallback


def test_backwards_compatible_tools_reexport():
    """Verify src.core.tools still exports the identical PDF_FORM_PROMPT."""
    assert RE_EXPORTED_PROMPT == PDF_FORM_PROMPT


def test_prompt_injection_protection_directive():
    """Verify that both YAML prompt and fallback contain prompt injection defense directives."""
    assert "PROMPT-INJECTION-SCHUTZ" in PDF_FORM_PROMPT
    assert "unvertrauenswürdige Nutzdaten" in PDF_FORM_PROMPT

    fallback = load_prompt("non_existent_fallback_test")
    assert "PROMPT-INJECTION-SCHUTZ" in fallback
    assert "unvertrauenswürdige Nutzdaten" in fallback


def test_mandatory_tool_call_enforcement_directive():
    """Verify that both YAML prompt and fallback enforce tool calls and prohibit text-only confirmation."""
    assert "WERKZEUG-PFLICHT (fill_pdf_form)" in PDF_FORM_PROMPT
    assert "STRIKTES VERBOT REIN TEXTUELLER BESTÄTIGUNGEN" in PDF_FORM_PROMPT

    fallback = load_prompt("non_existent_fallback_test")
    assert "WERKZEUG-PFLICHT (fill_pdf_form)" in fallback
    assert "STRIKTES VERBOT REIN TEXTUELLER BESTÄTIGUNGEN" in fallback


def test_completion_download_link_directive():
    """Verify that both YAML prompt and fallback contain strict completion rule and download link directive."""
    assert "ABSCHLUSS-REGEL & DOWNLOAD-LINK" in PDF_FORM_PROMPT
    assert "[PDF herunterladen]" in PDF_FORM_PROMPT

    fallback = load_prompt("non_existent_fallback_test")
    assert "ABSCHLUSS-REGEL & DOWNLOAD-LINK" in fallback
    assert "[PDF herunterladen]" in fallback


def test_pdf_form_agent_prompt_has_cognitive_step_guidance():
    """Verify that the system prompt instructs the agent to use cognitive step formatting."""
    prompt = load_prompt("pdf_form_agent")
    assert "KOGNITIVE SCHRITT-FÜR-SCHRITT-FÜHRUNG" in prompt
    assert "Schritt X von Y" in prompt
    assert "filled_fields" in prompt

    fallback = load_prompt("non_existent_fallback_test")
    assert "KOGNITIVE SCHRITT-FÜR-SCHRITT-FÜHRUNG" in fallback
    assert "Schritt X von Y" in fallback
    assert "filled_fields" in fallback


def test_user_profile_autofill_directive():
    """Verify that both YAML prompt and fallback instruct turn-1 user profile autofill with strict tool mandate."""
    prompt = load_prompt("pdf_form_agent")
    assert "STAMMDATEN-VORBELEGUNG (AUTOFILL)" in prompt
    assert "get_user_profile" in prompt
    assert "Batch-Befüllung" in prompt
    assert "ZWINGENDE WERKZEUG-PFLICHT BEI PROFIL-DATEN (fill_pdf_form)" in prompt
    assert "STRIKTES VERBOT REIN TEXTUELLER AUTOFILL-BEHAUPTUNGEN" in prompt
    assert "Ein reiner Text-Chat füllt keine Formularfelder aus!" in prompt

    fallback = load_prompt("non_existent_fallback_test")
    assert "STAMMDATEN-VORBELEGUNG (AUTOFILL)" in fallback
    assert "get_user_profile" in fallback
    assert "Batch-Befüllung" in fallback
    assert "ZWINGENDE WERKZEUG-PFLICHT BEI PROFIL-DATEN (fill_pdf_form)" in fallback
    assert "STRIKTES VERBOT REIN TEXTUELLER AUTOFILL-BEHAUPTUNGEN" in fallback
    assert "Ein reiner Text-Chat füllt keine Formularfelder aus!" in fallback


def test_user_profile_autofill_third_party_exception_directive():
    """Verify that both YAML prompt and fallback specify the third-party / disabled autofill exception."""
    prompt = load_prompt("pdf_form_agent")
    assert "AUSNAHME BEI FORMULAREN FÜR DRITTE ODER DEAKTIVIERTEM AUTOFILL" in prompt
    assert "für eine andere Person ausgefüllt wird" in prompt
    assert "Trage KEINE Stammdaten ein" in prompt

    fallback = load_prompt("non_existent_fallback_test")
    assert "AUSNAHME BEI FORMULAREN FÜR DRITTE ODER DEAKTIVIERTEM AUTOFILL" in fallback
    assert "für eine andere Person ausgefüllt wird" in fallback
    assert "Trage KEINE Stammdaten ein" in fallback




