import {
  MAX_MESSAGE_CHARS,
  MAX_HISTORY_CHARS,
  MAX_HISTORY_MESSAGES,
} from "../shared/conversation.mjs";
export const PROVIDERS = Object.freeze({
  groq: {
    name: "Groq",
    base: "https://api.groq.com/openai/v1",
    keys: "https://console.groq.com/keys",
  },
  openai: {
    name: "OpenAI",
    base: "https://api.openai.com/v1",
    keys: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    name: "Claude",
    base: "https://api.anthropic.com/v1",
    keys: "https://platform.claude.com/settings/keys",
  },
  gemini: {
    name: "Gemini",
    base: "https://generativelanguage.googleapis.com/v1beta",
    keys: "https://aistudio.google.com/apikey",
  },
});
export class ProviderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function providerInfo(id) {
  if (!Object.hasOwn(PROVIDERS, id))
    throw new ProviderError("지원하지 않는 AI 제공사입니다.");
  return PROVIDERS[id];
}
export function credentials(provider, key, workspace = "") {
  providerInfo(provider);
  if (typeof key !== "string" || !key)
    throw new ProviderError(
      "설정에서 해당 제공사의 API 키를 연결해 주세요.",
      503,
    );
  if (key.length < 12 || key.length > 512 || !/^[\x21-\x7e]+$/.test(key))
    throw new ProviderError("API 키 형식을 확인해 주세요.");
  if (
    typeof workspace !== "string" ||
    workspace.length > 100 ||
    (workspace && !/^[A-Za-z0-9_-]+$/.test(workspace))
  )
    throw new ProviderError("Claude 워크스페이스 ID를 확인해 주세요.");
  return provider === "gemini"
    ? { "x-goog-api-key": key }
    : provider === "anthropic"
      ? {
          Authorization: "Bearer " + key,
          "anthropic-version": "2026-10-21",
          ...(workspace ? { "anthropic-workspace-id": workspace } : {}),
        }
      : { Authorization: "Bearer " + key };
}
function upstreamError(provider, status) {
  const name = providerInfo(provider).name;
  return new ProviderError(
    status === 401
      ? `${name} API 키가 올바르지 않거나 만료되었습니다.`
      : status === 403
        ? `${name} 권한 또는 사용 지역·워크스페이스 설정을 확인해 주세요.`
        : status === 429
          ? `${name} 사용량 한도 또는 결제 잔액을 확인해 주세요.`
          : status === 404
            ? `${name}에서 선택한 모델을 찾을 수 없습니다. 모델 목록을 다시 불러오세요.`
            : status === 400
              ? `${name}에서 요청을 받지 못했습니다. 모델 지원 여부와 계정 설정을 확인해 주세요.`
              : `${name} 서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.`,
    502,
  );
}
async function request(provider, url, options) {
  try {
    const response = await fetch(url, {
      ...options,
      redirect: "error",
      signal: options.signal || AbortSignal.timeout(45000),
    });
    if (!response.ok) throw upstreamError(provider, response.status);
    return await readUpstreamJson(response);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      "AI 연결 시간이 초과되었거나 응답을 읽지 못했습니다.",
      502,
    );
  }
}
const validModel = (id) =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 200 &&
  /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(id);
export function modelKind(provider, id) {
  if (provider === "groq" && /^whisper-/.test(id)) return "stt";
  if (
    provider === "openai" &&
    /^(gpt-.*transcribe|whisper-1)/.test(id) &&
    !/diarize|realtime|live/.test(id)
  )
    return "stt";
  if (provider === "openai")
    return /^(gpt-|o[1-9]|chatgpt-)/.test(id) &&
      !/(audio|realtime|live|transcribe|tts|image|search|codex|computer|deep-research)/.test(
        id,
      )
      ? "chat"
      : null;
  if (provider === "groq")
    return !/(whisper|tts|orpheus|guard)/.test(id) ? "chat" : null;
  if (provider === "anthropic") return id.startsWith("claude-") ? "chat" : null;
  return /^gemini-/.test(id) &&
    !/(image|tts|live|audio|robotics|embedding)/.test(id)
    ? "chat"
    : null;
}
export async function listModels({ provider, key, workspace = "" }) {
  const info = providerInfo(provider),
    headers = credentials(provider, key, workspace),
    all = [],
    signal = AbortSignal.timeout(20000);
  let cursor = "";
  for (let page = 0; page < 8; page++) {
    const url = new URL(info.base + "/models");
    if (provider === "gemini") {
      url.searchParams.set("pageSize", "1000");
      if (cursor) url.searchParams.set("pageToken", cursor);
    }
    if (provider === "anthropic") {
      url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set("after_id", cursor);
    }
    const data = await request(provider, url.toString(), { headers, signal });
    const rows = provider === "gemini" ? data.models : data.data;
    if (!Array.isArray(rows))
      throw new ProviderError("모델 목록을 읽지 못했습니다.", 502);
    for (const row of rows) {
      const id =
        provider === "gemini" ? row.name?.replace(/^models\//, "") : row.id;
      if (
        !validModel(id) ||
        row.active === false ||
        row.lifecycle === "retired"
      )
        continue;
      if (
        provider === "gemini" &&
        !row.supportedGenerationMethods?.includes("generateContent")
      )
        continue;
      const kind = modelKind(provider, id);
      if (kind)
        all.push({ id, name: row.display_name || row.displayName || id, kind });
    }
    const next =
      provider === "gemini"
        ? data.nextPageToken
        : provider === "anthropic" && data.has_more
          ? data.last_id
          : "";
    if (!next || next === cursor) break;
    cursor = String(next);
  }
  const models = [...new Map(all.map((m) => [m.id, m])).values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  return { ok: true, models };
}
const SYSTEM =
  "You are Ultron, a calm, precise, helpful personal assistant. Respond in the user language, Korean by default. Be concise and warm, without villain roleplay. You can converse and reason but have no tools in this endpoint. Never claim to control a computer, send messages, access private accounts or retrieve live facts. The UI has separate local notes and date/time tools. You cannot start timers, alarms or reminders. State limitations clearly; never invent live data.";
function validateMessages(messages) {
  if (
    !Array.isArray(messages) ||
    !messages.length ||
    messages.length > MAX_HISTORY_MESSAGES ||
    messages.some(
      (m) =>
        !m ||
        !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" ||
        !m.content.trim() ||
        m.content.length > MAX_MESSAGE_CHARS,
    ) ||
    JSON.stringify(messages).length > MAX_HISTORY_CHARS
  )
    throw new ProviderError("올바르지 않은 대화 형식입니다.");
}
export async function chat({ provider, key, model, messages, workspace = "" }) {
  const info = providerInfo(provider),
    headers = credentials(provider, key, workspace);
  validateMessages(messages);
  if (!validModel(model) || modelKind(provider, model) !== "chat")
    throw new ProviderError("설정에서 대화 모델을 선택해 주세요.");
  let url = info.base,
    body;
  if (provider === "openai") {
    url += "/responses";
    body = {
      model,
      instructions: SYSTEM,
      input: messages,
      max_output_tokens: 4096,
      store: false,
    };
  } else if (provider === "anthropic") {
    url += "/messages";
    body = { model, system: SYSTEM, messages, max_tokens: 4096 };
  } else if (provider === "gemini") {
    url += "/models/" + encodeURIComponent(model) + ":generateContent";
    body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 4096 },
    };
  } else {
    url += "/chat/completions";
    body = {
      model,
      messages: [{ role: "system", content: SYSTEM }, ...messages],
      max_completion_tokens: 4096,
    };
  }
  const data = await request(provider, url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let answer = "",
    truncated = false;
  if (provider === "openai") {
    answer = (data.output || [])
      .filter((x) => x.type === "message")
      .flatMap((x) => x.content || [])
      .filter((x) => x.type === "output_text" || x.type === "refusal")
      .map((x) => x.text || x.refusal || "")
      .join("\n");
    truncated = data.status === "incomplete";
  } else if (provider === "anthropic") {
    answer = (data.content || [])
      .filter((x) => x.type === "text")
      .map((x) => x.text)
      .join("\n");
    truncated = data.stop_reason === "max_tokens";
  } else if (provider === "gemini") {
    const candidate = data.candidates?.[0];
    answer = (candidate?.content?.parts || [])
      .filter((x) => !x.thought && typeof x.text === "string")
      .map((x) => x.text)
      .join("\n");
    truncated = candidate?.finishReason === "MAX_TOKENS";
    if (
      !answer &&
      (data.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY")
    )
      throw new ProviderError(
        "AI 제공사가 이 요청에 대한 응답을 제한했습니다.",
        422,
      );
  } else {
    answer = data.choices?.[0]?.message?.content;
    truncated = data.choices?.[0]?.finish_reason === "length";
  }
  if (typeof answer !== "string" || !answer.trim())
    throw new ProviderError(
      "AI 텍스트 응답이 비어 있습니다. 다른 모델을 선택하거나 요청을 짧게 해주세요.",
      502,
    );
  return {
    answer:
      answer +
      (truncated
        ? "\n\n[응답 길이 제한에 도달했습니다. 이어서 설명해 달라고 요청해 주세요.]"
        : ""),
  };
}
export async function transcribe({
  provider,
  key,
  model,
  audio,
  language = "ko-KR",
  workspace = "",
}) {
  if (!["groq", "openai"].includes(provider))
    throw new ProviderError("음성 인식은 Groq 또는 OpenAI를 선택해 주세요.");
  const headers = credentials(provider, key, workspace);
  if (!validModel(model) || modelKind(provider, model) !== "stt")
    throw new ProviderError("음성 인식 모델을 선택해 주세요.");
  if (
    !(audio instanceof ArrayBuffer) ||
    audio.byteLength < 100 ||
    audio.byteLength > 8 * 1024 * 1024
  )
    throw new ProviderError(
      "녹음 크기를 확인해 주세요. 최대 60초까지 말할 수 있습니다.",
    );
  const body = new FormData();
  body.append("file", new Blob([audio], { type: "audio/webm" }), "voice.webm");
  body.append("model", model);
  body.append("response_format", "json");
  if (model === "gpt-transcribe")
    body.append("languages[]", language === "en-US" ? "en" : "ko");
  else body.append("language", language === "en-US" ? "en" : "ko");
  const data = await request(
    provider,
    providerInfo(provider).base + "/audio/transcriptions",
    { method: "POST", headers, body },
  );
  if (typeof data.text !== "string")
    throw new ProviderError("음성 인식 결과를 읽지 못했습니다.", 502);
  return { text: data.text };
}

// Bound decompressed bytes too; a small Content-Length is not sufficient.
async function readUpstreamJson(response) {
  const max = 2 * 1024 * 1024,
    reader = response.body?.getReader();
  if (!reader) throw new ProviderError("AI 응답이 비어 있습니다.", 502);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new ProviderError("AI 응답 크기 제한을 초과했습니다.", 502);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
