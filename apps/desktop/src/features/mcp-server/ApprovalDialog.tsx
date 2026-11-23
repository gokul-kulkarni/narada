import type { CreatePlan } from "@narada/core/mcp-server/create";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/ui";
import { useMcpApprovalStore } from "../../state/mcp-approval-store";

function New() {
  return (
    <span className="ml-2 rounded bg-ok-soft px-1.5 py-0.5 text-[11px] font-semibold text-ok">
      new
    </span>
  );
}

/** The collection, folder path and requests a plan adds, as a small tree. */
function PlanTree({ plan }: { plan: CreatePlan }) {
  const newFrom = plan.folderPath.length - plan.newFolders.length;
  const depthPad = (depth: number) => ({ paddingLeft: `${depth * 1.1}rem` });
  return (
    <ul
      role="tree"
      aria-label="What will be added"
      className="flex flex-col gap-1 rounded-lg bg-surface-2 p-3 text-sm"
    >
      <li role="treeitem" aria-selected={false} className="font-semibold">
        {plan.collection.name}
        {plan.collection.id === null && <New />}
      </li>
      {plan.folderPath.map((folder, index) => (
        <li
          key={`${folder}-${index}`}
          role="treeitem"
          aria-selected={false}
          style={depthPad(index + 1)}
        >
          📁 {folder}
          {index >= newFrom && <New />}
        </li>
      ))}
      {plan.requests.map(({ request, renamedFrom }) => (
        <li
          key={request.id}
          role="treeitem"
          aria-selected={false}
          style={depthPad(plan.folderPath.length + 1)}
        >
          <b className="mr-2 font-mono text-xs">{request.method}</b>
          <span>{request.name}</span>
          {renamedFrom && (
            <span className="ml-2 text-xs text-muted">(renamed from "{renamedFrom}")</span>
          )}
          <span className="ml-2 font-mono text-xs break-all text-muted">{request.url}</span>
        </li>
      ))}
      {plan.variables.map((variable) => (
        <li
          key={variable.id}
          role="treeitem"
          aria-selected={false}
          style={depthPad(1)}
          className="text-muted"
        >
          {"{{"}
          {variable.key}
          {"}}"} = {variable.value || "(empty)"}
        </li>
      ))}
    </ul>
  );
}

/** Asks the user before an agent adds anything to their workspace; one request at a time. */
export function ApprovalDialog() {
  const pending = useMcpApprovalStore((s) => s.queue[0]);
  if (!pending) return null;
  const { plan } = pending;
  const decide = useMcpApprovalStore.getState().decide;
  const who = pending.client ?? "A coding agent";

  return (
    <Modal title={`${who} wants to add to Narada`} onClose={() => decide(pending.id, "cancel")}>
      <div className="flex flex-col gap-4 text-sm">
        <p>
          Nothing that exists changes; this only adds. It is saved to your collection files like any
          other change.
        </p>
        <PlanTree plan={plan} />
        {plan.replacedSecrets.length > 0 && (
          <p className="text-muted">
            Credentials were kept out of the files. You'll need to set:{" "}
            {plan.replacedSecrets.join(", ")}.
          </p>
        )}
        {plan.missingVariables.length > 0 && (
          <p className="text-muted">Not defined yet: {plan.missingVariables.join(", ")}.</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => decide(pending.id, "cancel")}>Cancel</Button>
          <Button variant="ghost" onClick={() => decide(pending.id, "allow-session")}>
            Allow for this session
          </Button>
          <Button variant="primary" onClick={() => decide(pending.id, "add")}>
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}
