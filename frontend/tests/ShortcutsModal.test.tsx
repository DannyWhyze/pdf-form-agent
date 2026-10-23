import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutsModal } from '../src/components/Modal/ShortcutsModal';

describe('ShortcutsModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(<ShortcutsModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders all shortcuts when isOpen is true', () => {
    render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

    // Header & dialog semantics
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/tastaturkürzel \/ shortcuts/i)).toBeInTheDocument();

    // Section headers
    expect(screen.getByText(/chat & spracheingabe/i)).toBeInTheDocument();
    expect(screen.getByText(/sprachbefehle \(freihand \/ diktat\)/i)).toBeInTheDocument();
    expect(screen.getByText(/ansicht & workspace/i)).toBeInTheDocument();

    // Action labels
    expect(screen.getByText('Nachricht senden')).toBeInTheDocument();
    expect(screen.getByText('Zeilenumbruch')).toBeInTheDocument();
    expect(screen.getByText('Diktat / Spracheingabe')).toBeInTheDocument();
    expect(screen.getByText('Auto-Send bei Sprechpause')).toBeInTheDocument();
    expect(screen.getByText('Eingabe abschicken')).toBeInTheDocument();
    expect(screen.getByText('Frage wiederholen')).toBeInTheDocument();
    expect(screen.getByText('PDF herunterladen')).toBeInTheDocument();
    expect(screen.getByText('Schritt zurück')).toBeInTheDocument();
    expect(screen.getByText('PDF ausblenden / anzeigen')).toBeInTheDocument();
    expect(screen.getByText('Stammdaten / Profil-Editor')).toBeInTheDocument();
    expect(screen.getByText('Theme wechseln (Live / Paper / Contrast)')).toBeInTheDocument();
    expect(screen.getByText('Textgröße anpassen (100% / 125% / 150%)')).toBeInTheDocument();
    expect(screen.getByText('Shortcuts-Hilfe öffnen')).toBeInTheDocument();
    expect(screen.getAllByText('Schließen').length).toBeGreaterThan(0);

    // Key badges
    expect(screen.getAllByText('Enter').length).toBeGreaterThan(0);
    expect(screen.getByText('Shift')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByText('Esc')).toBeInTheDocument();
  });

  it('calls onClose when clicking close button', () => {
    const onClose = vi.fn();
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /schließen/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking backdrop', () => {
    const onClose = vi.fn();
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);

    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking modal content', () => {
    const onClose = vi.fn();
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);

    const heading = screen.getByText(/tastaturkürzel \/ shortcuts/i);
    fireEvent.click(heading);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when pressing Escape key', () => {
    const onClose = vi.fn();
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
