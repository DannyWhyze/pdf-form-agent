import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../src/components/Chat/ProgressBar';

describe('ProgressBar', () => {
  it('renders nothing when progress is null', () => {
    const { container } = render(<ProgressBar progress={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when progress.total is 0', () => {
    const { container } = render(<ProgressBar progress={{ filled: 0, total: 0 }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders active step counter, percentage, and progressbar attributes', () => {
    render(<ProgressBar progress={{ filled: 3, total: 12 }} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '12');
    expect(bar).toHaveAttribute('aria-label', 'Formular-Ausfüllfortschritt');

    expect(screen.getByText('[FORTSCHRITT: SCHRITT 4 VON 12]')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();

    const indicator = bar.querySelector('.bg-app-accent');
    expect(indicator).toHaveStyle({ width: '25%' });
  });

  it('renders completed state when all fields are filled', () => {
    render(<ProgressBar progress={{ filled: 12, total: 12 }} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '12');
    expect(screen.getByText('[FORTSCHRITT: 12/12 FELDER ABGESCHLOSSEN]')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();

    const indicator = bar.querySelector('.bg-app-success');
    expect(indicator).toHaveStyle({ width: '100%' });
  });
});
