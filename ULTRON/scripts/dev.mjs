import { MAX_JSON_BYTES } from "../shared/conversation.mjs";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { default: worker } = await import(
  pathToFileURL(resolve(import.meta.dirname, "../dist/server/index.js"))
);
export function createDevServer() {
  return http.createServer(async (req, res) => {
    try {
      const origin = "http://127.0.0.1:" + req.socket.localPort;
      const url = new URL(req.url, origin);
      const max =
        url.pathname === "/api/transcribe" ? 8 * 1024 * 1024 : MAX_JSON_BYTES;
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > max) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "요청 데이터가 너무 큽니다." }));
          return;
        }
        chunks.push(c);
      }
      const body = Buffer.concat(chunks);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(body.length ? { body } : {}),
      });
      const response = await worker.fetch(
        request,
        { ULTRON_LOCAL: "true" },
        { ultronLocal: { ip: req.socket.remoteAddress, origin } },
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "요청을 완료하지 못했습니다." }));
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT) || 4173;
  createDevServer().listen(port, "127.0.0.1", () =>
    console.log("Local: http://127.0.0.1:" + port),
  );
}
