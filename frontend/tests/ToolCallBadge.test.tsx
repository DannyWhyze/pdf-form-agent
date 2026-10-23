import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolCallBadge } from '../src/components/Chat/ToolCallBadge';

describe('ToolCallBadge', () => {
  it('renders collapsed state with tool name and compact summary', () => {
    render(
      <ToolCallBadge
        toolCall={{
          name: 'fill_pdf_form',
          status: 'completed',
          args: {
            filepath: 'test_form_3.pdf',
            field_values: { txt_name: 'Max Mustermann' },
          },
          result: JSON.stringify({
            status: 'success',
            written_values: { txt_name: 'Max Mustermann' },
          }),
        }}
      />
    );

    expect(screen.getByText('Tool: fill_pdf_form')).toBeInTheDocument();
    expect(screen.getByText('(txt_name: "Max Mustermann")')).toBeInTheDocument();
    expect(screen.getByText('[DONE]')).toBeInTheDocument();
    expect(screen.getByText('DETAILS')).toBeInTheDocument();

    // Details must not be visible initially
    expect(screen.queryByText('[INPUT]')).not.toBeInTheDocument();
    expect(screen.queryByText('[OUTPUT]')).not.toBeInTheDocument();
  });

  it('toggles expansion on click to show input arguments and output results', () => {
    render(
      <ToolCallBadge
        toolCall={{
          name: 'fill_pdf_form',
          status: 'completed',
          args: {
            field_values: { txt_name: 'Max Mustermann' },
          },
          result: JSON.stringify({
            status: 'success',
            filled_fields: 1,
            total_fields: 6,
          }),
        }}
      />
    );

    const toggleButton = screen.getByRole('button');
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('[INPUT]')).toBeInTheDocument();
    expect(screen.getByText('[OUTPUT]')).toBeInTheDocument();
    expect(screen.getByText('COLLAPSE')).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('[INPUT]')).not.toBeInTheDocument();
    expect(screen.queryByText('[OUTPUT]')).not.toBeInTheDocument();
  });

  it('renders running status correctly with active indicator', () => {
    render(
      <ToolCallBadge
        toolCall={{
          name: 'read_pdf_form',
          status: 'running',
          args: { filepath: 'antrag.pdf' },
        }}
      />
    );

    expect(screen.getByText('Tool: read_pdf_form')).toBeInTheDocument();
    expect(screen.getByText('(antrag.pdf)')).toBeInTheDocument();
    expect(screen.getByText('[RUNNING]')).toBeInTheDocument();
  });

  it('summarizes multiple fields cleanly', () => {
    render(
      <ToolCallBadge
        toolCall={{
          name: 'fill_pdf_form',
          status: 'completed',
          args: {
            field_values: {
              txt_vorname: 'Max',
              txt_nachname: 'Mustermann',
            },
          },
        }}
      />
    );

    expect(screen.getByText('(2 Felder befüllt)')).toBeInTheDocument();
  });

  it('handles error status with error badge', () => {
    render(
      <ToolCallBadge
        toolCall={{
          name: 'fill_pdf_form',
          status: 'error',
          args: { filepath: 'invalid.pdf' },
          result: 'Error: File not found',
        }}
      />
    );

    expect(screen.getByText('[ERR]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Error: File not found')).toBeInTheDocument();
  });
});
