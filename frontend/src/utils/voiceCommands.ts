/**
 * Voice Commands Parser Engine for hands-free dictation.
 * Pure stateless function that detects specific command phrases from STT transcripts.
 */

export type VoiceCommandType = 'SEND' | 'REPEAT_QUESTION' | 'DOWNLOAD_FORM' | 'STEP_BACK' | 'NONE';

export interface VoiceCommandResult {
  type: VoiceCommandType;
  badgeLabel: string | null;
  cleanedText?: string;
}

// Interrogative / question starters that must NOT trigger SEND
const QUESTION_PATTERNS = /^(?:wohin|woher|wo|wie|warum|weshalb|wieso|wann|wer|was|welche[rs]?)\b/i;

// Regex for REPEAT_QUESTION: "Wiederhole die Frage", "Frage wiederholen", "Nochmal vorlesen"
const REPEAT_QUESTION_REGEX =
  /^(?:bitte\s+)?(?:wiederhole?\s+(?:bitte\s+)?(?:die\s+)?frage|frage\s+(?:bitte\s+)?wiederholen|noch\s*einmal\s+vorlesen|nochmal\s+(?:bitte\s+)?vorlesen)(?:\s+bitte)?[.!?]?$/i;

// Regex for DOWNLOAD_FORM: "Formular herunterladen", "PDF herunterladen", "pdf downloaden", "bitte formular speichern"
const DOWNLOAD_FORM_REGEX =
  /^(?:bitte\s+)?(?:(?:formular|pdf)\s+(?:bitte\s+)?(?:herunterladen|downloaden|speichern)|(?:herunterladen|downloaden|speichern)\s+(?:bitte\s+)?(?:von\s+)?(?:formular|pdf))(?:\s+bitte)?[.!?]?$/i;

// Regex for STEP_BACK: "Einen Schritt zurück", "schritt zurück", "bitte zurück", "zurück bitte"
const STEP_BACK_REGEX =
  /^(?:bitte\s+)?(?:(?:einen\s+)?schritt\s+(?:bitte\s+)?zurück|zurück)(?:\s+bitte)?[.!?]?$/i;

// Regex for SEND at sentence end: "... senden", "... abschicken", "... eintragen"
const SEND_SUFFIX_REGEX =
  /^(?:(.*?)(?:,\s*|\s+))?(?:bitte\s+)?(senden|abschicken|eintragen)[.!]?$/i;

/**
 * Parses an STT transcript for supported voice commands.
 *
 * @param transcript The raw transcript text from STT
 * @returns VoiceCommandResult indicating command type, optional cleaned text, and badge label
 */
export function parseVoiceCommand(transcript: string): VoiceCommandResult {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { type: 'NONE', badgeLabel: null };
  }

  // 1. REPEAT_QUESTION
  if (REPEAT_QUESTION_REGEX.test(trimmed)) {
    return {
      type: 'REPEAT_QUESTION',
      badgeLabel: 'WIEDERHOLE FRAGE',
    };
  }

  // 2. DOWNLOAD_FORM
  if (DOWNLOAD_FORM_REGEX.test(trimmed)) {
    return {
      type: 'DOWNLOAD_FORM',
      badgeLabel: 'DOWNLOAD',
    };
  }

  // 3. STEP_BACK
  if (STEP_BACK_REGEX.test(trimmed)) {
    return {
      type: 'STEP_BACK',
      badgeLabel: 'SCHRITT ZURÜCK',
    };
  }

  // 4. Questions are never SEND commands
  if (trimmed.endsWith('?') || QUESTION_PATTERNS.test(trimmed)) {
    return { type: 'NONE', badgeLabel: null };
  }

  // 5. SEND command at sentence end
  const sendMatch = trimmed.match(SEND_SUFFIX_REGEX);
  if (sendMatch) {
    const rawCleaned = sendMatch[1] ?? '';
    const cleanedText = rawCleaned.replace(/[,;:]+$/, '').trim();
    return {
      type: 'SEND',
      badgeLabel: 'SENDEN',
      cleanedText,
    };
  }

  return { type: 'NONE', badgeLabel: null };
}
