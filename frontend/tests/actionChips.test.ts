import { describe, it, expect } from 'vitest';
import { extractActionChips } from '../src/utils/actionChips';
import { FormField } from '../src/types';

describe('extractActionChips utility', () => {
  it('returns empty array for empty or text without choices', () => {
    expect(extractActionChips('')).toEqual([]);
    expect(extractActionChips('Wie lautet Ihr Vorname?')).toEqual([]);
  });

  it('detects Ja/Nein from question phrasing', () => {
    expect(
      extractActionChips('Möchten Sie den Newsletter abonnieren? (Ja / Nein)')
    ).toEqual(['Ja', 'Nein']);

    expect(
      extractActionChips('Sind Sie erwerbstätig? Antworten Sie mit Ja oder Nein.')
    ).toEqual(['Ja', 'Nein']);

    expect(
      extractActionChips('Möchten Sie das Feld für die Zweitwohnung ankreuzen?')
    ).toEqual(['Ja', 'Nein']);
  });

  it('extracts slash-separated choices from parentheses', () => {
    expect(
      extractActionChips(
        '**Schritt 3 von 8 (Familienstand):** Sind Sie (Ledig / Verheiratet / Geschieden / Verwitwet)?'
      )
    ).toEqual(['Ledig', 'Verheiratet', 'Geschieden', 'Verwitwet']);

    expect(
      extractActionChips('Bitte wählen Sie Ihre Beschäftigungsart (Vollzeit / Teilzeit / Minijob).')
    ).toEqual(['Vollzeit', 'Teilzeit', 'Minijob']);
  });

  it('extracts numbered choices from message', () => {
    const text = `Bitte wählen Sie Ihren Status:
1) Student
2) Angestellt
3) Selbstständig`;
    expect(extractActionChips(text)).toEqual(['Student', 'Angestellt', 'Selbstständig']);
  });

  it('matches against form field metadata when available', () => {
    const fields: FormField[] = [
      {
        name: 'drp_anrede',
        type: '/Ch',
        description: 'Anrede',
        options: ['Herr', 'Frau', 'Divers'],
      },
      {
        name: 'chk_agreed',
        type: '/Btn',
        description: 'Zustimmung AGB',
      },
    ];

    expect(
      extractActionChips('**Schritt 1 von 5 (Anrede):** Wie möchten Sie angesprochen werden?', fields)
    ).toEqual(['Herr', 'Frau', 'Divers']);

    expect(
      extractActionChips('**Schritt 2 von 5 (Zustimmung AGB):** Stimmen Sie den Bedingungen zu?', fields)
    ).toEqual(['Ja', 'Nein']);
  });
});
