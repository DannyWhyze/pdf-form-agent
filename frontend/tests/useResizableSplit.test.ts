import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useResizableSplit,
  DEFAULT_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
} from '../src/hooks/useResizableSplit';

describe('useResizableSplit', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('initializes with default ratio of 40', () => {
    const { result } = renderHook(() => useResizableSplit());
    expect(result.current.splitRatio).toBe(DEFAULT_SPLIT_RATIO);
    expect(result.current.isDragging).toBe(false);
  });

  it('restores persisted split ratio from localStorage within bounds', () => {
    localStorage.setItem('pdf_form_agent_split_ratio', '55');
    const { result } = renderHook(() => useResizableSplit());
    expect(result.current.splitRatio).toBe(55);
  });

  it('resets ratio to default on resetRatio() call', () => {
    localStorage.setItem('pdf_form_agent_split_ratio', '60');
    const { result } = renderHook(() => useResizableSplit());
    expect(result.current.splitRatio).toBe(60);

    act(() => {
      result.current.resetRatio();
    });

    expect(result.current.splitRatio).toBe(DEFAULT_SPLIT_RATIO);
    expect(localStorage.getItem('pdf_form_agent_split_ratio')).toBe(String(DEFAULT_SPLIT_RATIO));
  });

  it('handles drag lifecycle and clamps ratio between min and max bounds', () => {
    const { result } = renderHook(() => useResizableSplit());

    // Mock container rect
    Object.defineProperty(result.current.containerRef, 'current', {
      value: {
        getBoundingClientRect: () => ({ left: 0, width: 1000 }),
      },
      writable: true,
    });

    act(() => {
      result.current.startDragging({ preventDefault: vi.fn() } as any);
    });

    expect(result.current.isDragging).toBe(true);

    // Simulate mouse move to 500px (50%)
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }));
    });
    expect(result.current.splitRatio).toBe(50);

    // Simulate mouse move exceeding max bound (e.g. 800px = 80% -> clamped to MAX_SPLIT_RATIO 65%)
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 800 }));
    });
    expect(result.current.splitRatio).toBe(MAX_SPLIT_RATIO);

    // Simulate mouse move below min bound (e.g. 100px = 10% -> clamped to MIN_SPLIT_RATIO 25%)
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 }));
    });
    expect(result.current.splitRatio).toBe(MIN_SPLIT_RATIO);

    // End drag
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(result.current.isDragging).toBe(false);
    expect(localStorage.getItem('pdf_form_agent_split_ratio')).toBe(String(MIN_SPLIT_RATIO));
  });

  it('manages isPdfVisible state, persistence, and toggling', () => {
    const { result } = renderHook(() => useResizableSplit());
    expect(result.current.isPdfVisible).toBe(true);

    act(() => {
      result.current.togglePdfVisibility();
    });
    expect(result.current.isPdfVisible).toBe(false);
    expect(localStorage.getItem('pdf_form_agent_pdf_visible')).toBe('false');

    act(() => {
      result.current.setIsPdfVisible(true);
    });
    expect(result.current.isPdfVisible).toBe(true);
    expect(localStorage.getItem('pdf_form_agent_pdf_visible')).toBe('true');

    // Test restoring from localStorage on mount
    localStorage.setItem('pdf_form_agent_pdf_visible', 'false');
    const { result: reloaded } = renderHook(() => useResizableSplit());
    expect(reloaded.current.isPdfVisible).toBe(false);
  });
});

