const fs = require("node:fs");
const path = require("node:path");
const { renameWithRetrySync } = require("./file-ops.cjs");
const ALLOWED = new Set([
  "ultron.preferences",
  "ultron.notes",
  "ultron.ai",
  "ultron.chat",
  "ultron.window",
  "ultron.privacy",
]);
const RENDERER = new Set([...ALLOWED].filter((k) => k !== "ultron.window"));
const MAX_BYTES = 1024 * 1024;
const clone = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function dataDirectory(appData) {
  return path.join(appData, "ultron-widget");
}
function createStore(directory) {
  const file = path.join(directory, "data", "state.json"),
    backup = file + ".bak";
  let state = {},
    blocked = false,
    recovered = false;
  function parse(candidate) {
    if (fs.statSync(candidate).size > MAX_BYTES) throw Error("State too large");
    const data = JSON.parse(fs.readFileSync(candidate, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw Error("Invalid state");
    return Object.fromEntries(
      Object.entries(data).filter(([k]) => ALLOWED.has(k)),
    );
  }
  try {
    state = parse(file);
  } catch (error) {
    if (error.code !== "ENOENT" || fs.existsSync(backup)) {
      try {
        state = parse(backup);
        recovered = true;
      } catch {
        blocked = true;
      }
    }
  }
  function write(target, text) {
    const temporary = target + ".tmp";
    try {
      fs.writeFileSync(temporary, text, { encoding: "utf8", flush: true });
      renameWithRetrySync(temporary, target);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  function commit(next, { purge = false } = {}) {
    if (blocked)
      throw Error("Saved state cannot be read; existing files were preserved");
    const text = JSON.stringify(next);
    if (Buffer.byteLength(text) > MAX_BYTES) throw Error("State too large");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Privacy changes replace both copies so a backup cannot restore deleted chats.
    if (purge) write(backup, text);
    else if (fs.existsSync(file) && !recovered) fs.copyFileSync(file, backup);
    write(file, text);
    state = clone(next);
    recovered = false;
  }
  function recoveryFiles() {
    try {
      return fs
        .readdirSync(path.dirname(file), { withFileTypes: true })
        .filter(
          (e) =>
            e.isFile() &&
            /^state\.json(?:\.bak)?\.unreadable-\d+$/.test(e.name),
        )
        .map((e) => path.join(path.dirname(file), e.name));
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  function purgeRecovery() {
    const files = recoveryFiles();
    for (const candidate of files) fs.unlinkSync(candidate);
    return files.length;
  }
  return {
    recoveryCount: () => recoveryFiles().length,
    purgeRecovery,
    load(legacy = {}) {
      if (blocked) throw Error("Saved state cannot be read");
      const next = { ...state };
      let changed = false;
      if (legacy && typeof legacy === "object")
        for (const [k, v] of Object.entries(legacy)) {
          if (RENDERER.has(k) && !Object.hasOwn(next, k) && v !== undefined) {
            next[k] = clone(v);
            changed = true;
          }
        }
      if (changed) commit(next);
      return clone(state);
    },
    get(key, fallback) {
      if (blocked) return clone(fallback);
      return Object.hasOwn(state, key) ? clone(state[key]) : clone(fallback);
    },
    set(key, value) {
      if (!ALLOWED.has(key) || value === undefined)
        throw Error("Unsupported setting");
      if (
        key === "ultron.chat" &&
        state["ultron.privacy"]?.saveConversation === false
      )
        return true;
      commit({ ...state, [key]: clone(value) });
      return true;
    },
    rendererSet(key, value) {
      if (!RENDERER.has(key)) throw Error("Unsupported renderer setting");
      return this.set(key, value);
    },
    chatPrivacy(saveConversation) {
      if (typeof saveConversation !== "boolean")
        throw Error("Invalid preference");
      const next = { ...state, "ultron.privacy": { saveConversation } };
      if (!saveConversation) delete next["ultron.chat"];
      commit(next, { purge: !saveConversation });
      if (!saveConversation) purgeRecovery();
      return clone(state);
    },
    clearChat() {
      const next = { ...state };
      delete next["ultron.chat"];
      commit(next, { purge: true });
      purgeRecovery();
      return clone(state);
    },
    recover() {
      if (!blocked) return clone(state);
      // Preserve unreadable files for manual recovery; do not silently discard them.
      const suffix = ".unreadable-" + Date.now();
      for (const candidate of [file, backup])
        if (fs.existsSync(candidate))
          renameWithRetrySync(candidate, candidate + suffix);
      blocked = false;
      state = {};
      commit(state);
      return clone(state);
    },
  };
}
module.exports = { createStore, dataDirectory };
