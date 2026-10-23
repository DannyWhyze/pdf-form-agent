import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionState } from '../src/hooks/useSessionState';

describe('useSessionState', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('initializes with thread-isolated sessionStorage and recovers state on reload', () => {
    const { result } = renderHook(() => useSessionState());
    expect(result.current.threadId).toBeTruthy();

    act(() => {
      result.current.setActiveFilename('form.pdf');
    });

    expect(result.current.activeFilename).toBe('form.pdf');

    // Simulate F5 reload with same threadId
    const { result: reloaded } = renderHook(() => useSessionState());
    expect(reloaded.current.activeFilename).toBe('form.pdf');
  });

  it('clears URL query parameters on resetSession', () => {
    // Set up window.location with ?thread_id=custom_123
    window.history.pushState({}, '', '/?thread_id=custom_123');
    expect(window.location.search).toBe('?thread_id=custom_123');

    const { result } = renderHook(() => useSessionState());
    expect(result.current.threadId).toBe('custom_123');

    act(() => {
      result.current.resetSession();
    });

    expect(result.current.threadId).not.toBe('custom_123');
    expect(window.location.search).toBe('');
  });

  it('persists and updates selectedModel', () => {
    const { result } = renderHook(() => useSessionState());
    expect(result.current.selectedModel).toBe('');

    act(() => {
      result.current.setSelectedModel('llama3.1:8b');
    });

    expect(result.current.selectedModel).toBe('llama3.1:8b');

    // Simulate F5 reload with same threadId
    const { result: reloaded } = renderHook(() => useSessionState());
    expect(reloaded.current.selectedModel).toBe('llama3.1:8b');

    // Resetting session preserves user selected model
    act(() => {
      reloaded.current.resetSession();
    });
    expect(reloaded.current.selectedModel).toBe('llama3.1:8b');
  });

  it('persists and updates thinkEnabled', () => {
    const { result } = renderHook(() => useSessionState());
    expect(result.current.thinkEnabled).toBe(false);

    act(() => {
      result.current.setThinkEnabled(true);
    });

    expect(result.current.thinkEnabled).toBe(true);

    // Simulate F5 reload with same threadId
    const { result: reloaded } = renderHook(() => useSessionState());
    expect(reloaded.current.thinkEnabled).toBe(true);

    // Resetting session preserves thinkEnabled preference
    act(() => {
      reloaded.current.resetSession();
    });
    expect(reloaded.current.thinkEnabled).toBe(true);
  });

  it('persists and updates formProgress and activePage, and resets them on resetSession', () => {
    const { result } = renderHook(() => useSessionState());
    expect(result.current.formProgress).toBeNull();
    expect(result.current.activePage).toBe(1);

    act(() => {
      result.current.setFormProgress({ filled: 3, total: 10 });
      result.current.setActivePage(2);
    });

    expect(result.current.formProgress).toEqual({ filled: 3, total: 10 });
    expect(result.current.activePage).toBe(2);

    // Simulate F5 reload with same threadId
    const { result: reloaded } = renderHook(() => useSessionState());
    expect(reloaded.current.formProgress).toEqual({ filled: 3, total: 10 });
    expect(reloaded.current.activePage).toBe(2);

    // Reset session should reset formProgress to null and activePage to 1
    act(() => {
      reloaded.current.resetSession();
    });
    expect(reloaded.current.formProgress).toBeNull();
    expect(reloaded.current.activePage).toBe(1);
  });

  it('clears all orphaned session state keys from sessionStorage on resetSession', () => {
    sessionStorage.setItem('pdf_form_agent_state_orphaned_1', JSON.stringify({ activeFilename: 'old1.pdf' }));
    sessionStorage.setItem('pdf_form_agent_state_orphaned_2', JSON.stringify({ activeFilename: 'old2.pdf' }));
    sessionStorage.setItem('other_app_key', 'keep_me');

    const { result } = renderHook(() => useSessionState());

    act(() => {
      result.current.resetSession();
    });

    expect(sessionStorage.getItem('pdf_form_agent_state_orphaned_1')).toBeNull();
    expect(sessionStorage.getItem('pdf_form_agent_state_orphaned_2')).toBeNull();
    expect(sessionStorage.getItem('other_app_key')).toBe('keep_me');
  });
});

