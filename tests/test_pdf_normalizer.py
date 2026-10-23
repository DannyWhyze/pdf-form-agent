import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.pdf.normalizer import (
    _CHECKBOX_FALSY_STRINGS,
    discover_btn_on_keys,
    discover_radio_groups,
    normalize_field_values,
)


def test_checkbox_falsy_strings():
    assert "nein" in _CHECKBOX_FALSY_STRINGS
    assert "false" in _CHECKBOX_FALSY_STRINGS
    assert "off" in _CHECKBOX_FALSY_STRINGS
    assert "0" in _CHECKBOX_FALSY_STRINGS


def test_normalize_standalone_checkboxes():
    btn_keys = {"newsletter": "/Yes", "terms": "/Ja"}

    # Truthy / on-keys
    assert normalize_field_values({"newsletter": True}, btn_keys)["newsletter"] == "/Yes"
    assert normalize_field_values({"newsletter": "ja"}, btn_keys)["newsletter"] == "/Yes"
    assert normalize_field_values({"newsletter": "ich will"}, btn_keys)["newsletter"] == "/Yes"
    assert normalize_field_values({"terms": True}, btn_keys)["terms"] == "/Ja"

    # Falsy / off
    assert normalize_field_values({"newsletter": False}, btn_keys)["newsletter"] == "/Off"
    assert normalize_field_values({"newsletter": "nein"}, btn_keys)["newsletter"] == "/Off"
    assert normalize_field_values({"newsletter": "0"}, btn_keys)["newsletter"] == "/Off"
    assert normalize_field_values({"newsletter": None}, btn_keys)["newsletter"] == "/Off"


def test_normalize_radio_groups():
    radio_groups = {
        "geschlecht": {
            "states": ["/0", "/1", "/2"],
            "options": ["Männlich", "Weiblich", "Divers"],
        }
    }
    btn_keys = {}

    # 1. Direct state match (/1 or 1 matches state /1)
    assert normalize_field_values({"geschlecht": "/1"}, btn_keys, radio_groups=radio_groups)["geschlecht"] == "/1"
    assert normalize_field_values({"geschlecht": "1"}, btn_keys, radio_groups=radio_groups)["geschlecht"] == "/1"
    assert normalize_field_values({"geschlecht": "0"}, btn_keys, radio_groups=radio_groups)["geschlecht"] == "/0"

    # 2. Option text match
    assert normalize_field_values({"geschlecht": "weiblich"}, btn_keys, radio_groups=radio_groups)["geschlecht"] == "/1"
    assert normalize_field_values({"geschlecht": "Männlich"}, btn_keys, radio_groups=radio_groups)["geschlecht"] == "/0"
    assert normalize_field_values({"geschlecht": "divers"}, btn_keys, radio_groups=radio_groups)["geschlecht"] == "/2"

    # 3. Boolean / Yes / No
    assert normalize_field_values({"geschlecht": True}, btn_keys, radio_groups=radio_groups)["geschlecht"] == "/0"
    assert normalize_field_values({"geschlecht": False}, btn_keys, radio_groups=radio_groups)["geschlecht"] == "/1"


def test_normalize_choice_dropdowns():
    choice_options = {
        "bundesland": ["Berlin", "Bayern", "Hamburg"]
    }
    btn_keys = {}

    # 1-based index
    assert normalize_field_values({"bundesland": "1"}, btn_keys, choice_options=choice_options)["bundesland"] == "Berlin"
    assert normalize_field_values({"bundesland": "2"}, btn_keys, choice_options=choice_options)["bundesland"] == "Bayern"

    # Case-insensitive match
    assert normalize_field_values({"bundesland": "berlin"}, btn_keys, choice_options=choice_options)["bundesland"] == "Berlin"
    assert normalize_field_values({"bundesland": "HAMBURG"}, btn_keys, choice_options=choice_options)["bundesland"] == "Hamburg"

    # Unmatched
    assert normalize_field_values({"bundesland": "Unbekannt"}, btn_keys, choice_options=choice_options)["bundesland"] == "Unbekannt"
