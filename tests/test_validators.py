"""
Comprehensive unit tests for the deterministic validation engine (src/core/validators.py).
"""

import sys
from datetime import date
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import pytest

from src.core.validators import (
    ValidationResult,
    validate_currency_amount,
    validate_date,
    validate_email,
    validate_form_field,
    validate_iban,
    validate_postal_code,
)


class TestIbanValidator:
    """Tests for ISO 7064 Modulo-97 IBAN validator."""

    def test_valid_german_iban_variants(self):
        # Valid test IBAN: DE89 3704 0044 0532 0130 00
        res1 = validate_iban("DE89 3704 0044 0532 0130 00")
        assert res1.is_valid is True
        assert res1.cleaned_value == "DE89370400440532013000"

        # Lowercase and with hyphens
        res2 = validate_iban("de89-3704-0044-0532-0130-00")
        assert res2.is_valid is True
        assert res2.cleaned_value == "DE89370400440532013000"

    def test_valid_austrian_iban(self):
        # Valid Austrian IBAN: AT61 1904 3002 3457 3201 (20 chars)
        res = validate_iban("AT61 1904 3002 3457 3201")
        assert res.is_valid is True
        assert res.cleaned_value == "AT611904300234573201"

    def test_invalid_checksum(self):
        # Alter last digit from 0 to 1
        res = validate_iban("DE89370400440532013001")
        assert res.is_valid is False
        assert "Zahlendreher" in (res.error_message or "")

    def test_invalid_german_iban_length_and_characters(self):
        # German IBAN with only 21 characters
        res1 = validate_iban("DE8937040044053201300")
        assert res1.is_valid is False
        assert "22 Zeichen" in (res1.error_message or "")

        # German IBAN with letters in account number
        res2 = validate_iban("DE8937040044053201300X")
        assert res2.is_valid is False

    def test_empty_or_none_iban(self):
        assert validate_iban(None).is_valid is False
        assert validate_iban("").is_valid is False
        assert validate_iban("   ").is_valid is False


class TestDateValidator:
    """Tests for Gregorian calendar date validation and age logic."""

    def test_valid_date_formats_normalized(self):
        # TT.MM.JJJJ
        r1 = validate_date("15.03.1990")
        assert r1.is_valid is True
        assert r1.cleaned_value == "15.03.1990"

        # JJJJ-MM-TT (ISO)
        r2 = validate_date("1990-03-15")
        assert r2.is_valid is True
        assert r2.cleaned_value == "15.03.1990"

        # TT/MM/JJJJ
        r3 = validate_date("15/03/1990")
        assert r3.is_valid is True
        assert r3.cleaned_value == "15.03.1990"

        # Single digits D.M.YYYY
        r4 = validate_date("5.3.1990")
        assert r4.is_valid is True
        assert r4.cleaned_value == "05.03.1990"

    def test_leap_year_calendar_rules(self):
        # 29.02.2024 is a leap year -> valid
        assert validate_date("29.02.2024").is_valid is True

        # 29.02.2023 is not a leap year -> invalid
        r_non_leap = validate_date("29.02.2023")
        assert r_non_leap.is_valid is False
        assert "existiert im Kalender nicht" in (r_non_leap.error_message or "")

        # 31.04.2024 does not exist (April has 30 days)
        r_april = validate_date("31.04.2024")
        assert r_april.is_valid is False

    def test_birthdate_constraints(self):
        ref_today = date(2026, 10, 19)

        # Future date is invalid for birthdate
        r_fut = validate_date("20.10.2026", is_birthdate=True, reference_date=ref_today)
        assert r_fut.is_valid is False
        assert "Zukunft" in (r_fut.error_message or "")

        # Exact age calculation: born 19.10.2006 -> exactly 20 years old
        r_age = validate_date("19.10.2006", is_birthdate=True, min_age=18, reference_date=ref_today)
        assert r_age.is_valid is True

        # Too young: born 20.10.2008 -> 17 years old (< 18)
        r_young = validate_date("20.10.2008", is_birthdate=True, min_age=18, reference_date=ref_today)
        assert r_young.is_valid is False
        assert "unter dem Mindestalter" in (r_young.error_message or "")

        # Too old: born in 1900 -> 126 years old (> 120)
        r_old = validate_date("01.01.1900", is_birthdate=True, max_age=120, reference_date=ref_today)
        assert r_old.is_valid is False
        assert "Maximalalter" in (r_old.error_message or "")

    def test_invalid_syntax_or_empty(self):
        assert validate_date(None).is_valid is False
        assert validate_date("").is_valid is False
        assert validate_date("not-a-date").is_valid is False


class TestPostalCodeValidator:
    """Tests for German postal code (PLZ) validation."""

    def test_valid_plz(self):
        # Dresden (leading zero preserved)
        r1 = validate_postal_code("01067")
        assert r1.is_valid is True
        assert r1.cleaned_value == "01067"

        # Berlin
        r2 = validate_postal_code("10115")
        assert r2.is_valid is True
        assert r2.cleaned_value == "10115"

    def test_invalid_plz(self):
        # 4 digits
        assert validate_postal_code("1234").is_valid is False
        # 6 digits
        assert validate_postal_code("123456").is_valid is False
        # Letters
        assert validate_postal_code("1011A").is_valid is False
        # Empty / None
        assert validate_postal_code(None).is_valid is False
        assert validate_postal_code("").is_valid is False


class TestCurrencyAmountValidator:
    """Tests for currency amount parsing and normalization."""

    def test_german_formats(self):
        # "1.250,50 €"
        r1 = validate_currency_amount("1.250,50 €")
        assert r1.is_valid is True
        assert r1.cleaned_value == 1250.50

        # "2.500 EUR"
        r2 = validate_currency_amount("2.500 EUR")
        assert r2.is_valid is True
        assert r2.cleaned_value == 2500.00

        # "50,00"
        r3 = validate_currency_amount("50,00")
        assert r3.is_valid is True
        assert r3.cleaned_value == 50.00

    def test_international_and_numeric_inputs(self):
        # US decimal format
        r1 = validate_currency_amount("1250.50")
        assert r1.is_valid is True
        assert r1.cleaned_value == 1250.50

        # Direct int/float
        r2 = validate_currency_amount(1500)
        assert r2.is_valid is True
        assert r2.cleaned_value == 1500.00

    def test_negative_amounts(self):
        # Disallowed by default
        r1 = validate_currency_amount("-50,00")
        assert r1.is_valid is False
        assert "positiven" in (r1.error_message or "")

        # Allowed explicitly
        r2 = validate_currency_amount("-50,00", allow_negative=True)
        assert r2.is_valid is True
        assert r2.cleaned_value == -50.00

    def test_invalid_strings(self):
        assert validate_currency_amount(None).is_valid is False
        assert validate_currency_amount("").is_valid is False
        assert validate_currency_amount("kein geld").is_valid is False


class TestEmailValidator:
    """Tests for RFC 5322 email syntax validation."""

    def test_valid_emails(self):
        r1 = validate_email("max.mustermann@example.com")
        assert r1.is_valid is True
        assert r1.cleaned_value == "max.mustermann@example.com"

        # Converted to lowercase
        r2 = validate_email("USER+TAG@DOMAIN.CO.UK")
        assert r2.is_valid is True
        assert r2.cleaned_value == "user+tag@domain.co.uk"

    def test_invalid_emails(self):
        assert validate_email("plainaddress").is_valid is False
        assert validate_email("@missingusername.com").is_valid is False
        assert validate_email("user@.com").is_valid is False
        assert validate_email(None).is_valid is False
        assert validate_email("").is_valid is False


class TestFormFieldDispatcher:
    """Tests for heuristic field-to-validator dispatching."""

    def test_iban_dispatch(self):
        res = validate_form_field("txt_iban", "DE89370400440532013000")
        assert res is not None
        assert res.is_valid is True

        res_bad = validate_form_field("bankverbindung", "DE12345")
        assert res_bad is not None
        assert res_bad.is_valid is False

    def test_birthdate_dispatch_vs_birthplace(self):
        # Geburtsdatum -> Date validator
        res_date = validate_form_field("txt_geburtsdatum", "15.03.1990")
        assert res_date is not None
        assert res_date.is_valid is True

        # Geburtsort -> Must return None (Freitext / Not a date!)
        res_place = validate_form_field("txt_geburtsort", "München")
        assert res_place is None

        res_place_en = validate_form_field("birthplace", "Berlin")
        assert res_place_en is None

    def test_general_date_dispatch(self):
        res = validate_form_field("gueltig_bis", "31.12.2030")
        assert res is not None
        assert res.is_valid is True

    def test_postal_code_dispatch(self):
        res = validate_form_field("txt_plz", "01067")
        assert res is not None
        assert res.is_valid is True

    def test_currency_dispatch(self):
        res = validate_form_field("monatliches_nettoeinkommen", "3.200,50 €")
        assert res is not None
        assert res.is_valid is True
        assert res.cleaned_value == 3200.50

    def test_email_dispatch(self):
        res = validate_form_field("txt_email", "kontakt@muster.de")
        assert res is not None
        assert res.is_valid is True

    def test_generic_free_text_fields_return_none(self):
        assert validate_form_field("vorname", "Max") is None
        assert validate_form_field("nachname", "Mustermann") is None
        assert validate_form_field("strasse", "Hauptstraße 12") is None

    def test_boolean_checkboxes_bypass_validation(self):
        # Checkbox field named e.g. "email_opt_in" or "date_confirmed"
        assert validate_form_field("email_benachrichtigung", True) is None
        assert validate_form_field("datum_bestaetigt", False) is None

    def test_checkbox_prefixes_and_german_daten_bypass_date_validation(self):
        # FIX-2026-10-23-01: chk_datenschutz must not collide with 'date' regex
        assert validate_form_field("chk_datenschutz", "Nein") is None
        assert validate_form_field("chk_datenschutz", "Ja") is None
        assert validate_form_field("chk_datenschutz", "/Off") is None
        assert validate_form_field("chk_newsletter", "Nein") is None
        assert validate_form_field("rbtn_erwerbstaetig", "ja") is None
        assert validate_form_field("btn_bestaetigung", "Nein") is None
        assert validate_form_field("cb_agb", "false") is None

        # German 'daten' (data) vs English 'date' (calendar date)
        assert validate_form_field("datenschutz", "Nein") is None
        assert validate_form_field("stammdaten", "Freitext") is None
        assert validate_form_field("kundendaten_anmerkung", "Notizen") is None
        assert validate_form_field("datenverarbeitung", "zugestimmt") is None

    def test_date_boundary_and_compound_names(self):
        # Valid date formats recognized on compound names
        res_due = validate_form_field("due_date", "15.08.2025")
        assert res_due is not None and res_due.is_valid is True

        res_expiry = validate_form_field("expiry_date", "31.12.2030")
        assert res_expiry is not None and res_expiry.is_valid is True

        res_enddate = validate_form_field("enddate", "01.01.2027")
        assert res_enddate is not None and res_enddate.is_valid is True

        # Invalid date format on genuine date field fails as expected
        res_bad_date = validate_form_field("due_date", "nicht-ein-datum")
        assert res_bad_date is not None and res_bad_date.is_valid is False

        # Non-date words containing substring 'date' must return None (no false positive)
        assert validate_form_field("txt_candidate_name", "Max") is None
        assert validate_form_field("form_update_reason", "Korrektur") is None
