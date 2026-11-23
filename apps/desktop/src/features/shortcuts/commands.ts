import { dispatchTab } from "../../protocols/registry";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import { stopDelivery } from "../request/in-flight";
import { askAgent } from "../assist/ask";
import { saveTab } from "../workspace/save-tab";
import { isMac, type KeySpec } from "./keys";

export interface Command {
  readonly id: string;
  readonly title: string;
  readonly group: "Request" | "Tabs" | "Go to" | "View";
  /** The first is the one shown; the rest are alternatives people know from other apps. */
  readonly keys: readonly KeySpec[];
  run(): void;
}

const ui = () => useUiStore.getState();
const tabs = () => useTabsStore.getState();
const onRequests = () => ui().view.kind === "requests";

/** Runs `action` on the request on screen; nothing happens on Settings and other screens. */
const withVisibleTab =
  (action: (tab: NonNullable<ReturnType<typeof selectActiveTab>>) => void) => () => {
    const tab = selectActiveTab(tabs());
    if (tab && onRequests()) action(tab);
  };

const showRequests = () => ui().show({ kind: "requests" });

function activateAt(index: number): void {
  const list = tabs().tabs;
  const tab = list[(index + list.length) % list.length];
  if (!tab) return;
  tabs().activate(tab.id);
  showRequests();
}

function step(by: number): void {
  const { tabs: list, activeTabId } = tabs();
  activateAt(list.findIndex((t) => t.id === activeTabId) + by);
}

/** Puts the cursor in the request's address: the URL for HTTP, the first field otherwise. */
export function focusAddress(): void {
  showRequests();
  // After the request view has rendered, if it was not on screen.
  requestAnimationFrame(() => {
    const field =
      document.querySelector<HTMLElement>('main [aria-label="URL"]') ??
      document.querySelector<HTMLElement>("main form input, main form select");
    field?.focus();
    if (field instanceof HTMLInputElement) field.select();
  });
}

const mac = isMac();

export const COMMANDS: readonly Command[] = [
  {
    id: "palette.requests",
    title: "Go to request…",
    group: "Go to",
    keys: ["mod+p"],
    run: () => ui().openPalette("requests"),
  },
  {
    id: "palette.commands",
    title: "Show all commands",
    group: "Go to",
    keys: ["mod+shift+p", "f1"],
    run: () => ui().openPalette("commands"),
  },
  {
    id: "request.send",
    title: "Send request",
    group: "Request",
    keys: ["mod+enter"],
    run: withVisibleTab((tab) => void dispatchTab(tab)),
  },
  {
    id: "request.stop",
    title: "Stop request",
    group: "Request",
    keys: ["mod+."],
    run: withVisibleTab((tab) => stopDelivery(tab.id)),
  },
  {
    id: "request.save",
    title: "Save request",
    group: "Request",
    keys: ["mod+s"],
    run: withVisibleTab((tab) => void saveTab(tab)),
  },
  {
    id: "request.askAgent",
    title: "Ask an agent about the response",
    group: "Request",
    keys: [],
    run: withVisibleTab((tab) => void askAgent(tab.id)),
  },
  {
    id: "request.focusUrl",
    title: "Go to URL",
    group: "Request",
    keys: ["mod+l"],
    run: focusAddress,
  },
  {
    id: "tab.new",
    title: "New request",
    group: "Tabs",
    keys: ["mod+t", "mod+n"],
    run: () => {
      tabs().openNew();
      focusAddress();
    },
  },
  {
    id: "tab.close",
    title: "Close tab",
    group: "Tabs",
    keys: mac ? ["mod+w"] : ["mod+w", "ctrl+f4"],
    // Like closing VS Code's settings editor: away from the requests, it goes back to them.
    run: () => (onRequests() ? withVisibleTab((tab) => tabs().close(tab.id))() : showRequests()),
  },
  {
    id: "tab.reopen",
    title: "Reopen closed tab",
    group: "Tabs",
    keys: ["mod+shift+t"],
    run: () => {
      tabs().reopenClosed();
      showRequests();
    },
  },
  {
    id: "tab.next",
    title: "Next tab",
    group: "Tabs",
    keys: mac ? ["ctrl+tab", "mod+alt+right", "mod+shift+]"] : ["ctrl+tab", "ctrl+pagedown"],
    run: () => step(1),
  },
  {
    id: "tab.previous",
    title: "Previous tab",
    group: "Tabs",
    keys: mac
      ? ["ctrl+shift+tab", "mod+alt+left", "mod+shift+["]
      : ["ctrl+shift+tab", "ctrl+pageup"],
    run: () => step(-1),
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): Command => ({
    id: `tab.goto${n}`,
    title: `Go to tab ${n}`,
    group: "Tabs",
    keys: [`mod+${n}`],
    run: () => activateAt(Math.min(n - 1, tabs().tabs.length - 1)),
  })),
  {
    id: "tab.gotoLast",
    title: "Go to last tab",
    group: "Tabs",
    keys: ["mod+9"],
    run: () => activateAt(-1),
  },
  {
    id: "view.sidebar",
    title: "Show or hide the sidebar",
    group: "View",
    keys: ["mod+b"],
    run: () => ui().toggleSidebar(),
  },
  {
    id: "view.history",
    title: "Show or hide history",
    group: "View",
    keys: ["mod+j"],
    run: () => ui().toggleHistory(),
  },
  {
    id: "view.settings",
    title: "Open Settings",
    group: "View",
    keys: ["mod+,"],
    run: () => ui().show({ kind: "settings" }),
  },
  {
    id: "view.requests",
    title: "Back to requests",
    group: "View",
    keys: [],
    run: showRequests,
  },
  {
    id: "view.import",
    title: "Import…",
    group: "View",
    keys: ["mod+o"],
    run: () => ui().openDialog({ kind: "import" }),
  },
];

/** In the palette, one row stands for "Go to tab 1…8". */
export const PALETTE_COMMANDS = COMMANDS.filter((c) => !/^tab\.goto\d$/.test(c.id));
