import { prettyText, type ContentBlock } from "../../lib/mcp/results";

const PRE =
  "max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all";

/** Only render images and audio the browser can show inline from data. */
const SAFE_MEDIA = /^(image\/(png|jpeg|gif|webp)|audio\/(mpeg|wav|ogg|webm))$/;

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "text":
      return <pre className={PRE}>{prettyText(block.text)}</pre>;
    case "image":
    case "audio":
      if (!SAFE_MEDIA.test(block.mimeType)) {
        return (
          <p className="text-sm text-muted">
            {block.type} ({block.mimeType}); see Raw.
          </p>
        );
      }
      return block.type === "image" ? (
        <img
          alt="Image returned by the server"
          className="max-h-80 rounded-lg border border-line"
          src={`data:${block.mimeType};base64,${block.data}`}
        />
      ) : (
        <audio controls src={`data:${block.mimeType};base64,${block.data}`} />
      );
    case "resource":
      return (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs text-muted">
            {block.uri}
            {block.mimeType && ` · ${block.mimeType}`}
          </span>
          {block.text === null ? (
            <p className="text-sm text-muted">Binary content; see Raw.</p>
          ) : (
            <pre className={PRE}>{prettyText(block.text)}</pre>
          )}
        </div>
      );
    case "link":
      return (
        <p className="font-mono text-sm">
          ↗ {block.name ? `${block.name} · ` : ""}
          {block.uri}
        </p>
      );
    case "other":
      return <pre className={PRE}>{JSON.stringify(block.value, null, 2)}</pre>;
  }
}

export function ContentBlocks({ blocks }: { blocks: readonly ContentBlock[] }) {
  if (blocks.length === 0) return <p className="text-sm text-muted">No content.</p>;
  return (
    <ol aria-label="Result content" className="flex flex-col gap-3">
      {blocks.map((block, index) => (
        <li key={index}>
          <Block block={block} />
        </li>
      ))}
    </ol>
  );
}
