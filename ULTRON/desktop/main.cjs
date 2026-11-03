function startDesktop(electron, options = {}) {
  const {
    app,
    BrowserWindow,
    ipcMain,
    safeStorage,
    shell,
    screen,
    session,
    dialog,
    protocol,
  } = electron;
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const syncFs = require("node:fs");
  const { renameWithRetry } = require("./file-ops.cjs");
  const { trustedSender } = require("./security.cjs");
  const { createStore, dataDirectory } = require("./data-store.cjs");
  const { pathToFileURL } = require("node:url");
  let win,
    api,
    chatBusy = false,
    audioBusy = false,
    keyBusy = false;
  const connections = Object.create(null);
  const ids = ["groq", "openai", "anthropic", "gemini"];
  const fixedData = dataDirectory(app.getPath("appData"));
  syncFs.mkdirSync(fixedData, { recursive: true });
  app.setPath("userData", fixedData);
  const dataStore = createStore(fixedData);
  const entry = "app://ultron/";
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
  const vault = (id) =>
    path.join(app.getPath("userData"), "ai-key-" + id + ".bin");
  function trusted(event) {
    if (!trustedSender(event, win, entry)) throw Error("Untrusted sender");
  }
  function handle(name, fn) {
    ipcMain.handle("ultron:" + name, async (event, ...args) => {
      trusted(event);
      try {
        return await fn(...args);
      } catch (e) {
        return {
          error:
            e instanceof api.ProviderError
              ? e.message
              : "작업을 완료하지 못했습니다. 연결 또는 저장 권한을 확인해 주세요.",
        };
      }
    });
  }
  async function loadKeys() {
    for (const id of ids) {
      try {
        const encrypted = await fs.readFile(vault(id));
        const data = JSON.parse(
          (await safeStorage.decryptStringAsync(encrypted)).result,
        );
        api.credentials(id, data.key, data.workspace);
        connections[id] = { ...data, remembered: true };
      } catch {}
    }
    if (!connections.groq) {
      try {
        const encrypted = await fs.readFile(
          path.join(app.getPath("userData"), "groq-key.bin"),
        );
        const key = (await safeStorage.decryptStringAsync(encrypted)).result;
        api.credentials("groq", key);
        connections.groq = { key, workspace: "", remembered: true };
      } catch {}
    }
  }
  async function storeKey(id, data, remember) {
    if (remember) {
      if (!(await safeStorage.isAsyncEncryptionAvailable()))
        throw new api.ProviderError(
          "Windows 암호화를 사용할 수 없습니다. 저장 옵션을 끄고 연결해 주세요.",
        );
      const encrypted = await safeStorage.encryptStringAsync(
        JSON.stringify(data),
      );
      const temporary = vault(id) + ".tmp";
      try {
        await fs.writeFile(temporary, encrypted);
        await renameWithRetry(temporary, vault(id));
      } finally {
        await fs.rm(temporary, { force: true });
      }
    } else await fs.rm(vault(id), { force: true });
    if (id === "groq")
      await fs.rm(path.join(app.getPath("userData"), "groq-key.bin"), {
        force: true,
      });
    connections[id] = { ...data, remembered: !!remember };
  }
  async function create() {
    protocol.handle("app", async (request) => {
      if (request.method !== "GET" || request.url !== entry)
        return new Response("Not found", { status: 404 });
      return new Response(
        await fs.readFile(path.join(__dirname, "../dist/widget.html")),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    });
    api =
      options.api ||
      (await import(
        pathToFileURL(path.join(__dirname, "../dist/server/providers.mjs")).href
      ));
    await loadKeys();
    const area = screen.getPrimaryDisplay().workArea;
    const savedWindow = dataStore.get("ultron.window", {});
    const width = Math.min(
        area.width,
        Math.max(340, Number(savedWindow.width) || 400),
      ),
      height = Math.min(
        area.height,
        Math.max(540, Number(savedWindow.height) || 640),
      );
    const previous =
      Number.isFinite(savedWindow.x) && Number.isFinite(savedWindow.y)
        ? screen.getDisplayMatching({
            x: savedWindow.x,
            y: savedWindow.y,
            width,
            height,
          }).workArea
        : area;
    const x = Math.max(
      previous.x,
      Math.min(
        previous.x + previous.width - width,
        Number.isFinite(savedWindow.x)
          ? savedWindow.x
          : area.x + area.width - width - 20,
      ),
    );
    const y = Math.max(
      previous.y,
      Math.min(
        previous.y + previous.height - height,
        Number.isFinite(savedWindow.y)
          ? savedWindow.y
          : area.y + Math.max(10, area.height - height - 20),
      ),
    );
    win = new BrowserWindow({
      title: "Ultron",
      width,
      height,
      minWidth: 340,
      minHeight: 540,
      x,
      y,
      frame: false,
      alwaysOnTop: savedWindow.alwaysOnTop === true,
      backgroundColor: "#0c0a0b",
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        devTools: !app.isPackaged,
        webviewTag: false,
      },
    });
    function saveWindow() {
      try {
        dataStore.set("ultron.window", {
          ...win.getNormalBounds(),
          alwaysOnTop: win.isAlwaysOnTop(),
        });
      } catch {}
    }
    let windowTimer;
    const scheduleWindowSave = () => {
      clearTimeout(windowTimer);
      windowTimer = setTimeout(saveWindow, 300);
    };
    win.on("move", scheduleWindowSave);
    win.on("resize", scheduleWindowSave);
    win.on("close", () => {
      clearTimeout(windowTimer);
      saveWindow();
    });
    ipcMain.on("ultron:data-load", (event, legacy) => {
      try {
        trusted(event);
        event.returnValue = { data: dataStore.load(legacy) };
      } catch {
        event.returnValue = {
          error:
            "저장된 데이터 파일을 읽지 못했습니다. 기존 파일은 보존되어 있습니다.",
        };
      }
    });
    ipcMain.on("ultron:data-save", (event, key, value) => {
      try {
        trusted(event);
        dataStore.rendererSet(key, value);
        event.returnValue = { ok: true };
      } catch {
        event.returnValue = {
          ok: false,
          error: "사용자 데이터 폴더에 저장하지 못했습니다.",
        };
      }
    });
    win.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    win.webContents.on("will-redirect", (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, url) => {
      if (url !== entry) event.preventDefault();
    });
    session.defaultSession.setPermissionRequestHandler(
      (contents, permission, callback, details) =>
        callback(
          contents === win.webContents &&
            permission === "media" &&
            details.mediaTypes?.every((t) => t === "audio"),
        ),
    );
    session.defaultSession.setPermissionCheckHandler(
      (contents, permission) =>
        contents === win.webContents && permission === "media",
    );
    async function confirmRecoveryPurge() {
      if (!dataStore.recoveryCount()) return true;
      const result = await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["취소", "복구 파일도 삭제"],
        defaultId: 0,
        cancelId: 0,
        message: "복구용 사본까지 삭제할까요?",
        detail:
          "읽을 수 없어 보관한 파일에는 이전 대화와 메모가 남아 있습니다. 이 파일은 통째로 삭제되며 복구할 수 없습니다. 현재 저장된 메모와 API 키는 유지됩니다.",
      });
      return result.response === 1;
    }
    handle("chat-privacy", async (enabled) => {
      if (typeof enabled !== "boolean")
        throw new api.ProviderError("설정 값을 확인해 주세요.");
      if (!enabled && !(await confirmRecoveryPurge()))
        return { cancelled: true };
      return { data: dataStore.chatPrivacy(enabled) };
    });
    handle("clear-chat", async () => {
      if (!(await confirmRecoveryPurge())) return { cancelled: true };
      return { data: dataStore.clearChat() };
    });
    handle("purge-recovery", async () => {
      if (!(await confirmRecoveryPurge())) return { cancelled: true };
      return { removed: dataStore.purgeRecovery() };
    });
    handle("recover-data", async () => {
      const result = await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["취소", "새 저장 파일 만들기"],
        defaultId: 0,
        cancelId: 0,
        message: "읽을 수 없는 저장 파일을 보관하고 새로 시작할까요?",
        detail:
          "기존 파일은 별도 이름으로 보관합니다. 메모·대화·설정은 초기화되며 API 키는 유지됩니다.",
      });
      return result.response === 1
        ? { data: dataStore.recover() }
        : { cancelled: true };
    });
    handle("models", async (provider) => {
      api.providerInfo(provider);
      const c = connections[provider];
      if (!c?.key) throw new api.ProviderError("API 키를 연결해 주세요.");
      if (!c.models) {
        const result = await api.listModels({
          provider,
          key: c.key,
          workspace: c.workspace || "",
        });
        if (connections[provider] !== c)
          throw new api.ProviderError(
            "연결이 변경되었습니다. 다시 시도해 주세요.",
          );
        c.models = result.models;
      }
      return { models: c.models };
    });
    handle("status", () => ({
      providers: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            configured: !!connections[id]?.key,
            remembered: !!connections[id]?.remembered,
            workspace: connections[id]?.workspace || "",
            models: connections[id]?.models || [],
          },
        ]),
      ),
      desktop: true,
      alwaysOnTop: win.isAlwaysOnTop(),
    }));
    handle("key", async (input) => {
      if (keyBusy || chatBusy || audioBusy)
        throw new api.ProviderError("진행 중인 요청을 마친 뒤 연결해 주세요.");
      keyBusy = true;
      try {
        const { provider, remember, workspace = "" } = input || {};
        api.providerInfo(provider);
        const key =
          typeof input.key === "string" && input.key.trim()
            ? input.key.trim()
            : connections[provider]?.key;
        const result = await api.listModels({ provider, key, workspace });
        await storeKey(provider, { key, workspace }, remember);
        connections[provider].models = result.models;
        return result;
      } finally {
        keyBusy = false;
      }
    });
    handle("forget", async (provider) => {
      api.providerInfo(provider);
      if (keyBusy || chatBusy || audioBusy)
        throw new api.ProviderError("진행 중인 요청을 마친 뒤 삭제해 주세요.");
      keyBusy = true;
      try {
        await fs.rm(vault(provider), { force: true });
        if (provider === "groq")
          await fs.rm(path.join(app.getPath("userData"), "groq-key.bin"), {
            force: true,
          });
        delete connections[provider];
        return { ok: true };
      } finally {
        keyBusy = false;
      }
    });
    handle("chat", async (input) => {
      if (chatBusy || keyBusy)
        throw new api.ProviderError("현재 요청이 끝난 뒤 다시 시도해 주세요.");
      chatBusy = true;
      try {
        api.providerInfo(input?.provider);
        const connection = connections[input.provider];
        return await api.chat({
          ...input,
          key: connection?.key,
          workspace: connection?.workspace || "",
        });
      } finally {
        chatBusy = false;
      }
    });
    handle("transcribe", async (input) => {
      if (audioBusy || keyBusy)
        throw new api.ProviderError("현재 요청이 끝난 뒤 다시 시도해 주세요.");
      audioBusy = true;
      try {
        api.providerInfo(input?.provider);
        return await api.transcribe({
          ...input,
          key: connections[input.provider]?.key,
        });
      } finally {
        audioBusy = false;
      }
    });
    handle("window", (action) => {
      if (action === "minimize") win.minimize();
      else if (action === "close") win.close();
      else if (action === "pin") {
        win.setAlwaysOnTop(!win.isAlwaysOnTop());
        saveWindow();
      }
      return {
        alwaysOnTop: win && !win.isDestroyed() ? win.isAlwaysOnTop() : false,
      };
    });
    handle("keys-page", (provider) =>
      shell.openExternal(api.providerInfo(provider).keys),
    );
    win.once("ready-to-show", () => win.show());
    await win.loadURL(entry);
  }
  let ready = Promise.resolve();
  if (!app.requestSingleInstanceLock()) app.quit();
  else {
    app.on("second-instance", () => {
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });
    ready = app
      .whenReady()
      .then(create)
      .catch(() => {
        console.error("Ultron startup failed");
        app.exit(1);
      });
    app.on("window-all-closed", () => app.quit());
  }

  return { ready };
}
module.exports = { startDesktop };
if (require.main === module) startDesktop(require("electron"));
