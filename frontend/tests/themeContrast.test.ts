import { describe, it, expect } from 'vitest';

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(parseHex(hex1));
  const l2 = getLuminance(parseHex(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('WCAG 2.1 AAA Contrast Ratio Verification', () => {
  const bg = '#000000';
  const textWhite = '#ffffff';
  const textMuted = '#e0e0e0';
  const textDim = '#cccccc';
  const accentYellow = '#ffff00';
  const secondaryCyan = '#00ffff';
  const successGreen = '#00ff66';

  it('guarantees text contrast >= 7:1 against background', () => {
    expect(getContrastRatio(textWhite, bg)).toBeGreaterThanOrEqual(7);
    expect(getContrastRatio(textMuted, bg)).toBeGreaterThanOrEqual(7);
    expect(getContrastRatio(textDim, bg)).toBeGreaterThanOrEqual(7);
  });

  it('guarantees accent and status contrast >= 7:1 against background', () => {
    expect(getContrastRatio(accentYellow, bg)).toBeGreaterThanOrEqual(7);
    expect(getContrastRatio(secondaryCyan, bg)).toBeGreaterThanOrEqual(7);
    expect(getContrastRatio(successGreen, bg)).toBeGreaterThanOrEqual(7);
  });

  it('guarantees accent text contrast >= 7:1 on yellow button', () => {
    expect(getContrastRatio('#000000', accentYellow)).toBeGreaterThanOrEqual(7);
  });
});
