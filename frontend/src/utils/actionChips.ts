import { FormField } from '../types';

/**
 * Extracts selectable action chips (e.g. ['Ja', 'Nein'] or choice options)
 * from assistant prompt questions.
 */
export function extractActionChips(content: string, fields?: FormField[]): string[] {
  if (!content || !content.trim()) return [];

  const text = content.trim();

  // 1. Check for explicit slash-separated choices in parentheses, e.g. (Ledig / Verheiratet / Geschieden) or (Ja / Nein)
  const parenMatch = text.match(/\(([A-Za-z0-9äöüÄÖÜß\s\-_]+(?:\s*\/\s*[A-Za-z0-9äöüÄÖÜß\s\-_]+)+)\)/i);
  if (parenMatch && parenMatch[1]) {
    const rawOptions = parenMatch[1]
      .split('/')
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0 && opt.length <= 30);
    if (rawOptions.length >= 2 && rawOptions.length <= 8) {
      return rawOptions;
    }
  }

  // 2. Check for Ja/Nein questions
  const isJaNein =
    /\b(ja\s*(?:\/|oder)\s*nein|\(ja\/nein\)|mit ja oder nein)\b/i.test(text) ||
    /\b(ankreuzen|anhaken|anwählen|zutreffend)\b/i.test(text);

  if (isJaNein) {
    return ['Ja', 'Nein'];
  }

  // 3. Check for numbered list choices, e.g. "1) Ledig\n2) Verheiratet" or "1. Ledig\n2. Verheiratet"
  const numberedMatches = [
    ...text.matchAll(/(?:^|\n)\s*(?:\d+[\.\)]|\([0-9]+\))\s*([A-Za-z0-9äöüÄÖÜß\s\-_]{2,30})(?=$|\n|\r)/gi),
  ];
  if (numberedMatches.length >= 2 && numberedMatches.length <= 8) {
    const opts = numberedMatches.map((m) => m[1].trim()).filter(Boolean);
    if (opts.length >= 2) {
      return opts;
    }
  }

  // 4. Match against form fields if available (by topic or step in question)
  if (fields && fields.length > 0) {
    const topicMatch = text.match(/\*\*Schritt \d+ von \d+ \(([^)]+)\):\*\*/i);
    const topic = topicMatch ? topicMatch[1].toLowerCase() : '';

    for (const f of fields) {
      const fDesc = (f.description || '').toLowerCase();
      const fName = f.name.toLowerCase();
      const matchesTopic =
        Boolean(topic) && (fDesc.includes(topic) || topic.includes(fDesc) || fName.includes(topic));

      if (matchesTopic) {
        if (f.options && f.options.length >= 2) {
          return f.options;
        }
        if (f.type === '/Btn') {
          return ['Ja', 'Nein'];
        }
      }
    }
  }

  return [];
}
