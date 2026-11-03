let localData = {},
  storageError = "";
if (desktop) {
  const legacy = {};
  for (const key of ["ultron.preferences", "ultron.notes", "ultron.ai"]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) legacy[key] = JSON.parse(raw);
    } catch {}
  }
  try {
    const result = desktop.loadData(legacy);
    if (result.error) throw Error(result.error);
    localData = result.data || {};
  } catch (e) {
    storageError = e.message || "저장한 데이터를 읽지 못했습니다.";
  }
}
function read(key, fallback) {
  if (desktop) {
    const value = Object.hasOwn(localData, key) ? localData[key] : fallback;
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    if (desktop) {
      if (storageError) throw Error(storageError);
      const result = desktop.saveData(key, value);
      if (!result.ok) throw Error(result.error || "저장 실패");
      localData[key] = JSON.parse(JSON.stringify(value));
    } else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast(
      "사용자 데이터 폴더에 저장하지 못했습니다. 기존 저장 파일은 유지됩니다.",
    );
    return false;
  }
}
function saveChat() {
  if (!desktop || read("ultron.privacy", {}).saveConversation === false) return;
  save("ultron.chat", {
    provider: selectedProvider("chat"),
    model: selectedModel("chat"),
    messages: boundedHistory(chatHistory),
    lastResponse: $("#last-response p").textContent,
  });
}
function restoreChat() {
  if (!desktop || read("ultron.privacy", {}).saveConversation === false) return;
  const saved = read("ultron.chat", null);
  if (
    !saved ||
    saved.provider !== selectedProvider("chat") ||
    saved.model !== selectedModel("chat")
  )
    return;
  chatHistory = boundedHistory(saved.messages);
  if (typeof saved.lastResponse === "string")
    $("#last-response p").textContent = saved.lastResponse.slice(0, 20000);
}

function initPrivacy() {
  if (!desktop)
    $("#chat-storage-help").textContent =
      "웹 대화는 현재 탭에서만 유지됩니다. 삭제하면 현재 대화 문맥과 화면의 응답을 비웁니다.";
  const checkbox = $("#save-conversation");
  checkbox.checked = read("ultron.privacy", {}).saveConversation !== false;
  $("#chat-storage-choice").hidden = !desktop;
  $("#recover-data").hidden = !storageError || !desktop;
  $("#purge-recovery").hidden = !desktop;
  $("#purge-recovery").onclick = async () => {
    try {
      const result = await desktop.purgeRecovery();
      if (result.error) throw Error(result.error);
      if (!result.cancelled)
        toast("이전 복구 파일 " + result.removed + "개를 삭제했습니다.");
    } catch {
      toast("복구 파일을 삭제하지 못했습니다.");
    }
  };
  checkbox.onchange = async () => {
    if (busy) {
      checkbox.checked = !checkbox.checked;
      toast("응답이 끝난 뒤 변경해 주세요.");
      return;
    }
    try {
      const result = await desktop.setChatPrivacy(checkbox.checked);
      if (result.error) throw Error(result.error);
      if (result.cancelled) {
        checkbox.checked = !checkbox.checked;
        return;
      }
      localData = result.data;
      toast(
        checkbox.checked
          ? "이후 대화를 저장합니다."
          : "대화 저장을 끄고 기존 저장 대화를 삭제했습니다.",
      );
    } catch {
      checkbox.checked = !checkbox.checked;
      toast("저장 설정을 변경하지 못했습니다.");
    }
  };
  $("#clear-conversation").onclick = async () => {
    if (busy) {
      toast("응답이 끝난 뒤 삭제해 주세요.");
      return;
    }
    try {
      if (desktop) {
        const result = await desktop.clearChat();
        if (result.error) throw Error(result.error);
        if (result.cancelled) return;
        localData = result.data;
      }
      chatHistory = [];
      stopSpeech();
      $("#last-response p").textContent = "대화를 삭제했습니다.";
      toast("대화 기록을 삭제했습니다.");
    } catch {
      toast("대화 기록을 삭제하지 못했습니다.");
    }
  };
  $("#recover-data").onclick = async () => {
    const result = await desktop.recoverData();
    if (result.error) {
      toast(result.error);
      return;
    }
    if (!result.cancelled) {
      for (const key of ["ultron.preferences", "ultron.notes", "ultron.ai"]) {
        try {
          localStorage.removeItem(key);
        } catch {}
      }
      location.reload();
    }
  };
}
