import { Card } from "../../components/page";
import { COMMANDS, type Command } from "../shortcuts/commands";
import { formatKeys } from "../shortcuts/keys";

const GROUPS = ["Request", "Tabs", "Go to", "View"] as const;
/** "Go to tab 1…8" read as one line. */
const SHOWN = COMMANDS.filter((c) => c.keys.length > 0 && !/^tab\.goto[2-8]$/.test(c.id));

/** The labels shown for a command: one per key combination. */
const labels = (c: Command): string[] =>
  c.id === "tab.goto1"
    ? [`${formatKeys("mod+1")}–${formatKeys("mod+8")}`]
    : c.keys.map((spec) => formatKeys(spec));

function Keys({ labels }: { labels: readonly string[] }) {
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {labels.map((label) => (
        <kbd
          key={label}
          className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs"
        >
          {label}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutSettings() {
  return (
    <Card
      label="Keyboard shortcuts"
      title="Keyboard shortcuts"
      description={`The same keys as VS Code and your browser. ${formatKeys("mod+shift+p")} lists every command.`}
    >
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
        {GROUPS.map((group) => (
          <dl key={group} className="flex flex-col gap-1.5 text-sm">
            <dt className="text-xs font-bold text-muted">{group}</dt>
            {SHOWN.filter((c) => c.group === group).map((c) => (
              <dd key={c.id} className="flex items-center justify-between gap-3">
                <span>{c.id === "tab.goto1" ? "Go to tab 1–8" : c.title}</span>
                <Keys labels={labels(c)} />
              </dd>
            ))}
          </dl>
        ))}
      </div>
    </Card>
  );
}
