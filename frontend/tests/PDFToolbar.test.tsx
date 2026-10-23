import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PDFToolbar } from '../src/components/PDFViewer/PDFToolbar';

describe('PDFToolbar', () => {
  it('renders filename and action buttons when a document is active', () => {
    const onRefresh = vi.fn();
    const onClose = vi.fn();

    render(
      <PDFToolbar
        threadId="thread_123"
        filename="antrag.pdf"
        version={1}
        onRefresh={onRefresh}
        onClose={onClose}
      />
    );

    expect(screen.getByText('antrag.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders default text and close button when no document is active', () => {
    const onClose = vi.fn();

    render(
      <PDFToolbar
        threadId="thread_123"
        filename={null}
        version={1}
        onRefresh={vi.fn()}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Kein Dokument geladen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders progress badge and active page badge when provided', () => {
    render(
      <PDFToolbar
        threadId="thread_123"
        filename="formular.pdf"
        version={1}
        progress={{ filled: 7, total: 24 }}
        activePage={3}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText('[PROGRESS: 7/24 (29%)]')).toBeInTheDocument();
    expect(screen.getByText('[PAGE 3]')).toBeInTheDocument();
  });

  it('does not render progress or page badge when total is 0 or page is 1', () => {
    render(
      <PDFToolbar
        threadId="thread_123"
        filename="formular.pdf"
        version={1}
        progress={{ filled: 0, total: 0 }}
        activePage={1}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.queryByText(/PROGRESS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PAGE/)).not.toBeInTheDocument();
  });
});
