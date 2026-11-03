import { test } from "node:test";
import assert from "node:assert/strict";
import { trustedWorker as worker, createWebFixture } from "./web-fixture.mjs";
const req = (path, body, headers = {}) =>
  new Request(
    "https://ultron.test" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://ultron.test",
            ...headers,
          },
          body: JSON.stringify(body),
        },
  );
const input = {
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "user", content: "hi" }],
};
test("built page contains four providers, separate voice settings and no placeholders", async () => {
  const html = await (await worker.fetch(req("/"))).text();
  for (const id of [
    "chat-provider",
    "stt-provider",
    "chat-model",
    "stt-model",
    "gemini",
    "anthropic",
  ])
    assert.ok(html.includes(id));
  assert.doesNotMatch(
    html,
    /__ULTRON_PAGE__|\/\*__(CSS|JS|CONNECTIONS|CORE3D|STORAGE)__\*\//,
  );
});
test("server environment key is never used for another user", async () => {
  const r = await worker.fetch(req("/api/chat", input), {
    GROQ_API_KEY: "private-shared-key",
  });
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes("private-shared-key"));
});
test("all personal-key routes reject cross-origin requests and GET", async () => {
  for (const path of ["/api/chat", "/api/key-check", "/api/transcribe"]) {
    assert.equal((await worker.fetch(req(path))).status, 405);
    assert.equal(
      (await worker.fetch(req(path, {}, { Origin: "https://attacker.test" })))
        .status,
      403,
    );
  }
});
test("oversized requests are bounded even without Content-Length", async () => {
  const r = await worker.fetch(
    req(
      "/api/chat",
      { ...input, padding: "x".repeat(270000) },
      { "X-Ultron-Key": "oversize-test-key" },
    ),
  );
  assert.equal(r.status, 413);
});
test("each request uses only its own personal key", async () => {
  const original = globalThis.fetch,
    seen = [];
  globalThis.fetch = async (url, o) => {
    seen.push(o.headers.Authorization);
    return Response.json({ choices: [{ message: { content: "reply" } }] });
  };
  try {
    for (const key of ["personal-user-one", "personal-user-two"]) {
      const r = await worker.fetch(
        req("/api/chat", input, { "X-Ultron-Key": key }),
      );
      assert.equal(r.status, 200);
      assert.ok(!(await r.text()).includes(key));
    }
    assert.deepEqual(seen, [
      "Bearer personal-user-one",
      "Bearer personal-user-two",
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
test("provider selection and models are passed through key-check route", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    assert.ok(url.startsWith("https://api.openai.com/v1/models"));
    assert.equal(o.headers.Authorization, "Bearer personal-openai-key");
    return Response.json({
      data: [
        { id: "gpt-test" },
        { id: "gpt-transcribe" },
        { id: "text-embedding-3-small" },
      ],
    });
  };
  try {
    const r = await worker.fetch(
      req(
        "/api/key-check",
        { provider: "openai" },
        { "X-Ultron-Key": "personal-openai-key" },
      ),
    );
    assert.equal(r.status, 200);
    assert.deepEqual(
      (await r.json()).models.map((m) => m.kind),
      ["chat", "stt"],
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("audio route forwards only the selected speech provider and returns transcript", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, o) => {
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(o.headers.Authorization, "Bearer personal-audio-key");
    return Response.json({ text: "voice text" });
  };
  try {
    const r = await worker.fetch(
      new Request("https://ultron.test/api/transcribe", {
        method: "POST",
        headers: {
          Origin: "https://ultron.test",
          "X-Ultron-Provider": "openai",
          "X-Ultron-Model": "gpt-transcribe",
          "X-Ultron-Key": "personal-audio-key",
        },
        body: new Uint8Array(200),
      }),
    );
    assert.equal(r.status, 200);
    assert.equal((await r.json()).text, "voice text");
  } finally {
    globalThis.fetch = original;
  }
});
