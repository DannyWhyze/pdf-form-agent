import React from 'react';

export interface ActionChipsProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export const ActionChips: React.FC<ActionChipsProps> = ({ options, onSelect, disabled = false }) => {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="action-chips"
      className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-1"
      role="group"
      aria-label="Schnellauswahl Optionen"
    >
      <span className="text-[10px] font-mono text-app-muted uppercase tracking-wider mr-1">
        Auswahl:
      </span>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(opt)}
          className="rounded-[2px] border border-app-border bg-app-raised px-2.5 py-1 text-xs font-mono font-medium text-app-text hover:border-app-accent hover:bg-app-active hover:text-app-accent active:bg-app-accent active:text-app-accent-contrast transition-colors cursor-pointer shadow-none disabled:opacity-50"
        >
          [ {opt} ]
        </button>
      ))}
    </div>
  );
};
