// Authentication is supplied by the Cloudflare runtime, never by caller headers.
// https://developers.cloudflare.com/workers/configuration/cloudflare-access/
let localWindow = { start: 0, total: 0, checks: 0 };
export function consumeWindow(current, now, keyCheck) {
  const next =
    !current || now - current.start >= 60000
      ? { start: now, total: 0, checks: 0 }
      : { ...current };
  if (next.total >= 40 || (keyCheck && next.checks >= 8))
    return { allowed: false, state: next };
  next.total++;
  if (keyCheck) next.checks++;
  return { allowed: true, state: next };
}
export async function authorizeWeb(request, env = {}, context = {}) {
  const url = new URL(request.url),
    local = context.ultronLocal;
  const isLocal =
    env.ULTRON_LOCAL === "true" &&
    local &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(local.ip);
  let origin, ip;
  if (isLocal) {
    origin = local.origin;
    ip = local.ip;
    if (url.origin !== origin)
      throw new ProviderError("허용되지 않은 호스트입니다.", 403);
  } else {
    if (
      !env.ULTRON_PUBLIC_ORIGIN ||
      !env.ULTRON_ACCESS_AUD ||
      !env.ULTRON_LIMITER?.idFromName
    )
      throw new ProviderError(
        "웹 AI 연결은 운영자의 인증 및 요청 제한 설정이 필요합니다. Windows 앱은 직접 연결할 수 있습니다.",
        503,
      );
    try {
      const configured = new URL(env.ULTRON_PUBLIC_ORIGIN);
      if (
        configured.protocol !== "https:" ||
        configured.origin !== env.ULTRON_PUBLIC_ORIGIN
      )
        throw Error();
      origin = configured.origin;
    } catch {
      throw new ProviderError("웹 서비스 주소 설정을 확인해 주세요.", 503);
    }
    const aud = context.access?.aud;
    if (
      !aud ||
      !(Array.isArray(aud) ? aud : [aud]).includes(env.ULTRON_ACCESS_AUD)
    )
      throw new ProviderError("이 웹 서비스에 로그인해 주세요.", 401);
    // Only direct Cloudflare ingress is supported; generic proxies cannot opt in with headers.
    if (!request.cf)
      throw new ProviderError("신뢰할 수 있는 호스팅 연결이 필요합니다.", 503);
    ip = request.headers.get("CF-Connecting-IP");
    if (!ip || ip.length > 45 || !/^[0-9a-fA-F:.]+$/.test(ip))
      throw new ProviderError("클라이언트 연결을 확인하지 못했습니다.", 403);
  }
  if (
    request.headers.get("Origin") !== origin ||
    (request.headers.has("Sec-Fetch-Site") &&
      request.headers.get("Sec-Fetch-Site") !== "same-origin")
  )
    throw new ProviderError("허용되지 않은 요청입니다.", 403);
  const check = url.pathname === "/api/key-check";
  if (isLocal) {
    const decision = consumeWindow(localWindow, Date.now(), check);
    localWindow = decision.state;
    if (!decision.allowed)
      throw new ProviderError("잠시 후 다시 요청해 주세요.", 429);
    return;
  }
  // One durable record per trusted client IP; API-key changes allocate no new entries.
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  try {
    const stub = env.ULTRON_LIMITER.get(env.ULTRON_LIMITER.idFromName(hash));
    const result = await stub.fetch(
      "https://limiter/" + (check ? "key-check" : "request"),
      { method: "POST", signal: AbortSignal.timeout(5000) },
    );
    if (result.status === 429)
      throw new ProviderError("잠시 후 다시 요청해 주세요.", 429);
    if (result.status !== 204) throw Error("Limiter unavailable");
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(
      "요청 제한 서비스를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
}
// SQLite Durable Objects also support the transactional key-value interface.
export class UltronRateLimiter {
  constructor(ctx) {
    this.ctx = ctx;
  }
  async fetch(request) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const keyCheck = new URL(request.url).pathname === "/key-check",
      now = Date.now();
    const decision = await this.ctx.storage.transaction(async (tx) => {
      const result = consumeWindow(await tx.get("window"), now, keyCheck);
      if (result.allowed) await tx.put("window", result.state);
      return result;
    });
    await this.ctx.storage.setAlarm(decision.state.start + 60000);
    return new Response(null, { status: decision.allowed ? 204 : 429 });
  }
  async alarm() {
    await this.ctx.storage.transaction(async (tx) => {
      const current = await tx.get("window");
      if (current && Date.now() - current.start >= 60000)
        await tx.delete("window");
    });
  }
}
