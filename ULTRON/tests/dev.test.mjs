import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createDevServer } from "../scripts/dev.mjs";
test("dev HTTP transport accepts Korean history and bounds huge bodies", async () => {
  const server = createDevServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  try {
    const body = JSON.stringify({
      provider: "groq",
      model: "llama-test",
      messages: Array.from({ length: 7 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: "한".repeat(5000),
      })),
    });
    const ok = await fetch(origin + "/api/chat", {
      method: "POST",
      headers: { Origin: origin },
      body,
    });
    // No API key: accepted by the HTTP size gate, then rejected by authentication.
    assert.equal(ok.status, 503);
    const large = await fetch(origin + "/api/chat", {
      method: "POST",
      headers: { Origin: origin },
      body: "x".repeat(270000),
    });
    assert.equal(large.status, 413);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
