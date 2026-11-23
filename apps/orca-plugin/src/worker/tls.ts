// TLS settings for sending: turn certificate checks off, or trust extra certificate authorities
// (a dev server's self-signed certificate, or a company proxy that re-signs HTTPS).
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { Agent, fetch as undiciFetch } from "undici";

export interface TlsSettings {
  /** Check that certificates are signed by a trusted authority (the default). */
  readonly verify: boolean;
  /** A PEM file of certificate authorities to trust as well as the usual ones; "" for none. */
  readonly caFile: string;
}

export interface TlsFetch {
  readonly fetch: typeof fetch;
  /** Closes the connections this fetch opened. */
  close(): Promise<void>;
}

const SETTINGS_HINT =
  "Settings → Plugins → Narada: add the authority that signed it under Extra CA certificates, " +
  "or turn off Verify TLS certificates for servers you trust.";

const TLS_PROBLEMS: Record<string, string> = {
  SELF_SIGNED_CERT_IN_CHAIN:
    "The server's certificate chain ends in a self-signed certificate this computer doesn't trust (a company proxy often does this).",
  DEPTH_ZERO_SELF_SIGNED_CERT: "The server uses a self-signed certificate.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE:
    "The server's certificate is signed by an authority this computer doesn't trust (self-signed or private).",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY:
    "The server's certificate is signed by an authority this computer doesn't trust (self-signed or private).",
  CERT_HAS_EXPIRED: "The server's certificate has expired.",
  ERR_TLS_CERT_ALTNAME_INVALID: "The server's certificate is for a different host name.",
};

const expandHome = (file: string) =>
  file === "~" || file.startsWith("~/") ? path.join(os.homedir(), file.slice(1)) : file;

/** A fetch with these TLS settings, or null while both are at their defaults. */
export async function tlsFetch(settings: TlsSettings): Promise<TlsFetch | null> {
  const caFile = settings.caFile.trim();
  if (settings.verify && caFile === "") return null;
  let extra: string | undefined;
  if (caFile !== "") {
    const file = expandHome(caFile);
    try {
      extra = await fs.readFile(file, "utf8");
    } catch (error) {
      const reason = (error as NodeJS.ErrnoException).code ?? String(error);
      throw new Error(`Could not read the CA certificates file ${file} (${reason}).`, {
        cause: error,
      });
    }
  }
  const agent = new Agent({
    connect: {
      rejectUnauthorized: settings.verify,
      ...(extra === undefined ? {} : { ca: [...tls.rootCertificates, extra] }),
    },
  });
  const send = (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: agent,
    });
  return { fetch: send as unknown as typeof fetch, close: () => agent.close() };
}

/** What went wrong with the server's certificate and what to change, or null if it wasn't that. */
export function describeTlsFailure(error: unknown): string | null {
  const cause = error instanceof Error ? error.cause : undefined;
  const code = (cause as { code?: unknown } | undefined)?.code;
  const problem = typeof code === "string" ? TLS_PROBLEMS[code] : undefined;
  return problem ? `${problem} ${SETTINGS_HINT}` : null;
}
