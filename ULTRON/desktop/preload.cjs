const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "ultronDesktop",
  Object.freeze({
    loadData: (legacy) => ipcRenderer.sendSync("ultron:data-load", legacy),
    saveData: (key, value) =>
      ipcRenderer.sendSync("ultron:data-save", key, value),
    setChatPrivacy: (enabled) =>
      ipcRenderer.invoke("ultron:chat-privacy", enabled),
    clearChat: () => ipcRenderer.invoke("ultron:clear-chat"),
    purgeRecovery: () => ipcRenderer.invoke("ultron:purge-recovery"),
    recoverData: () => ipcRenderer.invoke("ultron:recover-data"),
    models: (provider) => ipcRenderer.invoke("ultron:models", provider),
    status: () => ipcRenderer.invoke("ultron:status"),
    saveKey: (input) => ipcRenderer.invoke("ultron:key", input),
    forgetKey: (provider) => ipcRenderer.invoke("ultron:forget", provider),
    chat: (input) => ipcRenderer.invoke("ultron:chat", input),
    transcribe: (input) => ipcRenderer.invoke("ultron:transcribe", input),
    window: (action) => ipcRenderer.invoke("ultron:window", action),
    openKeys: (provider) => ipcRenderer.invoke("ultron:keys-page", provider),
  }),
);
