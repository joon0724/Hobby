import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const source = await readFile(
  new URL("../ui/storage.js", import.meta.url),
  "utf8",
);
function harness() {
  const elements = new Map(),
    calls = [],
    messages = [];
  let result = { data: { "ultron.privacy": { saveConversation: false } } };
  const $ = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        checked: true,
        hidden: false,
        textContent: "previous response",
      });
    return elements.get(id);
  };
  const desktop = {
    loadData: () => ({
      data: { "ultron.privacy": { saveConversation: true } },
    }),
    setChatPrivacy: async (enabled) => {
      calls.push(["privacy", enabled]);
      return result;
    },
    clearChat: async () => {
      calls.push(["clear"]);
      return result;
    },
    purgeRecovery: async () => {
      calls.push(["purge"]);
      return result;
    },
  };
  const context = vm.createContext({
    desktop,
    $,
    busy: false,
    chatHistory: [{ role: "user", content: "private" }],
    localStorage: { getItem: () => null },
    toast: (m) => messages.push(m),
    stopSpeech: () => {},
    location: { reload: () => {} },
  });
  vm.runInContext(source, context);
  vm.runInContext("initPrivacy()", context);
  return { $, calls, messages, context, result: (v) => (result = v) };
}
test("initPrivacy save-off persists the choice but retains current conversation", async () => {
  const h = harness();
  h.$("#save-conversation").checked = false;
  await h.$("#save-conversation").onchange();
  assert.deepEqual(h.calls, [["privacy", false]]);
  assert.equal(h.context.chatHistory.length, 1);
  assert.match(h.messages.at(-1), /저장.*끄고/);
});
test("initPrivacy cancellation/failure rolls the checkbox back without claiming success", async () => {
  for (const result of [{ cancelled: true }, { error: "failed" }]) {
    const h = harness();
    h.result(result);
    h.$("#save-conversation").checked = false;
    await h.$("#save-conversation").onchange();
    assert.equal(h.$("#save-conversation").checked, true);
    assert.equal(h.context.chatHistory.length, 1);
  }
});
test("initPrivacy clear only empties UI after native deletion succeeds", async () => {
  const h = harness();
  h.result({ cancelled: true });
  await h.$("#clear-conversation").onclick();
  assert.equal(h.context.chatHistory.length, 1);
  h.result({ error: "failed" });
  await h.$("#clear-conversation").onclick();
  assert.equal(h.context.chatHistory.length, 1);
  h.result({ data: {} });
  await h.$("#clear-conversation").onclick();
  assert.equal(h.context.chatHistory.length, 0);
  assert.match(h.$("#last-response p").textContent, /삭제/);
});
test("initPrivacy blocks deletion during a response and exposes recovery-file deletion", async () => {
  const h = harness();
  h.context.busy = true;
  await h.$("#clear-conversation").onclick();
  assert.equal(h.calls.length, 0);
  h.context.busy = false;
  h.result({ removed: 2 });
  await h.$("#purge-recovery").onclick();
  assert.deepEqual(h.calls, [["purge"]]);
  assert.match(h.messages.at(-1), /2개/);
});
