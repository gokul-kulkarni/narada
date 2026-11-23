import type { CreatePlan } from "@narada/core/mcp-server/create";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/ui";
import type { UpdatePlan } from "@narada/core/mcp-server/update";
import { useEffect, useState } from "react";
import { drawAttention } from "../../lib/window-attention";
import {
  useMcpApprovalStore,
  type ApprovalSubject,
  type PendingApproval,
} from "../../state/mcp-approval-store";
import { ChangeList } from "../assist/ChangeList";

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

function CreateBody({ plan }: { plan: CreatePlan }) {
  return (
    <>
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
    </>
  );
}

function UpdateBody({ plan }: { plan: UpdatePlan }) {
  return (
    <>
      <p>
        <b>
          {plan.collectionName} / {plan.requestName}
        </b>{" "}
        will be saved with these changes. Nothing else in it changes.
      </p>
      <ChangeList changes={plan.changes} />
      {plan.replacedSecrets.length > 0 && (
        <p className="text-muted">
          Credentials were kept out of the file. You'll need to set:{" "}
          {plan.replacedSecrets.join(", ")}.
        </p>
      )}
      {plan.warnings.map((warning) => (
        <p key={warning} className="text-muted">
          {warning}
        </p>
      ))}
    </>
  );
}

function SendBody({ subject }: { subject: Extract<ApprovalSubject, { kind: "send" }> }) {
  const { request } = subject;
  return (
    <>
      <p>
        It runs like Dispatch: with your{" "}
        {subject.environment ? `"${subject.environment}"` : "current"} environment, auth and
        scripts, and can change data on the server. The response goes back to the agent with secrets
        removed.
      </p>
      <div className="flex flex-col gap-1 rounded-lg bg-surface-2 p-3 font-mono text-[13px] break-all">
        <span>
          <b>{request.method}</b> {request.url}
        </span>
        <span className="text-muted">
          {subject.host ? `to ${subject.host}` : "host not known until variables are filled in"} ·{" "}
          {subject.saved ? `saved request "${request.name}"` : "one-off request, not saved"}
        </span>
      </div>
    </>
  );
}

const TITLES: Record<ApprovalSubject["kind"], string> = {
  create: "wants to add to Narada",
  update: "wants to change a request",
  send: "wants to send a request",
};

const APPROVE: Record<ApprovalSubject["kind"], string> = {
  create: "Add",
  update: "Apply",
  send: "Send",
};

/** What "Allow for this session" covers, if anything, for this subject. */
function sessionLabel(subject: ApprovalSubject): string | null {
  if (subject.kind === "create") return "Allow for this session";
  if (subject.kind === "send" && subject.host)
    return `Allow sending to ${subject.host} this session`;
  return null;
}

/** Buttons stay inactive this long after a request appears, so a click meant for the previous
 * one (the dialog swaps in place) can't approve this one. */
export const ARM_DELAY_MS = 500;

function Approval({ pending, waiting }: { pending: PendingApproval; waiting: number }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    void drawAttention();
    const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  const { subject } = pending;
  const decide = useMcpApprovalStore.getState().decide;
  const who = pending.client ?? "A coding agent";
  const session = sessionLabel(subject);

  return (
    <Modal title={`${who} ${TITLES[subject.kind]}`} onClose={() => decide(pending.id, "cancel")}>
      <div className="flex flex-col gap-4 text-sm">
        {subject.kind === "create" && <CreateBody plan={subject.plan} />}
        {subject.kind === "update" && <UpdateBody plan={subject.plan} />}
        {subject.kind === "send" && <SendBody subject={subject} />}
        <p className="text-xs text-muted">
          The agent waits about a minute for your answer.
          {waiting > 0 && ` ${waiting} more waiting after this.`}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={!armed} onClick={() => decide(pending.id, "cancel")}>
            Cancel
          </Button>
          {session && (
            <Button
              variant="ghost"
              disabled={!armed}
              onClick={() => decide(pending.id, "allow-session")}
            >
              {session}
            </Button>
          )}
          <Button variant="primary" disabled={!armed} onClick={() => decide(pending.id, "approve")}>
            {APPROVE[subject.kind]}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Asks the user before an agent adds, changes or sends anything; one request at a time. */
export function ApprovalDialog() {
  const queue = useMcpApprovalStore((s) => s.queue);
  const [pending] = queue;
  if (!pending) return null;
  // Keyed by request, so each one starts with its buttons inactive.
  return <Approval key={pending.id} pending={pending} waiting={queue.length - 1} />;
}
