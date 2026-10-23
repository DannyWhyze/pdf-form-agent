import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTextScale, TEXT_SCALE_STORAGE_KEY } from '../src/hooks/useTextScale';

describe('useTextScale', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-text-scale');
  });

  it('initializes with default "100" and syncs to document attribute', () => {
    const { result } = renderHook(() => useTextScale());
    expect(result.current.textScale).toBe('100');
    expect(document.documentElement.getAttribute('data-text-scale')).toBe('100');
    expect(localStorage.getItem(TEXT_SCALE_STORAGE_KEY)).toBe('100');
  });

  it('restores "125" and "150" from localStorage on initial render', () => {
    localStorage.setItem(TEXT_SCALE_STORAGE_KEY, '125');
    const { result } = renderHook(() => useTextScale());
    expect(result.current.textScale).toBe('125');
    expect(document.documentElement.getAttribute('data-text-scale')).toBe('125');
  });

  it('falls back to "100" if invalid scale is stored', () => {
    localStorage.setItem(TEXT_SCALE_STORAGE_KEY, '200');
    const { result } = renderHook(() => useTextScale());
    expect(result.current.textScale).toBe('100');
    expect(document.documentElement.getAttribute('data-text-scale')).toBe('100');
  });

  it('updates state and DOM when setTextScale is called', () => {
    const { result } = renderHook(() => useTextScale());
    act(() => {
      result.current.setTextScale('150');
    });
    expect(result.current.textScale).toBe('150');
    expect(document.documentElement.getAttribute('data-text-scale')).toBe('150');
    expect(localStorage.getItem(TEXT_SCALE_STORAGE_KEY)).toBe('150');
  });

  it('cycles through 100 -> 125 -> 150 -> 100 with cycleTextScale', () => {
    const { result } = renderHook(() => useTextScale());
    expect(result.current.textScale).toBe('100');

    act(() => result.current.cycleTextScale());
    expect(result.current.textScale).toBe('125');

    act(() => result.current.cycleTextScale());
    expect(result.current.textScale).toBe('150');

    act(() => result.current.cycleTextScale());
    expect(result.current.textScale).toBe('100');
  });
});
