import { newId } from "../../lib/ids";
import type { KeyValue } from "../../lib/model";
import { parseQueryParams, withQueryParams } from "../../lib/url-params";
import { KeyValueEditor } from "./KeyValueEditor";

/** Query params are derived from the URL, so the URL stays the single source of truth. */
export function ParamsEditor({
  url,
  onUrlChange,
}: {
  url: string;
  onUrlChange: (url: string) => void;
}) {
  const rows: KeyValue[] = parseQueryParams(url).map((param, index) => ({
    id: `${index}`,
    ...param,
    enabled: true,
  }));
  return (
    <KeyValueEditor
      label="Query params"
      rows={rows}
      allowToggle={false}
      createRow={() => ({ id: newId(), key: "", value: "", enabled: true })}
      onChange={(next) =>
        onUrlChange(
          withQueryParams(
            url,
            next.map(({ key, value }) => ({ key, value })),
          ),
        )
      }
    />
  );
}
