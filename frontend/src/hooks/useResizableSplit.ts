import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'pdf_form_agent_split_ratio';
export const PDF_VISIBLE_KEY = 'pdf_form_agent_pdf_visible';
export const DEFAULT_SPLIT_RATIO = 40; // 40% chat, 60% pdf
export const MIN_SPLIT_RATIO = 25; // min 25% chat
export const MAX_SPLIT_RATIO = 65; // max 65% chat

export function useResizableSplit() {
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= MIN_SPLIT_RATIO && val <= MAX_SPLIT_RATIO) {
          return val;
        }
      }
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
    return DEFAULT_SPLIT_RATIO;
  });

  const [isPdfVisible, setIsPdfVisibleState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(PDF_VISIBLE_KEY);
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {
      // Ignore localStorage errors
    }
    return true;
  });

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDragging = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const resetRatio = useCallback(() => {
    setSplitRatio(DEFAULT_SPLIT_RATIO);
    try {
      localStorage.setItem(STORAGE_KEY, String(DEFAULT_SPLIT_RATIO));
    } catch {
      // Ignore
    }
  }, []);

  const setIsPdfVisible = useCallback((visible: boolean) => {
    setIsPdfVisibleState(visible);
    try {
      localStorage.setItem(PDF_VISIBLE_KEY, String(visible));
    } catch {
      // Ignore
    }
  }, []);

  const togglePdfVisibility = useCallback(() => {
    setIsPdfVisibleState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PDF_VISIBLE_KEY, String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const relativeX = e.clientX - rect.left;
      const rawRatio = (relativeX / rect.width) * 100;
      const clamped = Math.min(Math.max(rawRatio, MIN_SPLIT_RATIO), MAX_SPLIT_RATIO);
      setSplitRatio(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setSplitRatio((current) => {
        try {
          localStorage.setItem(STORAGE_KEY, String(current));
        } catch {
          // Ignore
        }
        return current;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return {
    splitRatio,
    isDragging,
    containerRef,
    startDragging,
    resetRatio,
    isPdfVisible,
    setIsPdfVisible,
    togglePdfVisibility,
  };
}
