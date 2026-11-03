const providerNames = {
  groq: "Groq",
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
};
const keyPages = {
  groq: "https://console.groq.com/keys",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://platform.claude.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
};
let apiPrefs = read("ultron.ai", {});
if (!apiPrefs || typeof apiPrefs !== "object") apiPrefs = {};
apiPrefs = {
  chatProvider: "groq",
  sttProvider: desktop ? "groq" : "browser",
  chatModels: {},
  sttModels: {},
  workspaces: {},
  ...apiPrefs,
};
for (const map of ["chatModels", "sttModels", "workspaces"])
  if (!apiPrefs[map] || typeof apiPrefs[map] !== "object") apiPrefs[map] = {};
if (!Object.hasOwn(providerNames, apiPrefs.chatProvider))
  apiPrefs.chatProvider = "groq";
if (
  !["groq", "openai", "none", ...(desktop ? [] : ["browser"])].includes(
    apiPrefs.sttProvider,
  )
)
  apiPrefs.sttProvider = desktop ? "groq" : "browser";
const personalKeys = Object.create(null),
  catalogs = Object.create(null);
let providerState = Object.create(null),
  connectionPending = false;
const selectedProvider = (role) => apiPrefs[role + "Provider"];
const selectedModel = (role) =>
  apiPrefs[role + "Models"][selectedProvider(role)] || "";
const saveApiPrefs = () => save("ultron.ai", apiPrefs);
function canChangeConnection() {
  return !busy && !listening && !micStarting && !connectionPending;
}
function resetHistory() {
  chatHistory = [];
  saveChat();
}
function renderConnection(role) {
  const p = selectedProvider(role),
    available = Object.hasOwn(providerNames, p),
    c = providerState[p];
  $("#" + role + "-provider").value = p;
  $("#" + role + "-credentials").hidden = !available;
  if (!available) {
    $("#" + role + "-status").textContent =
      p === "browser"
        ? "브라우저 음성 인식을 사용합니다."
        : "음성 입력을 끕니다. 텍스트로 대화할 수 있습니다.";
    return;
  }
  $("#" + role + "-workspace-row").hidden = p !== "anthropic";
  $("#" + role + "-workspace").value =
    apiPrefs.workspaces[p] || c?.workspace || "";
  $("#" + role + "-remember-row").hidden = !desktop;
  $("#" + role + "-remember").checked = !!c?.remembered;
  $("#" + role + "-key").placeholder = c?.configured
    ? "새 키 입력 · 기존 키 사용 시 비워 두세요"
    : "본인의 " + providerNames[p] + " API 키";
  const select = $("#" + role + "-model"),
    selected = selectedModel(role),
    models = (catalogs[p] || c?.models || []).filter((m) => m.kind === role);
  select.replaceChildren(
    new Option(
      models.length ? "사용할 모델 선택" : "키 확인 후 모델을 불러오세요",
      "",
    ),
  );
  for (const m of models) select.add(new Option(m.id, m.id));
  if (selected && !models.some((m) => m.id === selected) && !catalogs[p])
    select.add(new Option(selected + " · 이전 선택", selected));
  if ([...select.options].some((o) => o.value === selected))
    select.value = selected;
  else apiPrefs[role + "Models"][p] = "";
  $("#" + role + "-status").textContent = c?.configured
    ? providerNames[p] +
      " 키 확인됨" +
      (c.remembered ? " · 암호화 저장" : " · 이번 실행에서만 사용") +
      (selectedModel(role) ? "" : " · 모델을 선택하세요")
    : providerNames[p] + " API 키를 연결해 주세요.";
}
function renderConnections() {
  for (const role of ["chat", "stt"]) renderConnection(role);
  configured =
    !!providerState[selectedProvider("chat")]?.configured &&
    !!selectedModel("chat");
  $("#connection").textContent = configured ? "AI CONNECTED" : "CORE ONLINE";
  const stt = selectedProvider("stt");
  $("#input-status").textContent =
    stt === "none"
      ? "텍스트 입력"
      : stt === "browser"
        ? "브라우저 음성 · 텍스트"
        : providerNames[stt] + " 음성 · 텍스트";
}
const modelLoads = new Set();
async function restoreCatalogs() {
  await Promise.all(
    Object.keys(providerState)
      .filter(
        (p) =>
          providerState[p].configured && !catalogs[p] && !modelLoads.has(p),
      )
      .map(async (p) => {
        modelLoads.add(p);
        try {
          const result = await desktop.models(p);
          if (result.error) throw Error(result.error);
          if (!providerState[p]?.configured) return;
          catalogs[p] = result.models;
          renderConnections();
        } catch {
          for (const role of ["chat", "stt"])
            if (selectedProvider(role) === p)
              $("#" + role + "-status").textContent =
                "저장된 키 연결됨 · 모델 목록을 불러오지 못했습니다. 키 확인을 눌러 다시 시도하세요.";
        } finally {
          modelLoads.delete(p);
        }
      }),
  );
}
async function status() {
  try {
    if (desktop) {
      const d = await desktop.status();
      if (d.error) throw Error(d.error);
      providerState = d.providers || {};
      $("#window-pin").setAttribute("aria-pressed", String(!!d.alwaysOnTop));
    } else {
      providerState = Object.fromEntries(
        Object.keys(personalKeys).map((id) => [
          id,
          { configured: !!personalKeys[id], remembered: false },
        ]),
      );
    }
    renderConnections();
    if (desktop) void restoreCatalogs();
    return true;
  } catch {
    configured = false;
    $("#chat-status").textContent = "연결 상태를 확인하지 못했습니다.";
    return false;
  }
}
async function connectKey(role) {
  if (!canChangeConnection()) {
    toast("현재 요청을 마친 뒤 연결을 변경해 주세요.");
    return;
  }
  const p = selectedProvider(role),
    key = $("#" + role + "-key").value.trim(),
    workspace = $("#" + role + "-workspace").value.trim();
  if (!key && !providerState[p]?.configured) {
    $("#" + role + "-status").textContent = "본인의 API 키를 입력해 주세요.";
    return;
  }
  connectionPending = true;
  $$("[data-api-control]").forEach((el) => (el.disabled = true));
  $("#" + role + "-status").textContent = "키 확인 및 모델 불러오는 중…";
  try {
    const input = {
      provider: p,
      key,
      workspace: p === "anthropic" ? workspace : "",
      remember: $("#" + role + "-remember").checked,
    };
    const result = desktop
      ? await desktop.saveKey(input)
      : await (
          await fetch("/api/key-check", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Ultron-Key": webKey(p, key),
            },
            body: JSON.stringify({ provider: p, workspace: input.workspace }),
            signal: AbortSignal.timeout(25000),
          })
        ).json();
    if (result.error) throw Error(result.error);
    if (!desktop && key) personalKeys[p] = key;
    catalogs[p] = result.models;
    apiPrefs.workspaces[p] = input.workspace;
    for (const r of ["chat", "stt"]) {
      const old = apiPrefs[r + "Models"][p];
      if (old && !result.models.some((m) => m.id === old && m.kind === r))
        delete apiPrefs[r + "Models"][p];
      if (selectedProvider(r) === p) $("#" + r + "-key").value = "";
    }
    resetHistory();
    saveApiPrefs();
    await status();
    const count = result.models.filter((m) => m.kind === role).length;
    $("#" + role + "-status").textContent = count
      ? "키 확인 완료 · 사용할 모델을 선택하세요. 실제 이용 가능 여부는 첫 요청에서 확인됩니다."
      : "키는 확인했지만 이 용도의 모델이 없습니다. 계정의 모델 권한을 확인해 주세요.";
  } catch (e) {
    $("#" + role + "-status").textContent =
      e.name === "TimeoutError" ? "연결 시간이 초과되었습니다." : e.message;
  } finally {
    connectionPending = false;
    $$("[data-api-control]").forEach((el) => (el.disabled = false));
  }
}
async function forgetKey(role) {
  if (!canChangeConnection()) {
    toast("현재 요청을 마친 뒤 삭제해 주세요.");
    return;
  }
  const p = selectedProvider(role);
  connectionPending = true;
  try {
    const d = desktop ? await desktop.forgetKey(p) : { ok: true };
    if (d.error) throw Error(d.error);
    delete personalKeys[p];
    delete catalogs[p];
    for (const r of ["chat", "stt"]) {
      delete apiPrefs[r + "Models"][p];
      if (selectedProvider(r) === p) $("#" + r + "-key").value = "";
    }
    resetHistory();
    saveApiPrefs();
    await status();
    toast(providerNames[p] + " 키를 삭제했습니다.");
  } catch (e) {
    toast(e.message);
  } finally {
    connectionPending = false;
  }
}
function webKey(provider, candidate = "") {
  const key = candidate || personalKeys[provider];
  if (!key) throw Error("설정에서 해당 제공사의 API 키를 연결해 주세요.");
  return key;
}
async function requestChat(messages) {
  const provider = selectedProvider("chat"),
    model = selectedModel("chat");
  const input = {
    provider,
    model,
    messages,
    workspace: apiPrefs.workspaces[provider] || "",
  };
  return desktop
    ? desktop.chat(input)
    : (
        await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Ultron-Key": webKey(provider),
          },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(50000),
        })
      ).json();
}
async function requestTranscription(audio, language) {
  const provider = selectedProvider("stt"),
    model = selectedModel("stt");
  return desktop
    ? desktop.transcribe({ provider, model, audio, language })
    : (
        await fetch("/api/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "audio/webm",
            "X-Ultron-Key": webKey(provider),
            "X-Ultron-Provider": provider,
            "X-Ultron-Model": model,
            "X-Ultron-Language": language,
          },
          body: audio,
          signal: AbortSignal.timeout(50000),
        })
      ).json();
}
function initConnections() {
  if (desktop) $("#stt-provider option[value=browser]").remove();
  for (const role of ["chat", "stt"]) {
    $("#" + role + "-provider").onchange = () => {
      if (!canChangeConnection()) {
        $("#" + role + "-provider").value = selectedProvider(role);
        toast("현재 요청이 끝난 뒤 변경해 주세요.");
        return;
      }
      apiPrefs[role + "Provider"] = $("#" + role + "-provider").value;
      $("#" + role + "-key").value = "";
      if (role === "chat") resetHistory();
      saveApiPrefs();
      renderConnections();
    };
    $("#" + role + "-model").onchange = () => {
      if (!canChangeConnection()) {
        renderConnections();
        toast("현재 요청이 끝난 뒤 변경해 주세요.");
        return;
      }
      apiPrefs[role + "Models"][selectedProvider(role)] = $(
        "#" + role + "-model",
      ).value;
      if (role === "chat") resetHistory();
      saveApiPrefs();
      renderConnections();
    };
    $("#" + role + "-connect").onclick = () => connectKey(role);
    $("#" + role + "-forget").onclick = () => forgetKey(role);
    $("#" + role + "-get-key").onclick = () => {
      const p = selectedProvider(role);
      if (desktop) desktop.openKeys(p);
      else window.open(keyPages[p], "_blank", "noopener,noreferrer");
    };
  }
  $("#key-privacy").textContent = desktop
    ? "키는 선택한 제공사로 직접 전송됩니다. 저장을 선택하면 Windows 계정에 암호화하며, 선택하지 않으면 종료 시 지웁니다."
    : "키는 현재 탭의 메모리에만 보관하며 새로고침하면 지워집니다. 요청 시 사이트 서버를 거쳐 선택한 제공사에 전달됩니다.";
  $("#voice-privacy").textContent =
    "Groq·OpenAI 음성: 코어를 눌러 녹음하고 다시 누르면 전송합니다. 녹음은 파일로 저장하지 않으며 선택한 음성 제공사에서 처리합니다. 응답 읽기는 기기의 음성을 사용합니다.";
  status().then(() => {
    if (desktop && !configured && !$("#settings").open)
      $("#settings").showModal();
  });
}
