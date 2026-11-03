import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { EventEmitter } from "node:events";
import {
  ProviderError,
  providerInfo,
  credentials,
} from "../worker/providers.mjs";
const require = createRequire(import.meta.url),
  { startDesktop } = require("../desktop/main.cjs");
const parent = resolve(import.meta.dirname, "../.build/ipc-tests");
mkdirSync(parent, { recursive: true });
const roots = [];
after(() => {
  for (const root of roots) {
    assert.equal(resolve(root, ".."), parent);
    rmSync(root, { recursive: true, force: true });
  }
});
async function harness({ corrupt = false } = {}) {
  const root = mkdtempSync(join(parent, "case-"));
  roots.push(root);
  const profile = join(root, "ultron-widget");
  if (corrupt) {
    mkdirSync(join(profile, "data"), { recursive: true });
    writeFileSync(join(profile, "data/state.json"), "broken private note");
  }
  const handles = new Map(),
    sync = new Map(),
    prompts = [],
    protocols = new Map();
  let win,
    cancel = true,
    failModels = false,
    failEncrypt = false,
    modelCalls = 0;
  class Window extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: "app://ultron/" };
      this.webContents.setWindowOpenHandler = () => {};
      win = this;
    }
    isDestroyed() {
      return false;
    }
    getNormalBounds() {
      return { x: 0, y: 0, width: 400, height: 640 };
    }
    isAlwaysOnTop() {
      return false;
    }
    show() {}
    async loadURL(url) {
      this.url = url;
    }
  }
  const app = new EventEmitter();
  const paths = new Map();
  app.getPath = (p) => paths.get(p) || root;
  app.setPath = (p, v) => paths.set(p, v);
  app.isPackaged = true;
  app.requestSingleInstanceLock = () => true;
  app.whenReady = () => Promise.resolve();
  app.exit = () => assert.fail("App startup failed");
  const api = {
    ProviderError,
    providerInfo,
    credentials,
    listModels: async (args) => {
      credentials(args.provider, args.key, args.workspace);
      modelCalls++;
      if (failModels) throw new ProviderError("Model request failed");
      return { models: [{ id: "llama-test", kind: "chat" }] };
    },
  };
  const electron = {
    app,
    BrowserWindow: Window,
    ipcMain: {
      handle: (name, fn) => handles.set(name, fn),
      on: (name, fn) => sync.set(name, fn),
    },
    safeStorage: {
      isAsyncEncryptionAvailable: async () => true,
      encryptStringAsync: async (s) => {
        if (failEncrypt) throw Error("encryption failed");
        return Buffer.from(s);
      },
      decryptStringAsync: async (b) => ({ result: b.toString() }),
    },
    screen: {
      getPrimaryDisplay: () => ({
        workArea: { x: 0, y: 0, width: 1200, height: 800 },
      }),
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: () => {},
        setPermissionCheckHandler: () => {},
      },
    },
    shell: {},
    dialog: {
      showMessageBox: async (w, opts) => {
        prompts.push(opts);
        return { response: cancel ? 0 : 1 };
      },
    },
    protocol: {
      registerSchemesAsPrivileged: (s) => protocols.set("schemes", s),
      handle: (s, f) => protocols.set(s, f),
    },
  };
  await startDesktop(electron, { api }).ready;
  const event = () => ({
    sender: win.webContents,
    senderFrame: win.webContents.mainFrame,
  });
  return {
    root,
    profile,
    win,
    protocols,
    prompts,
    modelCalls: () => modelCalls,
    cancel: (v) => (cancel = v),
    failModels: (v) => (failModels = v),
    failEncrypt: (v) => (failEncrypt = v),
    call: (name, ...args) => handles.get("ultron:" + name)(event(), ...args),
    untrusted: (name) =>
      handles.get("ultron:" + name)({ sender: {}, senderFrame: {} }, "groq"),
  };
}
test("real key/models IPC handlers validate, cache models, retain previous key on failed replacement", async () => {
  const h = await harness();
  assert.ok((await h.call("models", "groq")).error);
  assert.ok(
    (await h.call("key", { provider: "groq", key: "short", remember: false }))
      .error,
  );
  const good = await h.call("key", {
    provider: "groq",
    key: "synthetic-ipc-key",
    remember: true,
  });
  assert.equal(good.models.length, 1);
  assert.ok(existsSync(join(h.profile, "ai-key-groq.bin")));
  const count = h.modelCalls();
  assert.equal((await h.call("models", "groq")).models.length, 1);
  assert.equal(h.modelCalls(), count);
  h.failModels(true);
  assert.ok(
    (
      await h.call("key", {
        provider: "groq",
        key: "replacement-synthetic",
        remember: true,
      })
    ).error,
  );
  assert.ok((await h.call("status")).providers.groq.configured);
  assert.ok(
    readFileSync(join(h.profile, "ai-key-groq.bin"), "utf8").includes(
      "synthetic-ipc-key",
    ),
  );
  await assert.rejects(h.untrusted("models"), /Untrusted/);
});
test("key IPC encryption failure leaves no temporary key file", async () => {
  const h = await harness();
  h.failEncrypt(true);
  assert.ok(
    (
      await h.call("key", {
        provider: "groq",
        key: "synthetic-ipc-key",
        remember: true,
      })
    ).error,
  );
  assert.equal(existsSync(join(h.profile, "ai-key-groq.bin.tmp")), false);
  assert.equal((await h.call("status")).providers.groq.configured, false);
});
test("recover-data and purge handlers respect cancellation and explicitly remove preserved copies", async () => {
  const h = await harness({ corrupt: true });
  assert.deepEqual(await h.call("recover-data"), { cancelled: true });
  assert.equal(
    readFileSync(join(h.profile, "data/state.json"), "utf8"),
    "broken private note",
  );
  h.cancel(false);
  assert.deepEqual((await h.call("recover-data")).data, {});
  h.cancel(true);
  assert.deepEqual(await h.call("purge-recovery"), { cancelled: true });
  h.cancel(false);
  assert.equal((await h.call("purge-recovery")).removed, 1);
  assert.match(h.prompts.at(-1).detail, /메모/);
});
test("app protocol exposes only its exact bundled page; production DevTools disabled", async () => {
  const h = await harness();
  assert.equal(h.win.url, "app://ultron/");
  assert.equal(h.win.config.webPreferences.devTools, false);
  const handler = h.protocols.get("app");
  assert.equal((await handler(new Request("app://ultron/"))).status, 200);
  for (const url of [
    "app://ultron/desktop/main.cjs",
    "app://other/",
    "app://ultron/?path=secret",
  ])
    assert.equal((await handler(new Request(url))).status, 404);
});
