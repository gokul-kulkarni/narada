import { useState } from "react";
import { InlineRename } from "../../components/InlineRename";
import type { Collection, CollectionItem } from "../../lib/model";
import { useTabsStore } from "../../state/tabs-store";
import {
  addFolder,
  addRequest,
  duplicateRequest,
  openSavedRequest,
  removeCollectionItem,
  renameCollectionItem,
} from "./collection-actions";
import { ItemActions } from "./ItemActions";

const ROW =
  "group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-900";

function TreeItem({
  collection,
  item,
  depth,
  parentId,
}: {
  collection: Collection;
  item: CollectionItem;
  depth: number;
  parentId: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const activeRequestId = useTabsStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.source?.requestId,
  );
  const indent = { paddingLeft: `${depth * 12 + 4}px` };
  const id = item.kind === "folder" ? item.id : item.request.id;
  const name = item.kind === "folder" ? item.name : item.request.name;
  const rename = renaming && (
    <InlineRename
      value={name}
      onCommit={(next) => {
        renameCollectionItem(collection.id, id, next);
        setRenaming(false);
      }}
      onCancel={() => setRenaming(false)}
    />
  );

  if (item.kind === "request") {
    return (
      <li>
        <div
          className={`${ROW} ${activeRequestId === id ? "bg-neutral-100 dark:bg-neutral-900" : ""}`}
          style={indent}
        >
          {rename || (
            <button
              type="button"
              className="flex min-w-0 flex-1 gap-2 text-left"
              onClick={() => openSavedRequest(collection.id, item.request)}
            >
              <span className="w-12 shrink-0 text-xs font-semibold text-orange-600">
                {item.request.method}
              </span>
              <span className="truncate">{name}</span>
            </button>
          )}
          <ItemActions
            name={name}
            actions={[
              { label: "Rename", onSelect: () => setRenaming(true) },
              {
                label: "Duplicate",
                onSelect: () => duplicateRequest(collection.id, item.request, parentId),
              },
              {
                label: "Delete",
                danger: true,
                onSelect: () => removeCollectionItem(collection.id, id),
              },
            ]}
          />
        </div>
      </li>
    );
  }

  return (
    <li>
      <div className={ROW} style={indent}>
        {rename || (
          <button
            type="button"
            aria-expanded={open}
            className="flex min-w-0 flex-1 gap-1 text-left"
            onClick={() => setOpen(!open)}
          >
            <span className="w-3 text-neutral-400">{open ? "▾" : "▸"}</span>
            <span className="truncate">📁 {name}</span>
          </button>
        )}
        <ItemActions
          name={name}
          actions={[
            { label: "Add request", onSelect: () => addRequest(collection.id, id) },
            { label: "Add folder", onSelect: () => addFolder(collection.id, id) },
            { label: "Rename", onSelect: () => setRenaming(true) },
            {
              label: "Delete",
              danger: true,
              onSelect: () => removeCollectionItem(collection.id, id),
            },
          ]}
        />
      </div>
      {open && (
        <TreeItems collection={collection} items={item.items} depth={depth + 1} parentId={id} />
      )}
    </li>
  );
}

export function TreeItems({
  collection,
  items,
  depth,
  parentId,
}: {
  collection: Collection;
  items: readonly CollectionItem[];
  depth: number;
  parentId: string | null;
}) {
  return (
    <ul>
      {items.map((item) => (
        <TreeItem
          key={item.kind === "folder" ? item.id : item.request.id}
          collection={collection}
          item={item}
          depth={depth}
          parentId={parentId}
        />
      ))}
    </ul>
  );
}
