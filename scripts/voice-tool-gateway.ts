import { createServer } from "node:http";
// Expose this allowlisted gateway, never the Next.js application, through a tunnel.
export const allowedToolPath = (path: string) =>
  /^\/api\/voice\/tools\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/prepare-request$/i.test(
    path,
  );
export function startGateway() {
  return createServer(async (req, res) => {
    const deny = (status: number) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "NOT_ALLOWED" }));
    };
    if (req.method !== "POST" || !req.url || !allowedToolPath(req.url))
      return deny(404);
    if (!req.headers.authorization) return deny(401);
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32000) return deny(413);
        chunks.push(Buffer.from(chunk));
      }
      const upstream = await fetch(`http://127.0.0.1:3000${req.url}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.authorization,
        },
        body: Buffer.concat(chunks).toString("utf8"),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      res.writeHead(upstream.status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(await upstream.text());
    } catch {
      deny(502);
    }
  }).listen(3002, "127.0.0.1", () =>
    console.log(
      "Gateway de ferramenta: 127.0.0.1:3002. Somente POST prepare-request; nenhum login ou painel.",
    ),
  );
}
if (process.argv[1]?.endsWith("voice-tool-gateway.ts")) startGateway();
