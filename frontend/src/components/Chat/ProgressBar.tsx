import React from 'react';
import { FormProgress } from '../../types';

export interface ProgressBarProps {
  progress?: FormProgress | null;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  if (!progress || progress.total <= 0) {
    return null;
  }

  const filled = Math.max(0, Math.min(progress.filled, progress.total));
  const total = progress.total;
  const currentStep = Math.min(filled + 1, total);
  const percentage = Math.round((filled / total) * 100);
  const isCompleted = filled >= total;

  return (
    <div
      role="progressbar"
      aria-valuenow={filled}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label="Formular-Ausfüllfortschritt"
      className="border-b border-app-border bg-app-surface px-3 py-2 font-mono text-[11px] select-none shrink-0"
    >
      <div className="flex justify-between items-center mb-1">
        <span className="text-app-text font-medium tracking-wider">
          {isCompleted
            ? `[FORTSCHRITT: ${total}/${total} FELDER ABGESCHLOSSEN]`
            : `[FORTSCHRITT: SCHRITT ${currentStep} VON ${total}]`}
        </span>
        <span
          className={`font-bold ${
            isCompleted ? 'text-app-success' : 'text-app-accent'
          }`}
        >
          {percentage}%
        </span>
      </div>
      <div className="h-1.5 w-full bg-app-raised border border-app-border rounded-[1px] overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isCompleted ? 'bg-app-success' : 'bg-app-accent'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
