import { useState, useEffect, useCallback } from 'react';
import { ChatMessageData, FormProgress } from '../types';

const LAST_THREAD_KEY = 'pdf_form_agent_last_thread_id';

interface PersistedState {
  threadId: string;
  activeFilename: string | null;
  messages: ChatMessageData[];
  pdfVersion: number;
  selectedModel: string;
  thinkEnabled: boolean;
  formProgress: FormProgress | null;
  activePage: number;
}

function generateThreadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'session_' + crypto.randomUUID();
  }
  return 'session_' + Math.random().toString(36).substring(2, 11);
}

function getStorageKey(threadId: string): string {
  return `pdf_form_agent_state_${threadId}`;
}

export function useSessionState() {
  const [threadId] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('thread_id');
    if (fromUrl) return fromUrl;
    const lastThread = sessionStorage.getItem(LAST_THREAD_KEY);
    if (lastThread) return lastThread;
    return generateThreadId();
  });

  const [state, setState] = useState<PersistedState>(() => {
    try {
      const saved = sessionStorage.getItem(getStorageKey(threadId));
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<PersistedState>;
        return {
          threadId,
          activeFilename: parsed.activeFilename ?? null,
          messages: parsed.messages ?? [],
          pdfVersion: parsed.pdfVersion ?? Date.now(),
          selectedModel: parsed.selectedModel ?? '',
          thinkEnabled: parsed.thinkEnabled ?? false,
          formProgress: parsed.formProgress ?? null,
          activePage: parsed.activePage ?? 1,
        };
      }
    } catch {
      // Fallback on parse error
    }
    return {
      threadId,
      activeFilename: null,
      messages: [],
      pdfVersion: Date.now(),
      selectedModel: '',
      thinkEnabled: false,
      formProgress: null,
      activePage: 1,
    };
  });

  useEffect(() => {
    sessionStorage.setItem(LAST_THREAD_KEY, state.threadId);
    sessionStorage.setItem(getStorageKey(state.threadId), JSON.stringify(state));
  }, [state]);

  const setActiveFilename = useCallback((filename: string | null) => {
    setState((prev) => ({ ...prev, activeFilename: filename }));
  }, []);

  const setMessages = useCallback((messages: ChatMessageData[] | ((prev: ChatMessageData[]) => ChatMessageData[])) => {
    setState((prev) => ({
      ...prev,
      messages: typeof messages === 'function' ? messages(prev.messages) : messages,
    }));
  }, []);

  const bumpPdfVersion = useCallback(() => {
    setState((prev) => ({ ...prev, pdfVersion: Date.now() }));
  }, []);

  const setSelectedModel = useCallback((model: string) => {
    setState((prev) => ({ ...prev, selectedModel: model }));
  }, []);

  const setThinkEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, thinkEnabled: enabled }));
  }, []);

  const setFormProgress = useCallback((progress: FormProgress | null) => {
    setState((prev) => ({ ...prev, formProgress: progress }));
  }, []);

  const setActivePage = useCallback((page: number) => {
    setState((prev) => ({ ...prev, activePage: page }));
  }, []);

  const resetSession = useCallback(() => {
    const newThreadId = generateThreadId();
    sessionStorage.removeItem(getStorageKey(state.threadId));

    if (typeof sessionStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('pdf_form_agent_state_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    }

    sessionStorage.setItem(LAST_THREAD_KEY, newThreadId);

    if (typeof window !== 'undefined' && window.location) {
      const url = new URL(window.location.href);
      if (url.searchParams.has('thread_id')) {
        url.searchParams.delete('thread_id');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
      }
    }

    setState((prev) => ({
      threadId: newThreadId,
      activeFilename: null,
      messages: [],
      pdfVersion: Date.now(),
      selectedModel: prev.selectedModel,
      thinkEnabled: prev.thinkEnabled,
      formProgress: null,
      activePage: 1,
    }));
  }, [state.threadId]);

  return {
    threadId: state.threadId,
    activeFilename: state.activeFilename,
    messages: state.messages,
    pdfVersion: state.pdfVersion,
    selectedModel: state.selectedModel,
    thinkEnabled: state.thinkEnabled,
    formProgress: state.formProgress,
    activePage: state.activePage,
    setSelectedModel,
    setThinkEnabled,
    setActiveFilename,
    setMessages,
    bumpPdfVersion,
    setFormProgress,
    setActivePage,
    resetSession,
  };
}
