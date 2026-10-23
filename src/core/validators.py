"""
Deterministic validation engine for PDF form fields.

Pure Python standard library implementation (zero external dependencies).
Provides ISO 7064 Modulo-97 IBAN checks, calendar date and age verification,
German postal code validation, European currency normalization, and RFC 5322 email syntax validation.
"""

import re
from dataclasses import dataclass
from datetime import date
from typing import Any


@dataclass(frozen=True)
class ValidationResult:
    """Represents the outcome of a field validation."""

    is_valid: bool
    cleaned_value: Any | None = None
    error_message: str | None = None


def validate_iban(iban: Any) -> ValidationResult:
    """
    Validates an International Bank Account Number (IBAN) using the ISO 7064 Modulo-97 algorithm.
    Enforces country-specific length constraints (e.g., exactly 22 chars for German 'DE' IBANs).
    """
    if iban is None:
        return ValidationResult(is_valid=False, error_message="Die IBAN darf nicht leer sein.")

    cleaned = re.sub(r"[\s\-]+", "", str(iban)).upper()
    if not cleaned:
        return ValidationResult(is_valid=False, error_message="Die IBAN darf nicht leer sein.")

    # General structure check: 2 letters, 2 check digits, followed by alphanumeric chars (15 to 34 chars)
    if not re.match(r"^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$", cleaned):
        return ValidationResult(
            is_valid=False,
            error_message="Ungültiges IBAN-Format. Eine IBAN muss aus Ländercode, 2 Prüfziffern und der Kontonummer bestehen.",
        )

    # Specific check for German IBANs: exactly 22 alphanumeric characters, only digits after DE
    if cleaned.startswith("DE"):
        if len(cleaned) != 22 or not re.match(r"^DE[0-9]{20}$", cleaned):
            return ValidationResult(
                is_valid=False,
                error_message="Eine deutsche IBAN muss aus genau 22 Zeichen bestehen (DE gefolgt von 20 Ziffern).",
            )

    # ISO 7064 Modulo-97 check:
    # 1. Move first 4 characters to the end
    rearranged = cleaned[4:] + cleaned[:4]

    # 2. Convert letters to digits (A=10, B=11, ..., Z=35)
    numeric_str = "".join(str(ord(c) - 55) if c.isalpha() else c for c in rearranged)

    # 3. Compute modulo 97
    try:
        remainder = int(numeric_str) % 97
    except ValueError:
        return ValidationResult(
            is_valid=False,
            error_message="Die IBAN enthält ungültige Zeichen.",
        )

    if remainder != 1:
        return ValidationResult(
            is_valid=False,
            error_message="Die IBAN enthält einen Zahlendreher oder eine ungültige Prüfziffer.",
        )

    return ValidationResult(is_valid=True, cleaned_value=cleaned)


def validate_date(
    date_val: Any,
    is_birthdate: bool = False,
    min_age: int = 0,
    max_age: int = 120,
    reference_date: date | None = None,
) -> ValidationResult:
    """
    Validates calendar dates against actual Gregorian calendar rules.
    Normalizes valid dates to DD.MM.YYYY format.
    If is_birthdate=True, verifies that date is not in the future and falls within age bounds.
    """
    if date_val is None:
        return ValidationResult(is_valid=False, error_message="Das Datum darf nicht leer sein.")

    s = str(date_val).strip()
    if not s:
        return ValidationResult(is_valid=False, error_message="Das Datum darf nicht leer sein.")

    # Check common date formats
    m_dot = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)
    m_iso = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    m_slash = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    m_dash = re.match(r"^(\d{1,2})-(\d{1,2})-(\d{4})$", s)

    if m_dot:
        day, month, year = int(m_dot.group(1)), int(m_dot.group(2)), int(m_dot.group(3))
    elif m_iso:
        year, month, day = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
    elif m_slash:
        day, month, year = int(m_slash.group(1)), int(m_slash.group(2)), int(m_slash.group(3))
    elif m_dash:
        day, month, year = int(m_dash.group(1)), int(m_dash.group(2)), int(m_dash.group(3))
    else:
        return ValidationResult(
            is_valid=False,
            error_message=f"Ungültiges Datumsformat '{s}'. Erwartet wird TT.MM.JJJJ (z. B. 15.03.1990) oder JJJJ-MM-TT.",
        )

    try:
        parsed_date = date(year, month, day)
    except ValueError as e:
        return ValidationResult(
            is_valid=False,
            error_message=f"Das Datum '{s}' existiert im Kalender nicht (z. B. ungültiger Tag oder Monat: {e}).",
        )

    cleaned_value = parsed_date.strftime("%d.%m.%Y")
    ref_date = reference_date or date.today()

    if is_birthdate:
        if parsed_date > ref_date:
            return ValidationResult(
                is_valid=False,
                error_message="Das Geburtsdatum darf nicht in der Zukunft liegen.",
            )
        # Calculate exact age in years
        age = ref_date.year - parsed_date.year - (
            (ref_date.month, ref_date.day) < (parsed_date.month, parsed_date.day)
        )
        if age < min_age:
            return ValidationResult(
                is_valid=False,
                error_message=f"Das angegebene Alter ({age} Jahre) liegt unter dem Mindestalter von {min_age} Jahren.",
            )
        if age > max_age:
            return ValidationResult(
                is_valid=False,
                error_message=f"Das angegebene Alter ({age} Jahre) überschreitet das Maximalalter von {max_age} Jahren.",
            )

    return ValidationResult(is_valid=True, cleaned_value=cleaned_value)


def validate_postal_code(plz: Any) -> ValidationResult:
    """
    Validates German postal codes (PLZ).
    Must consist of exactly 5 digits, preserving leading zeroes.
    """
    if plz is None:
        return ValidationResult(is_valid=False, error_message="Die Postleitzahl darf nicht leer sein.")

    s = str(plz).strip()
    if not re.match(r"^[0-9]{5}$", s):
        return ValidationResult(
            is_valid=False,
            error_message="Eine deutsche Postleitzahl muss aus genau 5 Ziffern bestehen.",
        )

    return ValidationResult(is_valid=True, cleaned_value=s)


def validate_currency_amount(amount: Any, allow_negative: bool = False) -> ValidationResult:
    """
    Validates currency amounts, stripping currency symbols and normalizing European/German formats.
    Returns cleaned float rounded to 2 decimal places.
    """
    if amount is None:
        return ValidationResult(
            is_valid=False,
            error_message="Ungültiger Geldbetrag. Der Wert darf nicht leer sein.",
        )

    if isinstance(amount, (int, float)):
        val = float(amount)
        if not allow_negative and val < 0:
            return ValidationResult(
                is_valid=False,
                error_message="Ungültiger Geldbetrag. Bitte geben Sie einen positiven numerischen Wert an.",
            )
        return ValidationResult(is_valid=True, cleaned_value=round(val, 2))

    s = str(amount).strip()
    if not s:
        return ValidationResult(
            is_valid=False,
            error_message="Ungültiger Geldbetrag. Der Wert darf nicht leer sein.",
        )

    # Remove currency words and symbols
    cleaned = re.sub(r"(?i)\b(eur|euro)\b|[€$£]", "", s).strip()
    cleaned = re.sub(r"\s+", "", cleaned)

    is_negative = cleaned.startswith("-")
    if is_negative:
        cleaned = cleaned[1:]

    if not cleaned or not re.match(r"^[0-9.,]+$", cleaned):
        return ValidationResult(
            is_valid=False,
            error_message="Ungültiger Geldbetrag. Bitte geben Sie einen gültigen numerischen Wert an.",
        )

    # Normalize decimal separator
    if "." in cleaned and "," in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            # German notation: 1.250,50 -> 1250.50
            num_str = cleaned.replace(".", "").replace(",", ".")
        else:
            # US notation: 1,250.50 -> 1250.50
            num_str = cleaned.replace(",", "")
    elif "," in cleaned:
        # German decimal comma: 1250,50 -> 1250.50
        num_str = cleaned.replace(",", ".")
    elif "." in cleaned:
        if cleaned.count(".") > 1:
            # Thousands separators: 1.000.000 -> 1000000
            num_str = cleaned.replace(".", "")
        else:
            parts = cleaned.split(".")
            # If 3 digits after single dot and integer part <= 3 digits, treat as thousands separator (e.g. 1.250 -> 1250)
            if len(parts[1]) == 3 and len(parts[0]) in (1, 2, 3):
                num_str = cleaned.replace(".", "")
            else:
                num_str = cleaned
    else:
        num_str = cleaned

    try:
        val = float(num_str)
        if is_negative:
            val = -val
    except ValueError:
        return ValidationResult(
            is_valid=False,
            error_message="Ungültiger Geldbetrag. Bitte geben Sie einen gültigen numerischen Wert an.",
        )

    if not allow_negative and val < 0:
        return ValidationResult(
            is_valid=False,
            error_message="Ungültiger Geldbetrag. Bitte geben Sie einen positiven numerischen Wert an.",
        )

    return ValidationResult(is_valid=True, cleaned_value=round(val, 2))


def validate_email(email: Any) -> ValidationResult:
    """
    Validates email address syntax according to RFC 5322 basics.
    Converts valid email to lowercase.
    """
    if email is None:
        return ValidationResult(is_valid=False, error_message="Die E-Mail-Adresse darf nicht leer sein.")

    s = str(email).strip()
    if not s:
        return ValidationResult(is_valid=False, error_message="Die E-Mail-Adresse darf nicht leer sein.")

    if len(s) > 254:
        return ValidationResult(is_valid=False, error_message="Ungültige E-Mail-Adresse (zu lang).")

    # Standard RFC 5322 compatible regex
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$"
    if not re.match(pattern, s):
        return ValidationResult(is_valid=False, error_message="Ungültige E-Mail-Adresse.")

    return ValidationResult(is_valid=True, cleaned_value=s.lower())


def validate_form_field(field_name: str, value: Any) -> ValidationResult | None:
    """
    Dispatches validation to the appropriate validator based on heuristic field name patterns.
    Returns None if no specialized validation rule exists for the field (e.g., standard free text).
    """
    # Checkboxes, radio buttons, and toggle states should not undergo semantic text/number validation
    if isinstance(value, bool):
        return None

    fn_raw = field_name.lower().strip()
    # Explicit checkbox / radio button widget prefixes
    if fn_raw.startswith(("chk_", "cb_", "btn_", "rbtn_", "rad_")):
        return None

    # Remove common technical prefixes
    fn = re.sub(r"^(?:txt|num|form|field|input|chk|cb|btn|rbtn|rad)_+", "", fn_raw)

    # 1. IBAN
    if re.search(r"\b(?:iban|kontonummer|bankverbindung)\b", fn) or "iban" in fn:
        return validate_iban(value)

    # 2. Place of birth (explicit exception from birth date: e.g. geburtsort, birthplace)
    if any(kw in fn for kw in ("geburtsort", "geburts_ort", "birthplace", "place_of_birth")):
        return None

    # 3. Birth date
    if re.search(r"geburt|birth|dob", fn):
        return validate_date(value, is_birthdate=True)

    # 4. General calendar date
    # Note: Use boundary checks for 'date' to prevent substring collisions with German 'daten' (e.g., datenschutz, stammdaten)
    if (
        re.search(r"datum|gueltig_bis|ausgestellt|ablauf|beginn|ende", fn)
        or re.search(r"(?:^|_|-|\b)(?:[a-z]+_)?date(?:s)?(?:$|_|-|\b)", fn)
        or re.search(r"(?:^|_|-|\b)(?:start|end|due|issue|expiry|birth)date(?:s)?(?:$|_|-|\b)", fn)
    ):
        return validate_date(value, is_birthdate=False)

    # 5. Postal code (PLZ)
    if re.search(r"(?:^|_)plz(?:$|_)|postleitzahl|\bzip(?:code)?\b", fn):
        return validate_postal_code(value)

    # 6. Currency amounts / finances
    if re.search(r"betrag|gehalt|einkommen|miete|vermoegen|preis|kosten|salary|amount", fn):
        return validate_currency_amount(value)

    # 7. E-mail
    if re.search(r"(?:^|_)e?mail(?:$|_)", fn):
        return validate_email(value)

    return None
