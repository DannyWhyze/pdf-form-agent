import { useState, useEffect, useCallback } from 'react';
import { TextScale } from '../types';

export const TEXT_SCALE_STORAGE_KEY = 'pdf_form_agent_text_scale';

function getInitialTextScale(): TextScale {
  if (typeof window === 'undefined') return '100';
  try {
    const saved = localStorage.getItem(TEXT_SCALE_STORAGE_KEY);
    if (saved === '100' || saved === '125' || saved === '150') {
      return saved;
    }
  } catch {
    // ignore storage access error
  }
  return '100';
}

export function useTextScale() {
  const [textScale, setTextScaleState] = useState<TextScale>(getInitialTextScale);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-text-scale', textScale);
    }
    try {
      localStorage.setItem(TEXT_SCALE_STORAGE_KEY, textScale);
    } catch {
      // ignore storage access error
    }
  }, [textScale]);

  const setTextScale = useCallback((scale: TextScale) => {
    setTextScaleState(scale);
  }, []);

  const cycleTextScale = useCallback(() => {
    setTextScaleState((prev) => {
      if (prev === '100') return '125';
      if (prev === '125') return '150';
      return '100';
    });
  }, []);

  return {
    textScale,
    setTextScale,
    cycleTextScale,
  };
}
