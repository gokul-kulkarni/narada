import { useMemo, useState } from "react";
import { findItem, moveItem, type MoveTarget } from "@narada/core/collection-tree";
import type { CollectionItem } from "@narada/core/model";
import { Modal } from "../../components/Modal";
import { Button, Select } from "../../components/ui";
import { useWorkspaceStore } from "../../state/workspace-store";
import { destinationLabel, moveCollectionItem } from "./collection-actions";

interface Destination {
  readonly value: string;
  readonly target: MoveTarget;
  readonly label: string;
}

const folderIds = (items: readonly CollectionItem[]): string[] =>
  items.flatMap((item) => (item.kind === "folder" ? [item.id, ...folderIds(item.items)] : []));

/** Picks where a request or folder goes: any collection's top level or folder it can move to. */
export function MoveDialog({
  collectionId,
  itemId,
  onClose,
}: {
  collectionId: string;
  itemId: string;
  onClose: () => void;
}) {
  const collections = useWorkspaceStore((s) => s.collections);
  const from = useMemo(() => ({ collectionId, itemId }), [collectionId, itemId]);
  const destinations = useMemo(
    () =>
      collections.flatMap((collection) =>
        [null, ...folderIds(collection.items)].flatMap((folderId): Destination[] => {
          const target = { collectionId: collection.id, folderId };
          if (!moveItem(collections, from, target)) return [];
          const label = destinationLabel(collections, target);
          return [
            {
              value: `${collection.id}::${folderId ?? ""}`,
              target,
              label: folderId === null ? `${label} (top level)` : label,
            },
          ];
        }),
      ),
    [collections, from],
  );
  const [chosen, setChosen] = useState(destinations[0]?.value ?? "");
  const source = collections.find((c) => c.id === collectionId);
  const item = source && findItem(source, itemId);
  if (!item) return null;
  const name = item.kind === "folder" ? item.name : item.request.name;
  const target = destinations.find((d) => d.value === chosen)?.target;

  return (
    <Modal title={`Move "${name}"`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        {destinations.length === 0 ? (
          <p className="text-muted">There is nowhere else to move this.</p>
        ) : (
          <label className="flex flex-col gap-1">
            Move to
            <Select value={chosen} onChange={(e) => setChosen(e.target.value)}>
              {destinations.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!target}
            onClick={() => {
              if (target) moveCollectionItem(from, target);
              onClose();
            }}
          >
            Move
          </Button>
        </div>
      </div>
    </Modal>
  );
}
