import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { requestBadge } from "../../protocols/registry";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore, type PaletteMode } from "../../state/ui-store";
import { useWorkspaceStore } from "../../state/workspace-store";
import { openSavedRequest } from "../collections/collection-actions";
import { formatKeys } from "./keys";
import { commandEntries, filterEntries, requestEntries, type PaletteEntry } from "./palette-items";

/** As in VS Code: a leading ">" searches commands instead of requests. */
const COMMAND_PREFIX = ">";

function run(entry: PaletteEntry): void {
  useUiStore.getState().closePalette();
  if (entry.kind === "command") {
    entry.command.run();
    return;
  }
  if (entry.tabId) useTabsStore.getState().activate(entry.tabId);
  else if (entry.collectionId) openSavedRequest(entry.collectionId, entry.request);
  useUiStore.getState().show({ kind: "requests" });
}

function Row({ entry }: { entry: PaletteEntry }) {
  if (entry.kind === "command") {
    const [keys] = entry.command.keys;
    return (
      <>
        <span className="text-xs text-muted">{entry.command.group}:</span>
        <span className="min-w-0 flex-1 truncate">{entry.command.title}</span>
        {keys && <kbd className="font-mono text-xs text-muted">{formatKeys(keys)}</kbd>}
      </>
    );
  }
  return (
    <>
      <span className="w-14 shrink-0 font-mono text-[11px] font-semibold text-accent-text">
        {requestBadge(entry.request)}
      </span>
      <span className="truncate">{entry.request.name}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{entry.where}</span>
    </>
  );
}

function Palette({ mode }: { mode: PaletteMode }) {
  const [text, setText] = useState(mode === "commands" ? COMMAND_PREFIX : "");
  const [selected, setSelected] = useState(0);
  const collections = useWorkspaceStore((s) => s.collections);
  const tabs = useTabsStore((s) => s.tabs);
  const list = useRef<HTMLUListElement>(null);

  const commands = text.startsWith(COMMAND_PREFIX);
  const query = commands ? text.slice(COMMAND_PREFIX.length) : text;
  const entries = useMemo<PaletteEntry[]>(
    () =>
      commands
        ? filterEntries(commandEntries(), query)
        : filterEntries(requestEntries(collections, tabs), query),
    [commands, query, collections, tabs],
  );
  const current = Math.min(selected, entries.length - 1);

  useEffect(() => {
    const row = list.current?.querySelector('[aria-selected="true"]');
    // Not every environment lays out elements (tests run in jsdom).
    if (row && "scrollIntoView" in row) row.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const move = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (move && entries.length) {
      e.preventDefault();
      setSelected((current + move + entries.length) % entries.length);
    } else if (e.key === "Enter" && entries[current]) {
      e.preventDefault();
      run(entries[current]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      useUiStore.getState().closePalette();
    }
  };

  const optionId = (index: number) => `palette-option-${index}`;
  return (
    <div
      className="fixed inset-0 z-20 flex justify-center bg-backdrop px-4 pt-[12vh]"
      onMouseDown={() => useUiStore.getState().closePalette()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={commands ? "Commands" : "Go to request"}
        className="flex max-h-[60vh] w-full max-w-xl flex-col self-start overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-options"
          aria-activedescendant={entries[current] ? optionId(current) : undefined}
          aria-label={commands ? "Search commands" : "Search requests"}
          placeholder={
            commands ? "Type a command" : "Search saved requests, or type > for commands"
          }
          className="border-b border-line-soft bg-transparent px-4 py-3 text-sm outline-none focus-visible:outline-none"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul id="palette-options" role="listbox" ref={list} className="overflow-y-auto py-1">
          {entries.map((entry, index) => (
            <li
              key={entry.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              onMouseMove={() => index !== current && setSelected(index)}
              onClick={() => run(entry)}
              className={`flex cursor-pointer items-center gap-2 px-4 py-1.5 text-sm ${
                index === current ? "bg-accent-soft text-accent-soft-ink" : ""
              }`}
            >
              <Row entry={entry} />
            </li>
          ))}
          {entries.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">
              {commands ? "No matching commands." : "No matching requests."}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

/** ⌘P / ⌘⇧P: find a saved request or run any command by name. */
export function CommandPalette() {
  const mode = useUiStore((s) => s.palette);
  // Keyed by mode so ⌘P and ⌘⇧P each start fresh.
  return mode ? <Palette key={mode} mode={mode} /> : null;
}
