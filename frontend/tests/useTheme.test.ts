import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme, THEME_STORAGE_KEY } from '../src/hooks/useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('initializes with default "live" theme and syncs to document attribute', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('live');
    expect(document.documentElement.getAttribute('data-theme')).toBe('live');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('live');
  });

  it('restores "paper" theme from localStorage on initial render', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'paper');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('paper');
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
  });

  it('restores "contrast" theme from localStorage on initial render', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'contrast');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('contrast');
    expect(document.documentElement.getAttribute('data-theme')).toBe('contrast');
  });

  it('falls back to "live" if invalid theme value is stored in localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('live');
    expect(document.documentElement.getAttribute('data-theme')).toBe('live');
  });

  it('updates state, document attribute and localStorage on setTheme', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('live');

    act(() => {
      result.current.setTheme('paper');
    });

    expect(result.current.theme).toBe('paper');
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('paper');

    act(() => {
      result.current.setTheme('contrast');
    });

    expect(result.current.theme).toBe('contrast');
    expect(document.documentElement.getAttribute('data-theme')).toBe('contrast');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('contrast');

    act(() => {
      result.current.setTheme('live');
    });

    expect(result.current.theme).toBe('live');
    expect(document.documentElement.getAttribute('data-theme')).toBe('live');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('live');
  });

  it('cycles through "live" -> "paper" -> "contrast" -> "live" using toggleTheme', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('live');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('paper');
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('paper');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('contrast');
    expect(document.documentElement.getAttribute('data-theme')).toBe('contrast');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('contrast');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('live');
    expect(document.documentElement.getAttribute('data-theme')).toBe('live');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('live');
  });
});
