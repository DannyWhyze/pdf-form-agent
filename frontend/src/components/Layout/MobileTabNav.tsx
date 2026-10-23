import React from 'react';

interface MobileTabNavProps {
  activeTab: 'chat' | 'pdf';
  onTabChange: (tab: 'chat' | 'pdf') => void;
  hasPdfUpdate?: boolean;
}

export const MobileTabNav: React.FC<MobileTabNavProps> = ({ activeTab, onTabChange, hasPdfUpdate }) => {
  return (
    <div className="flex md:hidden border-b border-app-border bg-app-surface">
      <button
        type="button"
        onClick={() => onTabChange('chat')}
        className={`flex flex-1 items-center justify-center py-2.5 text-xs font-mono font-medium border-b-2 transition-colors cursor-pointer ${
          activeTab === 'chat'
            ? 'border-app-accent text-app-accent bg-app-raised/50'
            : 'border-transparent text-app-muted hover:text-app-text'
        }`}
      >
        Assistent
      </button>

      <button
        type="button"
        onClick={() => onTabChange('pdf')}
        className={`flex flex-1 items-center justify-center py-2.5 text-xs font-mono font-medium border-b-2 relative transition-colors cursor-pointer ${
          activeTab === 'pdf'
            ? 'border-app-accent text-app-accent bg-app-raised/50'
            : 'border-transparent text-app-muted hover:text-app-text'
        }`}
      >
        PDF Vorschau
        {hasPdfUpdate && (
          <span className="absolute top-2.5 right-6 h-1.5 w-1.5 rounded-[1px] bg-app-accent" />
        )}
      </button>
    </div>
  );
};
