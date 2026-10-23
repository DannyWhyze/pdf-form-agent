import React, { useState } from 'react';

interface ReasoningBlockProps {
  reasoning: string;
}

export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ reasoning }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!reasoning.trim()) return null;

  return (
    <div className="mb-2 rounded-[2px] border border-app-border bg-app-bg text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-app-muted hover:text-app-text transition-colors cursor-pointer font-mono"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-app-accent tracking-wide">
          <span className="text-[10px] text-app-muted">{isOpen ? '▼' : '▶'}</span>
          Thought Process
        </span>
        <span className="text-[10px] text-app-dim">{isOpen ? 'COLLAPSE' : 'EXPAND'}</span>
      </button>
      {isOpen && (
        <div className="px-3 pb-2.5 pt-1.5 text-app-text font-mono text-[11px] whitespace-pre-wrap leading-relaxed border-t border-app-border bg-app-bg">
          {reasoning}
        </div>
      )}
    </div>
  );
};
