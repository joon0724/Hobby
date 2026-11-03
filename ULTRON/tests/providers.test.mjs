import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chat,
  listModels,
  transcribe,
  ProviderError,
} from "../worker/providers.mjs";
const messages = [
  { role: "user", content: "첫 질문" },
  { role: "assistant", content: "첫 답변" },
  { role: "user", content: "다음 질문" },
];
async function mocked(fn, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}
const key = "synthetic-key-for-tests";
test("Groq chat preserves history and chosen model", () =>
  mocked(
    async (url, o) => {
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      assert.equal(o.headers.Authorization, "Bearer " + key);
      const b = JSON.parse(o.body);
      assert.equal(b.model, "llama-3.3-70b-versatile");
      assert.equal(b.messages[0].role, "system");
      assert.deepEqual(b.messages.slice(1), messages);
      return Response.json({
        choices: [{ message: { content: "Groq reply" } }],
      });
    },
    async () =>
      assert.equal(
        (
          await chat({
            provider: "groq",
            key,
            model: "llama-3.3-70b-versatile",
            messages,
          })
        ).answer,
        "Groq reply",
      ),
  ));
test("OpenAI uses Responses, no storage, parses all output messages", () =>
  mocked(
    async (url, o) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const b = JSON.parse(o.body);
      assert.equal(b.store, false);
      assert.deepEqual(b.input, messages);
      assert.ok(b.instructions);
      assert.ok(!("temperature" in b));
      return Response.json({
        output: [
          { type: "reasoning", summary: [] },
          { type: "message", content: [{ type: "output_text", text: "one" }] },
          { type: "message", content: [{ type: "output_text", text: "two" }] },
        ],
      });
    },
    async () =>
      assert.equal(
        (await chat({ provider: "openai", key, model: "gpt-test", messages }))
          .answer,
        "one\ntwo",
      ),
  ));
// Contract references (verified 2026-11-03):
// https://platform.claude.com/docs/en/manage-claude/authentication
// https://platform.claude.com/docs/en/api/versioning
// These are offline contract tests, not a live service verification.
test("Claude sends its system prompt and workspace separately, excludes thinking blocks", () =>
  mocked(
    async (url, o) => {
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(o.headers.Authorization, "Bearer " + key);
      assert.equal(o.headers["anthropic-version"], "2026-10-21");
      assert.equal(o.headers["anthropic-workspace-id"], "wrkspc_test");
      const b = JSON.parse(o.body);
      assert.ok(b.system);
      assert.deepEqual(b.messages, messages);
      return Response.json({
        content: [
          { type: "thinking", thinking: "hidden" },
          { type: "text", text: "Claude reply" },
        ],
      });
    },
    async () =>
      assert.equal(
        (
          await chat({
            provider: "anthropic",
            key,
            workspace: "wrkspc_test",
            model: "claude-test",
            messages,
          })
        ).answer,
        "Claude reply",
      ),
  ));
test("Gemini sends role mapping and key header, excludes thought text", () =>
  mocked(
    async (url, o) => {
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
      );
      assert.ok(!url.includes(key));
      assert.equal(o.headers["x-goog-api-key"], key);
      const b = JSON.parse(o.body);
      assert.equal(b.contents[1].role, "model");
      assert.equal(b.contents[1].parts[0].text, "첫 답변");
      assert.ok(b.systemInstruction);
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                { text: "hidden", thought: true },
                { text: "Gemini reply" },
              ],
            },
          },
        ],
      });
    },
    async () =>
      assert.equal(
        (
          await chat({
            provider: "gemini",
            key,
            model: "gemini-test",
            messages,
          })
        ).answer,
        "Gemini reply",
      ),
  ));
test("Gemini model list follows pagination and filters supported text models", () => {
  let calls = 0;
  return mocked(
    async (url, o) => {
      assert.equal(o.headers["x-goog-api-key"], key);
      if (!calls++) {
        return Response.json({
          models: [
            {
              name: "models/gemini-chat",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-image",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
          nextPageToken: "next token",
        });
      }
      assert.match(url, /pageToken=next\+token/);
      return Response.json({
        models: [
          {
            name: "models/gemini-next",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/embedding",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      });
    },
    async () =>
      assert.deepEqual(
        (await listModels({ provider: "gemini", key })).models.map((m) => m.id),
        ["gemini-chat", "gemini-next"],
      ),
  );
});
test("Claude model list follows its cursor, preserving scoped auth", () => {
  let calls = 0;
  return mocked(
    async (url, o) => {
      assert.equal(o.headers["anthropic-workspace-id"], "wrkspc_test");
      return Response.json(
        !calls++
          ? { data: [{ id: "claude-a" }], has_more: true, last_id: "claude-a" }
          : { data: [{ id: "claude-b" }], has_more: false },
      );
    },
    async () =>
      assert.equal(
        (
          await listModels({
            provider: "anthropic",
            key,
            workspace: "wrkspc_test",
          })
        ).models.length,
        2,
      ),
  );
});
for (const provider of ["groq", "openai"])
  test(provider + " transcription uses independent audio model and key", () =>
    mocked(
      async (url, o) => {
        assert.match(url, /\/audio\/transcriptions$/);
        assert.equal(o.headers.Authorization, "Bearer audio-only-key");
        assert.equal(
          o.body.get("model"),
          provider === "groq" ? "whisper-large-v3-turbo" : "gpt-transcribe",
        );
        assert.equal(
          o.body.get(provider === "openai" ? "languages[]" : "language"),
          "ko",
        );
        assert.equal(o.body.get("file").type, "audio/webm");
        return Response.json({ text: "음성 결과" });
      },
      async () =>
        assert.equal(
          (
            await transcribe({
              provider,
              key: "audio-only-key",
              model:
                provider === "groq"
                  ? "whisper-large-v3-turbo"
                  : "gpt-transcribe",
              audio: new Uint8Array(200).buffer,
            })
          ).text,
          "음성 결과",
        ),
    ),
  );
test("invalid provider, system injection and invalid models never reach network", () =>
  mocked(
    async () => {
      assert.fail("Unexpected network call");
    },
    async () => {
      for (const args of [
        { provider: "unknown", key, model: "x", messages },
        {
          provider: "groq",
          key,
          model: "llama",
          messages: [{ role: "system", content: "injected" }],
        },
        { provider: "gemini", key, model: "../../attack?key=oops", messages },
        { provider: "openai", key, model: "gpt-image-1", messages },
      ])
        await assert.rejects(chat(args), ProviderError);
      await assert.rejects(
        transcribe({
          provider: "anthropic",
          key,
          model: "claude-test",
          audio: new Uint8Array(200).buffer,
        }),
        ProviderError,
      );
    },
  ));
test("auth failures do not leak provider payloads or request keys", () =>
  mocked(
    async () => new Response("SENSITIVE " + key, { status: 401 }),
    async () => {
      for (const provider of ["groq", "openai", "anthropic", "gemini"])
        await assert.rejects(
          listModels({ provider, key }),
          (e) =>
            e instanceof ProviderError &&
            !e.message.includes(key) &&
            !e.message.includes("SENSITIVE"),
        );
    },
  ));
test("filtered or empty answers are explicit failures", () =>
  mocked(
    async () => Response.json({ promptFeedback: { blockReason: "SAFETY" } }),
    async () => {
      await assert.rejects(
        chat({ provider: "gemini", key, model: "gemini-test", messages }),
        (e) => e.status === 422,
      );
      await assert.rejects(
        chat({ provider: "openai", key, model: "gpt-test", messages }),
        (e) => e.status === 502,
      );
    },
  ));
test("partial answer keeps text and reports truncation", () =>
  mocked(
    async () =>
      Response.json({
        content: [{ type: "text", text: "partial" }],
        stop_reason: "max_tokens",
      }),
    async () =>
      assert.match(
        (
          await chat({
            provider: "anthropic",
            key,
            model: "claude-test",
            messages,
          })
        ).answer,
        /partial[\s\S]*길이 제한/,
      ),
  ));
