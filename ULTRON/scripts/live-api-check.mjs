import { listModels, chat } from "../worker/providers.mjs";
const requested = (process.env.ULTRON_LIVE_PROVIDERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const names = {
  groq: "GROQ",
  openai: "OPENAI",
  anthropic: "ANTHROPIC",
  gemini: "GEMINI",
};
if (!requested.length)
  throw Error(
    "ULTRON_LIVE_PROVIDERS에 검증할 제공사를 지정하세요. 실제 API 키는 로컬 .env.live.local에만 입력하세요.",
  );
if (requested.some((p) => !names[p]))
  throw Error("지원하지 않는 제공사입니다.");
const withChat = process.argv.includes("--chat");
if (withChat && process.env.ULTRON_LIVE_ALLOW_BILLING !== "1")
  throw Error(
    "실제 대화는 요금이 발생할 수 있습니다. ULTRON_LIVE_ALLOW_BILLING=1 설정이 필요합니다.",
  );
let failed = false;
for (const provider of requested) {
  const prefix = names[provider],
    key = process.env[prefix + "_API_KEY"],
    model = process.env[prefix + "_MODEL"],
    workspace =
      provider === "anthropic" ? process.env.ANTHROPIC_WORKSPACE || "" : "";
  if (!key || (withChat && !model)) {
    console.log(
      JSON.stringify({
        provider,
        verified: false,
        error: "필요한 키 또는 모델 설정이 없습니다.",
      }),
    );
    failed = true;
    continue;
  }
  try {
    const result = await listModels({ provider, key, workspace });
    if (!result.models.length) throw Error();
    if (withChat) {
      const reply = await chat({
        provider,
        key,
        model,
        workspace,
        messages: [{ role: "user", content: "Reply only with OK." }],
      });
      if (!reply.answer.trim()) throw Error();
    }
    console.log(
      JSON.stringify({
        provider,
        modelsVerified: true,
        chatVerified: withChat,
        checkedAt: new Date().toISOString(),
      }),
    );
  } catch {
    failed = true;
    console.log(
      JSON.stringify({
        provider,
        verified: false,
        error: "실제 API 요청에 실패했습니다. 키·모델·권한·잔액을 확인하세요.",
      }),
    );
  }
}
process.exitCode = failed ? 1 : 0;
