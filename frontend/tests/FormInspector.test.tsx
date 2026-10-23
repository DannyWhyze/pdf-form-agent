import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FormInspector } from '../src/components/Form/FormInspector';
import * as client from '../src/api/client';
import { FormField } from '../src/types';

describe('FormInspector Component', () => {
  const sampleFields: FormField[] = [
    {
      name: 'Vorname',
      type: '/Tx',
      description: 'Vorname des Antragstellers',
      value: 'Max',
    },
    {
      name: 'Familienstand',
      type: '/Ch',
      description: 'Familienstand',
      options: ['Ledig', 'Verheiratet', 'Geschieden'],
      value: 'Ledig',
    },
    {
      name: 'Newsletter',
      type: '/Btn',
      description: 'Newsletter abonnieren',
      value: '/Off',
    },
    {
      name: 'Geschlecht',
      type: '/Btn',
      description: 'Geschlecht',
      options: ['männlich', 'weiblich', 'divers'],
      value: 'männlich',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all field controls and initial status correctly', () => {
    render(
      <FormInspector
        threadId="session_1"
        filename="antrag.pdf"
        initialFields={sampleFields}
      />
    );

    expect(screen.getByTestId('form-inspector')).toBeInTheDocument();
    expect(screen.getByText(/Formular-Inspektor/i)).toBeInTheDocument();

    // Check row for Vorname
    const vornameRow = screen.getByTestId('field-row-Vorname');
    expect(vornameRow).toBeInTheDocument();
    expect(screen.getByTestId('field-status-Vorname')).toHaveTextContent('[✓]');

    const vornameInput = screen.getByTestId('field-input-Vorname') as HTMLInputElement;
    expect(vornameInput.value).toBe('Max');

    // Check row for Newsletter (unfilled checkbox)
    expect(screen.getByTestId('field-status-Newsletter')).toHaveTextContent('[ ]');
    const newsInput = screen.getByTestId('field-input-Newsletter') as HTMLInputElement;
    expect(newsInput.checked).toBe(false);

    // Check row for Familienstand (/Ch dropdown)
    const famSelect = screen.getByTestId('field-input-Familienstand') as HTMLSelectElement;
    expect(famSelect.value).toBe('Ledig');
    expect(screen.getByRole('option', { name: 'Verheiratet' })).toBeInTheDocument();
  });

  it('filters fields using search input', () => {
    render(
      <FormInspector
        threadId="session_1"
        filename="antrag.pdf"
        initialFields={sampleFields}
      />
    );

    const searchInput = screen.getByTestId('inspector-search-input');
    fireEvent.change(searchInput, { target: { value: 'Familie' } });

    expect(screen.getByTestId('field-row-Familienstand')).toBeInTheDocument();
    expect(screen.queryByTestId('field-row-Vorname')).not.toBeInTheDocument();
  });

  it('handles field edits and successful saving via fillFormDirect', async () => {
    const onPdfUpdated = vi.fn();
    const onProgressUpdated = vi.fn();

    vi.spyOn(client, 'fillFormDirect').mockResolvedValue({
      status: 'success',
      total_fields: 4,
      filled_fields: 3,
      active_page: 1,
      written_values: { Vorname: 'Moritz' },
    });

    vi.spyOn(client, 'fetchFormFields').mockResolvedValue({
      error: false,
      total_fields: 4,
      filled_fields: 3,
      fields: sampleFields.map((f) => (f.name === 'Vorname' ? { ...f, value: 'Moritz' } : f)),
    });

    render(
      <FormInspector
        threadId="session_1"
        filename="antrag.pdf"
        initialFields={sampleFields}
        onPdfUpdated={onPdfUpdated}
        onProgressUpdated={onProgressUpdated}
      />
    );

    const vornameInput = screen.getByTestId('field-input-Vorname');
    fireEvent.change(vornameInput, { target: { value: 'Moritz' } });

    const saveBtn = screen.getByTestId('inspector-save-btn');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(client.fillFormDirect).toHaveBeenCalledWith(
      'session_1',
      'antrag.pdf',
      expect.objectContaining({ Vorname: 'Moritz' })
    );

    expect(screen.getByText('Änderungen erfolgreich im PDF gespeichert.')).toBeInTheDocument();
    expect(onPdfUpdated).toHaveBeenCalledTimes(1);
    expect(onProgressUpdated).toHaveBeenCalledWith({ filled: 3, total: 4 }, 1);
  });

  it('handles error during saving gracefully', async () => {
    vi.spyOn(client, 'fillFormDirect').mockRejectedValue(new Error('Speichern fehlgeschlagen'));

    render(
      <FormInspector
        threadId="session_1"
        filename="antrag.pdf"
        initialFields={sampleFields}
      />
    );

    const saveBtn = screen.getByTestId('inspector-save-btn');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(screen.getByText('Speichern fehlgeschlagen')).toBeInTheDocument();
  });
});
