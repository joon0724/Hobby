import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(
  new URL("../ui/connections.js", import.meta.url),
  "utf8",
);
function harness() {
  const elements = new Map(),
    saved = [],
    calls = [];
  class Element {
    constructor() {
      this.value = "";
      this.checked = false;
      this.options = [];
      this.textContent = "";
    }
    replaceChildren(...options) {
      this.options = options;
      this.value = options[0]?.value || "";
    }
    add(option) {
      this.options.push(option);
    }
    remove() {}
    setAttribute() {}
    showModal() {
      this.open = true;
    }
  }
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const context = vm.createContext({
    desktop: null,
    $,
    $$: () => [...elements.values()],
    read: () => ({}),
    save: (key, data) => saved.push(JSON.stringify({ key, data })),
    busy: false,
    listening: false,
    micStarting: false,
    configured: false,
    chatHistory: [{ role: "user", content: "private previous conversation" }],
    toast: () => {},
    saveChat: () => {},
    Option: class {
      constructor(text, value) {
        this.text = text;
        this.value = value;
      }
    },
    AbortSignal,
    window: { open: () => {} },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === "/api/key-check") {
        const provider = JSON.parse(options.body).provider;
        return Response.json({
          models: [
            { id: provider + "-chat", kind: "chat" },
            { id: provider + "-stt", kind: "stt" },
          ],
        });
      }
      return Response.json({ answer: "reply", text: "speech" });
    },
  });
  vm.runInContext(source, context);
  vm.runInContext("initConnections()", context);
  return { $, context, saved, calls, run: (s) => vm.runInContext(s, context) };
}
async function choose(h, role, provider) {
  h.$("#" + role + "-provider").value = provider;
  h.$("#" + role + "-provider").onchange();
  await Promise.resolve();
}
async function connect(h, role, key) {
  h.$("#" + role + "-key").value = key;
  await h.run(`connectKey('${role}')`);
  const p = h.run(`selectedProvider('${role}')`);
  h.$("#" + role + "-model").value = p + "-" + role;
  h.$("#" + role + "-model").onchange();
}
test("provider switch resets conversation and never uses the old provider key", async () => {
  const h = harness();
  await connect(h, "chat", "groq-personal-synthetic");
  assert.equal(h.context.configured, true);
  await choose(h, "chat", "anthropic");
  assert.equal(h.context.configured, false);
  assert.equal(h.context.chatHistory.length, 0);
  assert.equal(h.$("#chat-key").value, "");
  await connect(h, "chat", "claude-personal-synthetic");
  await h.run("requestChat([{role:'user',content:'new conversation'}])");
  const c = h.calls.at(-1);
  assert.equal(c.options.headers["X-Ultron-Key"], "claude-personal-synthetic");
  assert.equal(JSON.parse(c.options.body).provider, "anthropic");
  assert.ok(h.saved.every((s) => !s.includes("personal-synthetic")));
});
test("voice and conversation use independently selected provider and key", async () => {
  const h = harness();
  await choose(h, "chat", "anthropic");
  await connect(h, "chat", "claude-personal-synthetic");
  await choose(h, "stt", "openai");
  await connect(h, "stt", "openai-personal-synthetic");
  await h.run("requestTranscription(new Uint8Array(200).buffer,'ko-KR')");
  const speech = h.calls.at(-1);
  assert.equal(speech.options.headers["X-Ultron-Provider"], "openai");
  assert.equal(
    speech.options.headers["X-Ultron-Key"],
    "openai-personal-synthetic",
  );
  await h.run("requestChat([{role:'user',content:'hello'}])");
  assert.equal(
    h.calls.at(-1).options.headers["X-Ultron-Key"],
    "claude-personal-synthetic",
  );
});
test("forgetting a shared provider disconnects chat and voice without affecting another provider", async () => {
  const h = harness();
  await connect(h, "chat", "groq-personal-synthetic");
  await choose(h, "stt", "groq");
  h.$("#stt-model").value = "groq-stt";
  h.$("#stt-model").onchange();
  await h.run("forgetKey('stt')");
  assert.equal(h.context.configured, false);
  assert.equal(h.run("selectedModel('chat')"), "");
  assert.equal(h.run("selectedModel('stt')"), "");
  assert.equal(h.run("personalKeys.groq"), undefined);
});
test("pending request blocks changing provider, so requests cannot change destination midflight", async () => {
  const h = harness();
  await connect(h, "chat", "groq-personal-synthetic");
  h.context.busy = true;
  await choose(h, "chat", "openai");
  assert.equal(h.run("selectedProvider('chat')"), "groq");
  assert.equal(h.$("#chat-provider").value, "groq");
});
test("failed key replacement retains previous usable key and does not save the candidate", async () => {
  const h = harness();
  await connect(h, "chat", "groq-personal-synthetic");
  h.context.fetch = async () => Response.json({ error: "Rejected key" });
  h.$("#chat-key").value = "bad-candidate-synthetic";
  await h.run("connectKey('chat')");
  assert.equal(h.run("personalKeys.groq"), "groq-personal-synthetic");
  assert.match(h.$("#chat-status").textContent, /Rejected/);
  assert.ok(h.saved.every((s) => !s.includes("synthetic")));
});

test("web chat and transcription fail locally before sending an undefined key", async () => {
  const h = harness();
  await assert.rejects(
    h.run("requestChat([{role:'user',content:'hi'}])"),
    /키를 연결/,
  );
  await choose(h, "stt", "openai");
  await assert.rejects(
    h.run("requestTranscription(new Uint8Array(200).buffer,'ko-KR')"),
    /키를 연결/,
  );
  assert.equal(h.calls.length, 0);
});

test("desktop startup restores model catalog without asking to re-enter a saved key", async () => {
  const h = harness();
  let loads = 0;
  h.context.desktop = {
    status: async () => ({
      providers: { groq: { configured: true, remembered: true, models: [] } },
      alwaysOnTop: false,
    }),
    models: async (p) => {
      assert.equal(p, "groq");
      loads++;
      return { models: [{ id: "llama-saved", kind: "chat" }] };
    },
  };
  h.run("apiPrefs.chatModels.groq='llama-saved'");
  await h.run("status()");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 1);
  assert.equal(h.$("#chat-model").value, "llama-saved");
  assert.equal(h.context.configured, true);
  assert.ok(h.$("#chat-model").options.some((o) => o.value === "llama-saved"));
});
