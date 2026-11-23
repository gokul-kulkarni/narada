import { applyPatch, describeChanges, type ExtractedPatch } from "@narada/core/assist/patch";
import { Button } from "../../components/ui";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { ChangeList } from "./ChangeList";

/** A change the agent suggested for the tab's request, as a diff with "Apply to tab". */
export function SuggestedChange({
  tabId,
  extracted,
}: {
  tabId: string;
  extracted: ExtractedPatch;
}) {
  const request = useTabsStore((s) => s.tabs.find((t) => t.id === tabId)?.request);
  if (request?.protocol !== "http") return null;
  const { patch, warnings } = extracted;
  const changes = patch ? describeChanges(request, applyPatch(request, patch)) : [];

  const apply = () => {
    if (!patch) return;
    useTabsStore
      .getState()
      .updateRequest(tabId, (r) => (r.protocol === "http" ? applyPatch(r, patch) : r));
    useUiStore
      .getState()
      .notify("Applied to the request. Dispatch to try it, then save to keep it.");
  };

  return (
    <section aria-label="Suggested change" className="my-3 rounded-lg border border-line p-3">
      <h3 className="mb-2 text-sm font-semibold">Suggested change</h3>
      {patch && changes.length === 0 && (
        <p className="text-sm text-muted">This change is already in the request.</p>
      )}
      {changes.length > 0 && <ChangeList changes={changes} />}
      {warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs text-muted">
          {warning}
        </p>
      ))}
      {changes.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={apply}>
            Apply to tab
          </Button>
        </div>
      )}
    </section>
  );
}
