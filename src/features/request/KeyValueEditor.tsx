import { Button, TextInput } from "../../components/ui";
import { newKeyValue } from "../../lib/factories";
import type { KeyValue } from "../../lib/model";

interface Props<T extends KeyValue> {
  readonly rows: readonly T[];
  readonly onChange: (rows: T[]) => void;
  readonly createRow?: () => T;
  readonly label: string;
  readonly allowToggle?: boolean;
  readonly extraColumn?: (row: T, update: (patch: Partial<T>) => void) => React.ReactNode;
}

export function KeyValueEditor<T extends KeyValue>({
  rows,
  onChange,
  createRow = () => newKeyValue() as T,
  label,
  allowToggle = true,
  extraColumn,
}: Props<T>) {
  const update = (id: string, patch: Partial<T>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const remove = (id: string) => onChange(rows.filter((row) => row.id !== id));

  const cell = "flex-1 rounded-md border-transparent bg-transparent hover:border-line";

  return (
    <div className="space-y-2" aria-label={label} role="group">
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="flex gap-2 bg-surface-2 px-2 py-1.5 text-xs font-bold text-muted">
            {allowToggle && <span className="w-4" />}
            <span className="flex-1 px-2.5">Key</span>
            <span className="flex-1 px-2.5">Value</span>
            <span className="w-8" />
          </div>
          <div className="divide-y divide-line-soft">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className={`flex items-center gap-2 px-2 py-1 ${row.enabled ? "" : "opacity-60"}`}
              >
                {allowToggle && (
                  <input
                    type="checkbox"
                    className="w-4 accent-accent"
                    aria-label={`Enable row ${index + 1}`}
                    checked={row.enabled}
                    onChange={(e) => update(row.id, { enabled: e.target.checked } as Partial<T>)}
                  />
                )}
                <TextInput
                  aria-label={`Key ${index + 1}`}
                  className={`${cell} font-mono`}
                  placeholder="Key"
                  value={row.key}
                  onChange={(e) => update(row.id, { key: e.target.value } as Partial<T>)}
                />
                <TextInput
                  aria-label={`Value ${index + 1}`}
                  className={`${cell} font-mono`}
                  placeholder="Value"
                  value={row.value}
                  onChange={(e) => update(row.id, { value: e.target.value } as Partial<T>)}
                />
                {extraColumn?.(row, (patch) => update(row.id, patch))}
                <Button
                  variant="ghost"
                  className="w-8 px-0 text-muted hover:text-err"
                  aria-label={`Remove row ${index + 1}`}
                  onClick={() => remove(row.id)}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      <Button
        variant="ghost"
        className="font-semibold text-accent-text"
        onClick={() => onChange([...rows, createRow()])}
      >
        + Add
      </Button>
    </div>
  );
}
