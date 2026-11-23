import type { MouseEvent, ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/** Only web links open; anything else (javascript:, file:, …) is shown as text. */
const WEB_LINK = /^https?:\/\//i;

async function openExternal(href: string): Promise<void> {
  if (isTauri()) await openUrl(href);
  else window.open(href, "_blank", "noopener,noreferrer");
}

function Link({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href || !WEB_LINK.test(href)) return <span>{children}</span>;
  const open = (event: MouseEvent) => {
    // A click must never navigate the app's own window.
    event.preventDefault();
    void openExternal(href);
  };
  return (
    <a href={href} onClick={open} className="text-accent underline underline-offset-2">
      {children}
    </a>
  );
}

const COMPONENTS: Components = {
  a: ({ href, children }) => <Link href={href}>{children}</Link>,
  // Loading an image fetches its URL, which could carry data out of the machine.
  img: ({ alt }) => <span className="text-muted">[image: {alt ?? ""}]</span>,
  h1: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1.5 font-semibold">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 mb-1.5 font-semibold">{children}</h4>,
  p: ({ children }) => <p className="my-2">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="my-0.5">{children}</li>,
  code: ({ children }) => (
    <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[12.5px]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-left text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line px-2 py-1 font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-line-soft px-2 py-1">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-line pl-3 text-muted">{children}</blockquote>
  ),
};

/**
 * An agent's answer as Markdown. The text can echo an untrusted response, so raw HTML is
 * dropped, images are never loaded and only web links open (in the system browser).
 */
export function AnswerMarkdown({ text }: { text: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS} skipHtml>
      {text}
    </Markdown>
  );
}
