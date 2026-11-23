import { requestBadge } from "../../protocols/registry";
import { useState } from "react";
import { InlineRename } from "../../components/InlineRename";
import type { Collection, CollectionItem } from "@narada/core/model";
import { useTabsStore } from "../../state/tabs-store";
import { useUiStore } from "../../state/ui-store";
import {
  addFolder,
  addRequest,
  duplicateRequest,
  openSavedRequest,
  removeCollectionItem,
  renameCollectionItem,
} from "./collection-actions";
import { ItemActions } from "./ItemActions";
import { dragSource, dropHighlight, useDropTarget } from "./drag";

const ROW = "group flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-surface-2";

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
  const drop = useDropTarget({
    collectionId: collection.id,
    folderId: item.kind === "folder" ? item.id : null,
  });
  const moveTo = {
    label: "Move to…",
    onSelect: () =>
      useUiStore.getState().openDialog({ kind: "move", collectionId: collection.id, itemId: id }),
  };
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
          className={`${ROW} ${activeRequestId === id ? "bg-accent-soft font-semibold text-accent-soft-ink" : ""}`}
          style={indent}
        >
          {rename || (
            <button
              type="button"
              className="flex min-w-0 flex-1 gap-2 text-left"
              onClick={() => openSavedRequest(collection.id, item.request)}
              {...dragSource({ collectionId: collection.id, itemId: id })}
            >
              <span className="w-10 shrink-0 font-mono text-[11px] font-semibold text-accent-text">
                {requestBadge(item.request)}
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
              moveTo,
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
      <div className={`${ROW} ${dropHighlight(drop["data-drop-target"])}`} style={indent} {...drop}>
        {rename || (
          <button
            type="button"
            aria-expanded={open}
            className="flex min-w-0 flex-1 gap-1 text-left"
            onClick={() => setOpen(!open)}
            {...dragSource({ collectionId: collection.id, itemId: id })}
          >
            <span className="w-3 text-muted">{open ? "▾" : "▸"}</span>
            <span className="truncate font-semibold">{name}</span>
          </button>
        )}
        <ItemActions
          name={name}
          actions={[
            { label: "Add request", onSelect: () => addRequest(collection.id, id) },
            { label: "Add folder", onSelect: () => addFolder(collection.id, id) },
            {
              label: "Run folder",
              onSelect: () =>
                useUiStore
                  .getState()
                  .show({ kind: "runner", collectionId: collection.id, folderId: id }),
            },
            { label: "Rename", onSelect: () => setRenaming(true) },
            moveTo,
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
