import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import { boundedHistory, MAX_JSON_BYTES } from "../shared/conversation.mjs";
import { parseLocalCommand } from "../shared/commands.mjs";
import { chat, listModels } from "../worker/providers.mjs";
import { trustedWorker as worker, createWebFixture } from "./web-fixture.mjs";
const require = createRequire(import.meta.url);
const { trustedSender } = require("../desktop/security.cjs");
const {
  renameWithRetry,
  renameWithRetrySync,
} = require("../desktop/file-ops.cjs");
const makeRequest = (body, key = "regression-personal-key", headers = {}) =>
  new Request("https://ultron.test/api/chat", {
    method: "POST",
    headers: { Origin: "https://ultron.test", "X-Ultron-Key": key, ...headers },
    body: JSON.stringify(body),
  });
const input = {
  provider: "groq",
  model: "llama-test",
  messages: [{ role: "user", content: "hi" }],
};
async function mockFetch(fn, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("long answers and 50 later turns never poison subsequent requests", () =>
  mockFetch(
    async () =>
      Response.json({
        choices: [{ message: { content: "긴 답변".repeat(3000) } }],
      }),
    async () => {
      let history = [];
      for (let turn = 0; turn < 50; turn++) {
        const messages = boundedHistory([
          ...history,
          { role: "user", content: "질문".repeat(2900) },
        ]);
        const result = await chat({
          ...input,
          key: "synthetic-long-key",
          messages,
        });
        assert.ok(result.answer.length > 6000);
        history = boundedHistory([
          ...messages,
          { role: "assistant", content: result.answer },
        ]);
        assert.ok(JSON.stringify(history).length <= 40000);
        assert.ok(history.length <= 12);
        assert.equal(history[0].role, "user");
      }
    },
  ));

test("Korean multibyte history over the previous byte limit is accepted", () =>
  mockFetch(
    async () => Response.json({ choices: [{ message: { content: "성공" } }] }),
    async () => {
      const messages = Array.from({ length: 7 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: "한".repeat(5000),
      }));
      const body = JSON.stringify({ ...input, messages });
      assert.ok(Buffer.byteLength(body) > 45000);
      assert.ok(Buffer.byteLength(body) < MAX_JSON_BYTES);
      const r = await worker.fetch(makeRequest({ ...input, messages }));
      assert.equal(r.status, 200);
      assert.equal((await r.json()).answer, "성공");
    },
  ));

test("general questions stay with AI instead of triggering local actions", () => {
  for (const text of [
    "메모리 누수 설명해줘",
    "파이썬 날짜 포맷",
    "시스템 설계 알려줘",
    "이 기능을 설명해 줘",
    "Can you help me with JavaScript?",
    "무엇을 할 수 있는지 분석해줘",
    "notes 앱 비교해줘",
    "메모 작성 앱 추천해줘",
  ])
    assert.equal(parseLocalCommand(text), null, text);
  for (const [text, type] of [
    ["메모: 우유 사기", "save-note"],
    ["메모해 줘 우유 사기", "save-note"],
    ["메모 보여줘", "notes"],
    ["메모 목록 보여줘", "notes"],
    ["오늘 날짜가 뭐야", "date"],
    ["울트론, 지금 몇 시야?", "time"],
    ["오늘 날짜", "date"],
    ["시스템 상태", "status"],
    ["도움말", "help"],
  ])
    assert.equal(parseLocalCommand(text)?.type, type, text);
});

test("web rejects absent, null, cross-site Origin and forged Fetch Metadata", async () => {
  for (const origin of [null, "null", "https://evil.test"]) {
    const req = makeRequest(input);
    if (origin === null) req.headers.delete("Origin");
    else req.headers.set("Origin", origin);
    assert.equal((await worker.fetch(req)).status, 403);
  }
  assert.equal(
    (
      await worker.fetch(
        makeRequest(input, undefined, { "Sec-Fetch-Site": "cross-site" }),
      )
    ).status,
    403,
  );
});

test("web and widget allow only the exact built script via CSP hash", async () => {
  const response = await worker.fetch(new Request("https://ultron.test/"));
  const html = await response.text();
  const widget = await readFile(
    new URL("../dist/widget.html", import.meta.url),
    "utf8",
  );
  for (const [page, csp] of [
    [html, response.headers.get("Content-Security-Policy")],
    [
      widget,
      widget.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1],
    ],
  ]) {
    const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.ok(
      csp.includes(
        "'sha256-" + createHash("sha256").update(script).digest("base64") + "'",
      ),
    );
    assert.doesNotMatch(csp, /unsafe-inline/);
    const style = page.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.ok(
      csp.includes(
        "sha256-" + createHash("sha256").update(style).digest("base64"),
      ),
    );
    assert.doesNotMatch(
      page,
      /fonts\.googleapis|__ULTRON_PAGE__|\/\*__SHARED__\*\//,
    );
    new vm.Script(script);
  }
  assert.match(
    response.headers.get("Content-Security-Policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
});

test("upstream response size is enforced with and without declared length", async () => {
  for (const header of [{}, { "Content-Length": "10" }]) {
    let cancelled = false;
    await mockFetch(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(1024 * 1024));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: header },
        ),
      async () => {
        await assert.rejects(
          listModels({ provider: "groq", key: "synthetic-response-key" }),
          /크기 제한/,
        );
        assert.ok(cancelled);
      },
    );
  }
});

test("IPC accepts only the original top-level frame and local entry", () => {
  const entry = "file:///app/widget.html",
    frame = { url: entry },
    contents = { mainFrame: frame },
    window = { webContents: contents, isDestroyed: () => false };
  assert.ok(
    trustedSender({ sender: contents, senderFrame: frame }, window, entry),
  );
  assert.equal(
    trustedSender({ sender: {}, senderFrame: frame }, window, entry),
    false,
  );
  assert.equal(
    trustedSender(
      { sender: contents, senderFrame: { url: entry } },
      window,
      entry,
    ),
    false,
  );
  frame.url = "https://attacker.test";
  assert.equal(
    trustedSender({ sender: contents, senderFrame: frame }, window, entry),
    false,
  );
  assert.equal(trustedSender({}, null, entry), false);
});

test("transient Windows rename locks retry; permanent errors propagate", async () => {
  let n = 0;
  await renameWithRetry("a", "b", async () => {
    if (++n < 3) throw Object.assign(Error("locked"), { code: "EPERM" });
  });
  assert.equal(n, 3);
  n = 0;
  renameWithRetrySync("a", "b", () => {
    if (++n < 2) throw Object.assign(Error("busy"), { code: "EBUSY" });
  });
  assert.equal(n, 2);
  await assert.rejects(
    renameWithRetry("a", "b", async () => {
      throw Object.assign(Error("missing"), { code: "ENOENT" });
    }),
    /missing/,
  );
});
