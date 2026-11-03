import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  existsSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const { createStore, dataDirectory } = require("../desktop/data-store.cjs");
import { boundedHistory } from "../shared/conversation.mjs";
const workspace = resolve(import.meta.dirname, "../.build/tests"),
  fixtures = [];
mkdirSync(workspace, { recursive: true });
after(() => {
  for (const root of fixtures) {
    if (!root.startsWith(join(workspace, "ultron-persistence-")))
      throw Error("Unexpected test path");
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(workspace, "ultron-persistence-"));
  fixtures.push(root);
  return { root, profile: dataDirectory(join(root, "AppData")) };
}
test("moving the application folder keeps notes, model choices, conversation and window settings", () => {
  const { root, profile } = fixture();
  const oldApp = join(root, "old-app"),
    newApp = join(root, "new-app");
  mkdirSync(oldApp);
  writeFileSync(join(oldApp, "app.txt"), "test app");
  const original = createStore(profile);
  original.set("ultron.notes", [{ text: "keep this note" }]);
  original.set("ultron.ai", {
    chatProvider: "anthropic",
    chatModels: { anthropic: "claude-test" },
  });
  original.set("ultron.chat", {
    messages: [{ role: "user", content: "keep conversation" }],
  });
  original.set("ultron.window", {
    width: 420,
    height: 660,
    alwaysOnTop: false,
  });
  // Both absolute locations are children of this test-only workspace folder.
  assert.equal(resolve(newApp, ".."), root);
  assert.equal(resolve(oldApp, ".."), root);
  renameSync(oldApp, newApp);
  const restarted = createStore(dataDirectory(join(root, "AppData")));
  assert.deepEqual(restarted.load(), original.load());
  assert.equal(restarted.get("ultron.notes")[0].text, "keep this note");
  assert.ok(existsSync(join(newApp, "app.txt")));
});
test("legacy browser values migrate once and never overwrite newer persisted values", () => {
  const { profile } = fixture();
  let store = createStore(profile);
  store.load({
    "ultron.notes": [{ text: "old" }],
    "ultron.ai": { chatProvider: "groq" },
    "api-key": "must not migrate",
  });
  store.set("ultron.notes", [{ text: "new" }]);
  store = createStore(profile);
  store.load({ "ultron.notes": [{ text: "stale" }] });
  assert.equal(store.get("ultron.notes")[0].text, "new");
  assert.equal(store.get("api-key", null), null);
});
test("corrupted primary recovers a valid backup without destroying it", () => {
  const { profile } = fixture();
  const store = createStore(profile);
  store.set("ultron.notes", [{ text: "backup note" }]);
  store.set("ultron.preferences", { voiceOn: false });
  const file = join(profile, "data", "state.json");
  writeFileSync(file, "broken");
  const recovered = createStore(profile);
  assert.equal(recovered.get("ultron.notes")[0].text, "backup note");
  recovered.set("ultron.preferences", { voiceOn: true });
  assert.doesNotThrow(() => JSON.parse(readFileSync(file + ".bak", "utf8")));
  assert.equal(createStore(profile).get("ultron.preferences").voiceOn, true);
});
test("unreadable existing state is preserved instead of overwritten with defaults", () => {
  const { profile } = fixture();
  const file = join(profile, "data", "state.json");
  mkdirSync(join(profile, "data"), { recursive: true });
  writeFileSync(file, "broken original");
  const store = createStore(profile);
  assert.throws(() => store.load());
  assert.throws(() => store.set("ultron.notes", []));
  assert.equal(readFileSync(file, "utf8"), "broken original");
});
test("renderer cannot store arbitrary files or native window state", () => {
  const { profile } = fixture();
  const store = createStore(profile);
  assert.throws(() => store.rendererSet("../ai-key-groq.bin", "key"));
  assert.throws(() => store.rendererSet("ultron.window", {}));
  assert.throws(() => store.rendererSet("apiKey", "secret"));
  assert.throws(() => store.set("ultron.notes", ["x".repeat(1024 * 1024)]));
});
test("desktop UI reads migrated settings from its native store after the old browser storage disappears", () => {
  const { profile } = fixture();
  const store = createStore(profile);
  const storageSource = readFileSync(
    new URL("../ui/storage.js", import.meta.url),
    "utf8",
  );
  const makeContext = (legacy) =>
    vm.createContext({
      boundedHistory,
      desktop: {
        loadData: (data) => ({ data: store.load(data) }),
        saveData: (key, value) => ({ ok: store.rendererSet(key, value) }),
      },
      localStorage: { getItem: (key) => legacy[key] ?? null },
      toast: () => {},
    });
  let first = makeContext({
    "ultron.notes": JSON.stringify([{ text: "migrated note" }]),
  });
  vm.runInContext(storageSource, first);
  assert.equal(
    vm.runInContext("read('ultron.notes',[])[0].text", first),
    "migrated note",
  );
  vm.runInContext("save('ultron.preferences',{voiceOn:false})", first);
  const afterMove = makeContext({});
  vm.runInContext(storageSource, afterMove);
  assert.equal(
    vm.runInContext("read('ultron.notes',[])[0].text", afterMove),
    "migrated note",
  );
  assert.equal(
    vm.runInContext("read('ultron.preferences',{}).voiceOn", afterMove),
    false,
  );
});
test("conversation is restored only to the same provider and model", () => {
  const { profile } = fixture();
  const store = createStore(profile);
  store.set("ultron.chat", {
    provider: "anthropic",
    model: "claude-test",
    messages: [{ role: "user", content: "previous question" }],
    lastResponse: "previous answer",
  });
  const response = { textContent: "" };
  const context = vm.createContext({
    boundedHistory,
    desktop: { loadData: () => ({ data: store.load() }) },
    localStorage: { getItem: () => null },
    selectedProvider: () => context.provider,
    selectedModel: () => context.model,
    provider: "openai",
    model: "gpt-test",
    chatHistory: [],
    $: () => response,
  });
  vm.runInContext(
    readFileSync(new URL("../ui/storage.js", import.meta.url), "utf8"),
    context,
  );
  vm.runInContext("restoreChat()", context);
  assert.equal(context.chatHistory.length, 0);
  context.provider = "anthropic";
  context.model = "claude-test";
  vm.runInContext("restoreChat()", context);
  assert.equal(context.chatHistory[0].content, "previous question");
  assert.equal(response.textContent, "previous answer");
});

test("chat deletion and saving opt-out purge both current and backup copies", () => {
  const { profile } = fixture();
  const store = createStore(profile);
  store.set("ultron.chat", {
    messages: [{ role: "user", content: "private conversation" }],
  });
  store.set("ultron.notes", [{ text: "keep note" }]);
  store.chatPrivacy(false);
  store.set("ultron.chat", { lastResponse: "must not save" });
  for (const file of ["state.json", "state.json.bak"]) {
    const value = readFileSync(join(profile, "data", file), "utf8");
    assert.ok(!value.includes("private conversation"));
    assert.ok(!value.includes("must not save"));
  }
  assert.equal(
    createStore(profile).get("ultron.privacy").saveConversation,
    false,
  );
  assert.equal(store.get("ultron.notes")[0].text, "keep note");
  store.chatPrivacy(true);
  store.set("ultron.chat", { lastResponse: "new conversation" });
  store.clearChat();
  for (const file of ["state.json", "state.json.bak"])
    assert.ok(
      !readFileSync(join(profile, "data", file), "utf8").includes(
        "new conversation",
      ),
    );
});
test("explicit recovery preserves unreadable files and resumes saving", () => {
  const { profile } = fixture();
  const file = join(profile, "data", "state.json");
  mkdirSync(join(profile, "data"), { recursive: true });
  writeFileSync(file, "corrupt private data");
  const store = createStore(profile);
  assert.throws(() => store.load());
  store.recover();
  store.set("ultron.notes", [{ text: "recovered" }]);
  assert.equal(createStore(profile).get("ultron.notes")[0].text, "recovered");
});
test("renderer read returns a detached copy of cached data", () => {
  const { profile } = fixture();
  const store = createStore(profile);
  store.set("ultron.notes", [{ text: "original" }]);
  const context = vm.createContext({
    boundedHistory,
    desktop: { loadData: () => ({ data: store.load() }) },
    localStorage: { getItem: () => null },
  });
  vm.runInContext(
    readFileSync(new URL("../ui/storage.js", import.meta.url), "utf8"),
    context,
  );
  vm.runInContext("read('ultron.notes',[])[0].text='mutated'", context);
  assert.equal(
    vm.runInContext("read('ultron.notes',[])[0].text", context),
    "original",
  );
});

test("conversation deletion purges matching unreadable recovery files but leaves other files and current notes", () => {
  const { profile } = fixture();
  const store = createStore(profile);
  store.set("ultron.notes", [{ text: "current note" }]);
  const directory = join(profile, "data");
  writeFileSync(
    join(directory, "state.json.unreadable-123"),
    "private old note",
  );
  writeFileSync(
    join(directory, "state.json.bak.unreadable-124"),
    "private old chat",
  );
  writeFileSync(join(directory, "keep.txt"), "unrelated");
  assert.equal(store.recoveryCount(), 2);
  store.clearChat();
  assert.equal(store.recoveryCount(), 0);
  assert.equal(store.get("ultron.notes")[0].text, "current note");
  assert.ok(existsSync(join(directory, "keep.txt")));
});
