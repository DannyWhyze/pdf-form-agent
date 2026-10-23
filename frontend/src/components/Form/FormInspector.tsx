import React, { useState, useEffect, useMemo } from 'react';
import { fillFormDirect, fetchFormFields } from '../../api/client';
import { FormField } from '../../types';

export interface FormInspectorProps {
  threadId: string;
  filename: string;
  initialFields?: FormField[];
  onFieldsUpdated?: (fields: FormField[]) => void;
  onPdfUpdated?: () => void;
  onProgressUpdated?: (progress: { filled: number; total: number }, activePage?: number) => void;
}

export const FormInspector: React.FC<FormInspectorProps> = ({
  threadId,
  filename,
  initialFields = [],
  onFieldsUpdated,
  onPdfUpdated,
  onProgressUpdated,
}) => {
  const [fields, setFields] = useState<FormField[]>(initialFields);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Synchronize internal values map whenever fields change
  const syncValuesFromFields = (fieldList: FormField[]) => {
    const valMap: Record<string, string | boolean> = {};
    for (const f of fieldList) {
      if (f.type === '/Btn') {
        const raw = String(f.value || '');
        valMap[f.name] = raw !== '' && raw !== '/Off' && raw !== 'false';
      } else {
        valMap[f.name] = f.value || '';
      }
    }
    setValues(valMap);
  };

  // Load latest fields from backend on mount or when filename/threadId changes
  const loadFields = async () => {
    if (!filename) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetchFormFields(threadId, filename);
      if (!res.error && res.fields) {
        setFields(res.fields);
        syncValuesFromFields(res.fields);
        onFieldsUpdated?.(res.fields);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fehler beim Laden der Felder';
      setStatusMessage({ text: msg, isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialFields && initialFields.length > 0) {
      setFields(initialFields);
      syncValuesFromFields(initialFields);
    } else {
      loadFields();
    }
  }, [threadId, filename]);

  const handleChange = (fieldName: string, value: string | boolean) => {
    setValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleSave = async () => {
    if (!filename || isSaving) return;
    setIsSaving(true);
    setStatusMessage(null);

    try {
      const res = await fillFormDirect(threadId, filename, values);
      if (res.status === 'success') {
        setStatusMessage({ text: 'Änderungen erfolgreich im PDF gespeichert.' });
        onPdfUpdated?.();
        onProgressUpdated?.(
          { filled: res.filled_fields, total: res.total_fields },
          res.active_page
        );
        // Reload fields to get exact fresh canonical state from PDF
        const fresh = await fetchFormFields(threadId, filename);
        if (!fresh.error && fresh.fields) {
          setFields(fresh.fields);
          syncValuesFromFields(fresh.fields);
          onFieldsUpdated?.(fresh.fields);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fehler beim Speichern';
      setStatusMessage({ text: msg, isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    loadFields();
  };

  const filteredFields = useMemo(() => {
    if (!searchTerm.trim()) return fields;
    const q = searchTerm.toLowerCase();
    return fields.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q))
    );
  }, [fields, searchTerm]);

  const filledCount = useMemo(() => {
    return fields.reduce((acc, f) => {
      const val = values[f.name];
      if (typeof val === 'boolean') {
        return val ? acc + 1 : acc;
      }
      return val && String(val).trim() && String(val) !== '/Off' ? acc + 1 : acc;
    }, 0);
  }, [fields, values]);

  const totalCount = fields.length;
  const percent = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

  return (
    <div
      data-testid="form-inspector"
      className="flex flex-col flex-1 h-full min-h-0 bg-app-surface text-app-text font-mono"
    >
      {/* Header bar with Search and Status summary */}
      <div className="p-3 border-b border-app-border bg-app-bg flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-app-text uppercase tracking-wider">
            Formular-Inspektor
          </span>
          <span className="text-[11px] text-app-muted">
            ({filledCount}/{totalCount} befüllt &middot; {percent}%)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            data-testid="inspector-search-input"
            placeholder="Feld suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-[2px] border border-app-border bg-app-raised px-2 py-0.5 text-xs font-mono text-app-text focus:border-app-accent focus:outline-hidden max-w-[140px] sm:max-w-[180px]"
          />
        </div>
      </div>

      {statusMessage && (
        <div
          data-testid="inspector-status-banner"
          className={`px-3 py-1.5 text-xs font-mono border-b ${
            statusMessage.isError
              ? 'bg-app-danger/15 text-app-danger border-app-danger/40'
              : 'bg-app-success/15 text-app-success border-app-success/40'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Scrollable Fields List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {isLoading && fields.length === 0 ? (
          <div className="text-center py-8 text-xs text-app-muted">Lade Formularfelder...</div>
        ) : filteredFields.length === 0 ? (
          <div className="text-center py-8 text-xs text-app-muted">
            {searchTerm ? 'Keine Felder gefunden.' : 'Dieses Formular enthält keine Formularfelder.'}
          </div>
        ) : (
          filteredFields.map((field) => {
            const val = values[field.name];
            const isFilled =
              typeof val === 'boolean'
                ? val
                : Boolean(val && String(val).trim() && String(val) !== '/Off');

            return (
              <div
                key={field.name}
                data-testid={`field-row-${field.name}`}
                className="rounded-[2px] border border-app-border bg-app-raised p-2.5 transition-colors hover:border-app-accent/60"
              >
                {/* Field Top Row: Status badge & Labels */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      data-testid={`field-status-${field.name}`}
                      className={`text-xs font-bold ${
                        isFilled ? 'text-app-success' : 'text-app-muted'
                      }`}
                    >
                      {isFilled ? '[✓]' : '[ ]'}
                    </span>
                    <label
                      htmlFor={`field-input-${field.name}`}
                      className="text-xs font-semibold text-app-text truncate cursor-pointer"
                      title={field.description || field.name}
                    >
                      {field.description || field.name}
                    </label>
                  </div>

                  <span className="text-[10px] text-app-muted shrink-0 font-mono">
                    {field.type}
                  </span>
                </div>

                {/* Field Bottom Row: Appropriate Input Control */}
                <div>
                  {field.type === '/Ch' && field.options && field.options.length > 0 ? (
                    <select
                      id={`field-input-${field.name}`}
                      data-testid={`field-input-${field.name}`}
                      value={String(val || '')}
                      onChange={(e) => handleChange(field.name, e.target.value)}
                      className="w-full rounded-[2px] border border-app-border bg-app-bg px-2 py-1 text-xs font-mono text-app-text focus:border-app-accent focus:outline-hidden cursor-pointer"
                    >
                      <option value="">-- Bitte wählen --</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === '/Btn' && field.options && field.options.length > 1 ? (
                    <div className="flex flex-wrap items-center gap-3 pt-0.5">
                      {field.options.map((opt) => (
                        <label
                          key={opt}
                          className="inline-flex items-center gap-1.5 text-xs text-app-text cursor-pointer"
                        >
                          <input
                            type="radio"
                            name={`radio_${field.name}`}
                            value={opt}
                            checked={String(val || '') === opt}
                            onChange={() => handleChange(field.name, opt)}
                            className="accent-app-accent"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : field.type === '/Btn' ? (
                    <label className="inline-flex items-center gap-2 text-xs text-app-text cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        id={`field-input-${field.name}`}
                        data-testid={`field-input-${field.name}`}
                        checked={Boolean(val)}
                        onChange={(e) => handleChange(field.name, e.target.checked)}
                        className="rounded-[2px] accent-app-accent cursor-pointer"
                      />
                      <span className="text-xs font-mono">
                        {Boolean(val) ? 'Ausgewählt / Angekreuzt' : 'Nicht angekreuzt'}
                      </span>
                    </label>
                  ) : (
                    <input
                      type="text"
                      id={`field-input-${field.name}`}
                      data-testid={`field-input-${field.name}`}
                      value={String(val || '')}
                      placeholder={field.description || field.name}
                      onChange={(e) => handleChange(field.name, e.target.value)}
                      className="w-full rounded-[2px] border border-app-border bg-app-bg px-2.5 py-1 text-xs font-mono text-app-text focus:border-app-accent focus:outline-hidden"
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky Bottom Actions Bar */}
      <div className="p-3 border-t border-app-border bg-app-bg flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={handleReset}
          disabled={isSaving || isLoading}
          className="rounded-[2px] border border-app-border bg-app-raised px-3 py-1.5 text-xs font-mono font-medium text-app-text hover:bg-app-active transition-colors cursor-pointer shadow-none disabled:opacity-50"
        >
          [ZURÜCKSETZEN]
        </button>

        <button
          type="button"
          data-testid="inspector-save-btn"
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="rounded-[2px] bg-app-accent px-4 py-1.5 text-xs font-mono font-bold text-app-accent-contrast hover:opacity-90 transition-opacity cursor-pointer shadow-none disabled:opacity-50"
        >
          {isSaving ? 'Speichere...' : '[SPEICHERN]'}
        </button>
      </div>
    </div>
  );
};
