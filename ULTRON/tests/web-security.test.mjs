import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/server/index.js";
import { createWebFixture } from "./web-fixture.mjs";
const req = (i = 0, path = "/api/chat") =>
  new Request("https://ultron.test" + path, {
    method: "POST",
    headers: {
      Origin: "https://ultron.test",
      "X-Ultron-Key": "fake-rotating-key-" + i,
      "oai-authenticated-user-id": String(i),
      "X-Forwarded-For": "198.51.100." + (i % 255),
    },
    body: JSON.stringify({
      provider: "groq",
      model: "llama-test",
      messages: [{ role: "user", content: "test" }],
    }),
  });
async function mocked(run) {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      choices: [{ message: { content: "ok" } }],
      data: [{ id: "llama-test" }],
    });
  };
  try {
    await run(() => calls);
  } finally {
    globalThis.fetch = original;
  }
}
test("500 rotating keys share one IP budget; fresh normal client is unaffected", () =>
  mocked(async (count) => {
    const f = createWebFixture();
    let allowed = 0;
    for (let i = 0; i < 500; i++) {
      const response = await f.fetch(req(i));
      if (response.status === 200) allowed++;
      else assert.equal(response.status, 429);
    }
    assert.equal(allowed, 40);
    assert.equal(count(), 40);
    assert.equal(f.namespace.objects.size, 1);
    assert.equal(
      (await f.fetch(req(501), {}, { ip: "192.0.2.2" })).status,
      200,
    );
  }));
test("over 2048 fake keys allocate no key table and cannot lock a new client out", () =>
  mocked(async (count) => {
    const f = createWebFixture();
    for (let i = 0; i < 2100; i++) await f.fetch(req(i));
    assert.equal(f.namespace.objects.size, 1);
    assert.equal(count(), 40);
    assert.equal(
      (await f.fetch(req(2200), {}, { ip: "192.0.2.3" })).status,
      200,
    );
  }));
test("key-check has a smaller shared budget across all providers", () =>
  mocked(async (count) => {
    const f = createWebFixture();
    for (let i = 0; i < 30; i++) {
      const r = req(i, "/api/key-check");
      assert.equal((await f.fetch(r)).status, i < 8 ? 200 : 429);
    }
    assert.equal(count(), 8);
  }));
test("forged Origin, IP and identity headers cannot impersonate platform authentication", () =>
  mocked(async (count) => {
    const f = createWebFixture();
    assert.equal((await worker.fetch(req())).status, 503);
    assert.equal(
      (await f.fetch(req(), {}, { authenticated: false })).status,
      401,
    );
    const r = req();
    r.headers.set("Cf-Access-Jwt-Assertion", "forged");
    assert.equal((await f.fetch(r, {}, { authenticated: false })).status, 401);
    assert.equal(count(), 0);
  }));
test("same shared limiter serializes concurrent requests across worker invocations", () =>
  mocked(async (count) => {
    const f = createWebFixture();
    const results = await Promise.all(
      Array.from({ length: 80 }, (_, i) => f.fetch(req(i))),
    );
    assert.equal(results.filter((r) => r.status === 200).length, 40);
    assert.equal(count(), 40);
  }));
test("configured public Origin supports TLS termination without trusting forwarded headers", () =>
  mocked(async () => {
    const f = createWebFixture();
    const original = req();
    const internal = new Request("http://internal:8080/api/chat", original);
    assert.equal((await f.fetch(internal)).status, 200);
    const bad = req();
    bad.headers.set("Origin", "https://attacker.test");
    bad.headers.set("X-Forwarded-Host", "attacker.test");
    bad.headers.set("X-Forwarded-Proto", "https");
    assert.equal((await f.fetch(bad)).status, 403);
  }));
test("shared limiter errors fail closed before provider calls", () =>
  mocked(async (count) => {
    const f = createWebFixture();
    const broken = {
      idFromName: (x) => x,
      get: () => ({
        fetch: async () => {
          throw Error("offline");
        },
      }),
    };
    assert.equal(
      (await f.fetch(req(), { ULTRON_LIMITER: broken })).status,
      503,
    );
    assert.equal(count(), 0);
  }));
