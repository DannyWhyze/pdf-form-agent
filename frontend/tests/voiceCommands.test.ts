import { describe, it, expect } from 'vitest';
import { parseVoiceCommand, VoiceCommandResult } from '../src/utils/voiceCommands';

describe('Voice Commands Parser Engine (parseVoiceCommand)', () => {
  describe('SEND command', () => {
    it('detects "... senden" at sentence end and extracts cleaned text', () => {
      const result: VoiceCommandResult = parseVoiceCommand('Max Mustermann, senden');
      expect(result).toEqual({
        type: 'SEND',
        badgeLabel: 'SENDEN',
        cleanedText: 'Max Mustermann',
      });
    });

    it('detects "... abschicken" at sentence end', () => {
      const result = parseVoiceCommand('10115 Berlin abschicken');
      expect(result).toEqual({
        type: 'SEND',
        badgeLabel: 'SENDEN',
        cleanedText: '10115 Berlin',
      });
    });

    it('detects "... eintragen." with trailing punctuation', () => {
      const result = parseVoiceCommand('Danny eintragen.');
      expect(result).toEqual({
        type: 'SEND',
        badgeLabel: 'SENDEN',
        cleanedText: 'Danny',
      });
    });

    it('handles standalone "senden" with empty cleaned text', () => {
      const result = parseVoiceCommand('senden');
      expect(result).toEqual({
        type: 'SEND',
        badgeLabel: 'SENDEN',
        cleanedText: '',
      });
    });

    it('rejects questions like "Wohin soll ich das senden?" as NONE', () => {
      const result = parseVoiceCommand('Wohin soll ich das senden?');
      expect(result).toEqual({
        type: 'NONE',
        badgeLabel: null,
      });
    });

    it('rejects mid-sentence occurrences like "Ich möchte eine Mail senden an Anna"', () => {
      const result = parseVoiceCommand('Ich möchte eine Mail senden an Anna');
      expect(result).toEqual({
        type: 'NONE',
        badgeLabel: null,
      });
    });
  });

  describe('REPEAT_QUESTION command', () => {
    it('detects "Wiederhole die Frage"', () => {
      const result = parseVoiceCommand('Wiederhole die Frage');
      expect(result).toEqual({
        type: 'REPEAT_QUESTION',
        badgeLabel: 'WIEDERHOLE FRAGE',
      });
    });

    it('detects "bitte frage wiederholen"', () => {
      const result = parseVoiceCommand('bitte frage wiederholen');
      expect(result).toEqual({
        type: 'REPEAT_QUESTION',
        badgeLabel: 'WIEDERHOLE FRAGE',
      });
    });

    it('detects "nochmal vorlesen"', () => {
      const result = parseVoiceCommand('nochmal vorlesen');
      expect(result).toEqual({
        type: 'REPEAT_QUESTION',
        badgeLabel: 'WIEDERHOLE FRAGE',
      });
    });

    it('detects "Frage wiederholen" with punctuation', () => {
      const result = parseVoiceCommand('Frage wiederholen!');
      expect(result).toEqual({
        type: 'REPEAT_QUESTION',
        badgeLabel: 'WIEDERHOLE FRAGE',
      });
    });
  });

  describe('DOWNLOAD_FORM command', () => {
    it('detects "Formular herunterladen"', () => {
      const result = parseVoiceCommand('Formular herunterladen');
      expect(result).toEqual({
        type: 'DOWNLOAD_FORM',
        badgeLabel: 'DOWNLOAD',
      });
    });

    it('detects "pdf downloaden"', () => {
      const result = parseVoiceCommand('pdf downloaden');
      expect(result).toEqual({
        type: 'DOWNLOAD_FORM',
        badgeLabel: 'DOWNLOAD',
      });
    });

    it('detects "bitte formular speichern"', () => {
      const result = parseVoiceCommand('bitte formular speichern');
      expect(result).toEqual({
        type: 'DOWNLOAD_FORM',
        badgeLabel: 'DOWNLOAD',
      });
    });

    it('detects "PDF herunterladen"', () => {
      const result = parseVoiceCommand('PDF herunterladen');
      expect(result).toEqual({
        type: 'DOWNLOAD_FORM',
        badgeLabel: 'DOWNLOAD',
      });
    });
  });

  describe('STEP_BACK command', () => {
    it('detects "Einen Schritt zurück"', () => {
      const result = parseVoiceCommand('Einen Schritt zurück');
      expect(result).toEqual({
        type: 'STEP_BACK',
        badgeLabel: 'SCHRITT ZURÜCK',
      });
    });

    it('detects "schritt zurück"', () => {
      const result = parseVoiceCommand('schritt zurück');
      expect(result).toEqual({
        type: 'STEP_BACK',
        badgeLabel: 'SCHRITT ZURÜCK',
      });
    });

    it('detects "bitte zurück"', () => {
      const result = parseVoiceCommand('bitte zurück');
      expect(result).toEqual({
        type: 'STEP_BACK',
        badgeLabel: 'SCHRITT ZURÜCK',
      });
    });
  });

  describe('NONE (normal dictation)', () => {
    it('returns NONE for ordinary dictation content', () => {
      expect(parseVoiceCommand('Musterstraße 42')).toEqual({
        type: 'NONE',
        badgeLabel: null,
      });
      expect(parseVoiceCommand('Mein Name ist John Doe')).toEqual({
        type: 'NONE',
        badgeLabel: null,
      });
      expect(parseVoiceCommand('')).toEqual({
        type: 'NONE',
        badgeLabel: null,
      });
      expect(parseVoiceCommand('   ')).toEqual({
        type: 'NONE',
        badgeLabel: null,
      });
    });
  });
});
