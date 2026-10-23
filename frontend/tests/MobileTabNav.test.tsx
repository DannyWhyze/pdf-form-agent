import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileTabNav } from '../src/components/Layout/MobileTabNav';

describe('MobileTabNav', () => {
  it('switches between assistant and pdf preview tabs', async () => {
    const onTabChange = vi.fn();
    render(<MobileTabNav activeTab="chat" onTabChange={onTabChange} hasPdfUpdate={true} />);

    expect(screen.getByText('Assistent')).toBeInTheDocument();
    expect(screen.getByText('PDF Vorschau')).toBeInTheDocument();

    await userEvent.click(screen.getByText('PDF Vorschau'));
    expect(onTabChange).toHaveBeenCalledWith('pdf');
  });
});
