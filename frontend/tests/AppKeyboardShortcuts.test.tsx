import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../src/App';

vi.mock('../src/api/client', () => ({
  checkHealth: vi.fn().mockResolvedValue(true),
  checkSTTHealth: vi.fn().mockResolvedValue(true),
  checkTTSHealth: vi.fn().mockResolvedValue(true),
  fetchAvailableModels: vi.fn().mockResolvedValue({ models: [] }),
  getPdfPreviewUrl: vi.fn().mockReturnValue('http://localhost:8001/download/test.pdf'),
  getPdfDownloadUrl: vi.fn().mockReturnValue('http://localhost:8001/download/test.pdf'),
  fetchUserProfile: vi.fn().mockResolvedValue({ exists: false, content: '', updated_at: null }),
  saveUserProfile: vi.fn().mockResolvedValue({ status: 'success', updated_at: '2026-10-20T12:00:00Z' }),
  deleteUserProfile: vi.fn().mockResolvedValue({ status: 'success' }),
  fetchFormFields: vi.fn().mockResolvedValue({ error: false, total_fields: 0, filled_fields: 0, fields: [] }),
  fillFormDirect: vi.fn().mockResolvedValue({ status: 'success', total_fields: 0, filled_fields: 0 }),
}));

vi.mock('../src/hooks/useChatStream', () => ({
  useChatStream: vi.fn().mockReturnValue({
    isStreaming: false,
    error: null,
    sendMessage: vi.fn(),
    stopStream: vi.fn(),
  }),
}));

describe('App Keyboard Shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    const testThreadId = 'session_test_123';
    sessionStorage.setItem('pdf_form_agent_last_thread_id', testThreadId);
    sessionStorage.setItem(
      `pdf_form_agent_state_${testThreadId}`,
      JSON.stringify({
        activeFilename: 'antrag.pdf',
        messages: [],
      })
    );
  });

  it('toggles shortcuts modal with ? when no input is focused, and does not trigger when textarea is focused', async () => {
    await act(async () => {
      render(<App />);
    });

    // Initially modal is not open
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Focus on textarea (chat input)
    const textarea = screen.getByRole('textbox');
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    // Press ? while focused in textarea -> STOP 1: must NOT open modal!
    act(() => {
      fireEvent.keyDown(window, { key: '?' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Blur textarea
    textarea.blur();
    expect(document.activeElement).not.toBe(textarea);

    // Press ? when not focused -> Opens modal
    act(() => {
      fireEvent.keyDown(window, { key: '?' });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/tastaturkürzel \/ shortcuts/i)).toBeInTheDocument();

    // Press Escape -> Closes modal
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cycles theme through live -> paper -> contrast -> live with Alt+T', async () => {
    await act(async () => {
      render(<App />);
    });

    // Default theme is live
    expect(document.documentElement.getAttribute('data-theme')).toBe('live');

    // Press Alt+T -> switches to paper
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 't', code: 'KeyT' });
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('paper');

    // Press Alt+T again -> switches to contrast
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 't', code: 'KeyT' });
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('contrast');

    // Press Alt+T third time -> switches back to live
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 't', code: 'KeyT' });
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('live');
  });

  it('cycles text scale through 100 -> 125 -> 150 -> 100 with Alt+S', async () => {
    await act(async () => {
      render(<App />);
    });

    // Default text-scale is 100
    expect(document.documentElement.getAttribute('data-text-scale')).toBe('100');

    // Press Alt+S -> 125
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 's', code: 'KeyS' });
    });
    expect(document.documentElement.getAttribute('data-text-scale')).toBe('125');

    // Press Alt+S -> 150
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 's', code: 'KeyS' });
    });
    expect(document.documentElement.getAttribute('data-text-scale')).toBe('150');

    // Press Alt+S -> 100
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 's', code: 'KeyS' });
    });
    expect(document.documentElement.getAttribute('data-text-scale')).toBe('100');
  });

  it('toggles PDF visibility with Alt+P', async () => {
    await act(async () => {
      render(<App />);
    });

    // Initially PDF is visible
    expect(screen.getByRole('button', { name: /pdf ausblenden/i })).toBeInTheDocument();

    // Press Alt+P -> hides PDF
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 'p', code: 'KeyP' });
    });
    expect(screen.getByRole('button', { name: /pdf anzeigen/i })).toBeInTheDocument();

    // Press Alt+P again -> restores PDF
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 'p', code: 'KeyP' });
    });
    expect(screen.getByRole('button', { name: /pdf ausblenden/i })).toBeInTheDocument();
  });

  it('renders ProgressBar in the chat pane when formProgress is present', async () => {
    sessionStorage.setItem(
      'pdf_form_agent_state_session_test_123',
      JSON.stringify({
        activeFilename: 'antrag.pdf',
        messages: [],
        formProgress: { filled: 2, total: 5 },
      })
    );

    await act(async () => {
      render(<App />);
    });

    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('[FORTSCHRITT: SCHRITT 3 VON 5]')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('toggles UserProfileModal with Alt+U and closes on Escape', async () => {
    await act(async () => {
      render(<App />);
    });

    // Initially modal is closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Press Alt+U -> opens modal
    await act(async () => {
      fireEvent.keyDown(window, { altKey: true, key: 'u', code: 'KeyU' });
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/stammdaten \/ profil-notizen/i)).toBeInTheDocument();

    // Press Escape -> closes modal
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles TTS on and off with Alt+V', async () => {
    await act(async () => {
      render(<App />);
    });

    const ttsToggle = screen.getByTestId('tts-toggle');
    expect(ttsToggle).toHaveTextContent('TTS: ON');

    // Press Alt+V -> toggles to OFF
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 'v', code: 'KeyV' });
    });
    expect(ttsToggle).toHaveTextContent('TTS: OFF');
    expect(localStorage.getItem('pdf_form_agent_tts_enabled')).toBe('false');

    // Press Alt+V -> toggles back to ON
    act(() => {
      fireEvent.keyDown(window, { altKey: true, key: 'v', code: 'KeyV' });
    });
    expect(ttsToggle).toHaveTextContent('TTS: ON');
    expect(localStorage.getItem('pdf_form_agent_tts_enabled')).toBe('true');
  });

  it('persists selected voice in localStorage and triggers preview on voice change and probe click', async () => {
    localStorage.setItem('pdf_form_agent_tts_voice', 'ger_uwe_newsreader_male');

    await act(async () => {
      render(<App />);
    });

    const voiceSelect = screen.getByTestId('voice-select') as HTMLSelectElement;
    expect(voiceSelect.value).toBe('ger_uwe_newsreader_male');

    // Change to Jonas
    act(() => {
      fireEvent.change(voiceSelect, { target: { value: 'ger_jonas_casual_male' } });
    });

    expect(voiceSelect.value).toBe('ger_jonas_casual_male');
    expect(localStorage.getItem('pdf_form_agent_tts_voice')).toBe('ger_jonas_casual_male');

    // Click Probe button
    const probeBtn = screen.getByTestId('voice-preview-btn');
    act(() => {
      fireEvent.click(probeBtn);
    });
    expect(probeBtn).not.toBeDisabled();
  });

  it('defaults autofill toggle to OFF and persists changes in localStorage', async () => {
    await act(async () => {
      render(<App />);
    });

    const autofillBtn = screen.getByTestId('autofill-toggle');
    expect(autofillBtn).toHaveTextContent('Autofill: OFF');
    expect(screen.getByText('Leeres Formular')).toBeInTheDocument();

    // Toggle to ON
    act(() => {
      fireEvent.click(autofillBtn);
    });
    expect(autofillBtn).toHaveTextContent('Autofill: ON');
    expect(screen.getByText('Stammdaten aktiv')).toBeInTheDocument();
    expect(localStorage.getItem('pdf_form_agent_autofill_enabled')).toBe('true');
  });

  it('toggles workspace view between chat and formular with Alt+M and view buttons', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByTestId('view-chat-btn')).toBeInTheDocument();
    expect(screen.getByTestId('view-form-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('form-inspector')).not.toBeInTheDocument();

    // Press Alt+M -> switches to form inspector
    await act(async () => {
      fireEvent.keyDown(window, { altKey: true, key: 'm', code: 'KeyM' });
    });

    expect(screen.getByTestId('form-inspector')).toBeInTheDocument();

    // Click CHAT button -> switches back to chat
    act(() => {
      fireEvent.click(screen.getByTestId('view-chat-btn'));
    });

    expect(screen.queryByTestId('form-inspector')).not.toBeInTheDocument();
  });
});
