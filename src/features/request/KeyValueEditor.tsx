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

  return (
    <div className="space-y-1" aria-label={label} role="group">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          {allowToggle && (
            <input
              type="checkbox"
              aria-label={`Enable row ${index + 1}`}
              checked={row.enabled}
              onChange={(e) => update(row.id, { enabled: e.target.checked } as Partial<T>)}
            />
          )}
          <TextInput
            aria-label={`Key ${index + 1}`}
            className="flex-1"
            placeholder="Key"
            value={row.key}
            onChange={(e) => update(row.id, { key: e.target.value } as Partial<T>)}
          />
          <TextInput
            aria-label={`Value ${index + 1}`}
            className="flex-1"
            placeholder="Value"
            value={row.value}
            onChange={(e) => update(row.id, { value: e.target.value } as Partial<T>)}
          />
          {extraColumn?.(row, (patch) => update(row.id, patch))}
          <Button
            variant="danger"
            aria-label={`Remove row ${index + 1}`}
            onClick={() => remove(row.id)}
          >
            ✕
          </Button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange([...rows, createRow()])}>
        + Add
      </Button>
    </div>
  );
}
