// An HTTPS server on 127.0.0.1 with a freshly made self-signed certificate, for the TLS tests.
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import https from "node:https";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

export interface SelfSignedServer {
  readonly url: string;
  /** The certificate as a PEM file, to trust it as a CA. */
  readonly certFile: string;
  close(): Promise<void>;
}

export async function startSelfSignedServer(): Promise<SelfSignedServer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "narada-tls-"));
  const keyFile = path.join(dir, "key.pem");
  const certFile = path.join(dir, "cert.pem");
  execFileSync(
    "openssl",
    [
      ...["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1"],
      ...["-keyout", keyFile, "-out", certFile, "-subj", "/CN=127.0.0.1"],
      ...["-addext", "subjectAltName=IP:127.0.0.1"],
    ],
    { stdio: "ignore" },
  );
  const server = https.createServer(
    { key: await fs.readFile(keyFile), cert: await fs.readFile(certFile) },
    (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"secure":true}');
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `https://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    certFile,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
