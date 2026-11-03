import { chat, listModels, transcribe, ProviderError } from "./providers.mjs";
const PAGE = "__ULTRON_PAGE__";
const WEB_CSP = "__ULTRON_CSP__";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
/*__WEB_ACCESS__*/
export default {
  async fetch(request, env = {}, context = {}) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/status") return json({ personalKeys: true });
      if (
        !["/api/chat", "/api/key-check", "/api/transcribe"].includes(
          url.pathname,
        )
      )
        return json({ error: "Not found" }, 404);
      if (request.method !== "POST")
        return json({ error: "POST 요청이 필요합니다." }, 405);
      try {
        await authorizeWeb(request, env, context);
        const suppliedKey = request.headers.get("X-Ultron-Key") || "";
        if (!suppliedKey)
          throw new ProviderError(
            "설정에서 해당 제공사의 API 키를 연결해 주세요.",
            503,
          );
        if (
          suppliedKey.length < 12 ||
          suppliedKey.length > 512 ||
          !/^[\x21-\x7e]+$/.test(suppliedKey)
        )
          throw new ProviderError("API 키 형식을 확인해 주세요.");
        const key = request.headers.get("X-Ultron-Key") || "";
        let result;
        if (url.pathname === "/api/transcribe") {
          const audio = await readLimited(request, 8 * 1024 * 1024);
          result = await transcribe({
            provider: request.headers.get("X-Ultron-Provider"),
            model: request.headers.get("X-Ultron-Model"),
            language: request.headers.get("X-Ultron-Language"),
            key,
            audio,
          });
        } else {
          const data = JSON.parse(
            new TextDecoder().decode(
              await readLimited(request, MAX_JSON_BYTES),
            ),
          );
          result =
            url.pathname === "/api/key-check"
              ? await listModels({
                  provider: data.provider,
                  key,
                  workspace: data.workspace,
                })
              : await chat({ ...data, key });
        }
        return json(result);
      } catch (e) {
        return json(
          {
            error:
              e instanceof ProviderError
                ? e.message
                : e instanceof SyntaxError
                  ? "요청 형식을 확인해 주세요."
                  : "요청을 완료하지 못했습니다.",
          },
          e instanceof ProviderError
            ? e.status
            : e instanceof SyntaxError
              ? 400
              : 502,
        );
      }
    }
    if (!["/", "/index.html"].includes(url.pathname))
      return new Response("Not found", { status: 404 });
    return new Response(PAGE, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": WEB_CSP,
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)",
      },
    });
  },
};
async function readLimited(request, max) {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw new ProviderError("요청 데이터가 너무 큽니다.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}
