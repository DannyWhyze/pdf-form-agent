import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DocumentUploader } from '../src/components/Upload/DocumentUploader';
import * as client from '../src/api/client';

describe('DocumentUploader', () => {
  it('renders upload trigger area', () => {
    render(<DocumentUploader threadId="session_123" onUploadSuccess={vi.fn()} />);
    expect(screen.getByText('PDF-Formular hier ablegen oder auswählen')).toBeInTheDocument();
  });

  it('resets file input value after selection', async () => {
    vi.spyOn(client, 'uploadDocument').mockResolvedValue({
      status: 'success',
      message: 'Uploaded',
      filename: 'sample.pdf',
      thread_id: 'session_123',
      local_path: '/path/sample.pdf',
      fields_summary: { error: false, total_fields: 1, fields: [] },
    });

    const { container } = render(
      <DocumentUploader threadId="session_123" onUploadSuccess={vi.fn()} />
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    const file = new File(['dummy'], 'sample.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    // The value on the input should have been reset to ''
    expect(input.value).toBe('');
  });

  it('displays upload error and resets error when threadId changes (New Session)', async () => {
    vi.spyOn(client, 'uploadDocument').mockRejectedValue(
      new Error('Upload failed (413): {"detail":"File too large (max. 25 MB)."}')
    );

    const { container, rerender } = render(
      <DocumentUploader threadId="session_1" onUploadSuccess={vi.fn()} />
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy'], 'too_large.pdf', { type: 'application/pdf' });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(
      screen.getByText('Upload failed (413): {"detail":"File too large (max. 25 MB)."}')
    ).toBeInTheDocument();

    // Simulate New Session: threadId changes to session_2
    rerender(<DocumentUploader threadId="session_2" onUploadSuccess={vi.fn()} />);

    expect(
      screen.queryByText('Upload failed (413): {"detail":"File too large (max. 25 MB)."}')
    ).not.toBeInTheDocument();
  });

  it('renders autofill toggle and handles toggling and profile indicator correctly', () => {
    const onToggleAutofill = vi.fn();

    const { rerender } = render(
      <DocumentUploader
        threadId="session_1"
        onUploadSuccess={vi.fn()}
        autofillEnabled={true}
        onToggleAutofill={onToggleAutofill}
        hasUserProfile={true}
      />
    );

    const toggleBtn = screen.getByTestId('autofill-toggle');
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent('Autofill: ON');
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Stammdaten aktiv')).toBeInTheDocument();
    expect(screen.getByText('Profil vorhanden')).toBeInTheDocument();
    expect(screen.getByTestId('profile-indicator-dot')).toHaveClass('bg-app-success');

    fireEvent.click(toggleBtn);
    expect(onToggleAutofill).toHaveBeenCalledWith(false);

    rerender(
      <DocumentUploader
        threadId="session_1"
        onUploadSuccess={vi.fn()}
        autofillEnabled={false}
        onToggleAutofill={onToggleAutofill}
        hasUserProfile={false}
      />
    );

    expect(toggleBtn).toHaveTextContent('Autofill: OFF');
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Leeres Formular')).toBeInTheDocument();
    expect(screen.getByText('Kein Profil')).toBeInTheDocument();
    expect(screen.getByTestId('profile-indicator-dot')).toHaveClass('bg-app-border');

    fireEvent.click(toggleBtn);
    expect(onToggleAutofill).toHaveBeenCalledWith(true);
  });

  it('defaults autofill toggle to OFF when prop is omitted', () => {
    render(<DocumentUploader threadId="session_default" onUploadSuccess={vi.fn()} />);
    const toggleBtn = screen.getByTestId('autofill-toggle');
    expect(toggleBtn).toHaveTextContent('Autofill: OFF');
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Leeres Formular')).toBeInTheDocument();
  });
});
