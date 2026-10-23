import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionChips } from '../src/components/Chat/ActionChips';

describe('ActionChips Component', () => {
  it('renders nothing when options list is empty', () => {
    const { container } = render(<ActionChips options={[]} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders options as clickable monospace action chips', () => {
    const onSelect = vi.fn();
    render(<ActionChips options={['Ja', 'Nein']} onSelect={onSelect} />);

    expect(screen.getByTestId('action-chips')).toBeInTheDocument();
    expect(screen.getByText('Auswahl:')).toBeInTheDocument();

    const jaBtn = screen.getByRole('button', { name: /\[ Ja \]/i });
    const neinBtn = screen.getByRole('button', { name: /\[ Nein \]/i });

    expect(jaBtn).toBeInTheDocument();
    expect(neinBtn).toBeInTheDocument();

    fireEvent.click(jaBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('Ja');

    fireEvent.click(neinBtn);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith('Nein');
  });

  it('disables all chip buttons when disabled prop is true (e.g. streaming)', () => {
    const onSelect = vi.fn();
    render(<ActionChips options={['Option 1', 'Option 2']} onSelect={onSelect} disabled={true} />);

    const btn1 = screen.getByRole('button', { name: /\[ Option 1 \]/i });
    const btn2 = screen.getByRole('button', { name: /\[ Option 2 \]/i });

    expect(btn1).toBeDisabled();
    expect(btn2).toBeDisabled();

    fireEvent.click(btn1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
