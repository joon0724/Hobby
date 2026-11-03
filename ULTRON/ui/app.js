(() => {
  "use strict";
  const desktop = window.ultronDesktop;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  /*__SHARED__*/
  /*__STORAGE__*/
  let state = "idle",
    busy = false,
    configured = false,
    chatHistory = [],
    recognition = null,
    listening = false,
    voiceToken = 0,
    toastTimer;
  let prefs = read("ultron.preferences", {});
  if (!prefs || typeof prefs !== "object") prefs = {};
  let notes = read("ultron.notes", []);
  if (!Array.isArray(notes)) notes = [];
  notes = notes.filter((n) => n && typeof n.text === "string").slice(0, 50);
  let voiceOn = prefs.voiceOn !== false,
    reduced =
      prefs.reduced ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  let stream = null,
    audioContext = null,
    analyser = null,
    levels = null,
    micEpoch = 0,
    amplitude = 0;
  const states = {
    idle: [
      "AWAITING YOUR COMMAND",
      "",
      "코어를 클릭하거나, 아래에 메시지를 입력하세요.",
    ],
    listening: [
      "LISTENING TO YOU",
      "듣고 있습니다.",
      "말씀을 마치면 자동으로 처리합니다.",
    ],
    thinking: [
      "PROCESSING YOUR REQUEST",
      "생각을 연결하는 중.",
      "요청을 처리하고 있습니다.",
    ],
    speaking: [
      "TRANSMITTING RESPONSE",
      "말씀드리겠습니다.",
      "코어를 클릭하면 응답을 멈추고 듣습니다.",
    ],
    error: [
      "ATTENTION REQUIRED",
      "연결을 확인해 주세요.",
      "아래 메시지에서 자세한 내용을 확인할 수 있습니다.",
    ],
  };
  function setState(next) {
    state = next;
    const a = states[next];
    $("#state-label").textContent = a[0];
    $("#state-help").textContent = a[2];
    document.body.dataset.state = next;
  }
  function toast(text) {
    $("#toast").textContent = text;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
  }
  function stopSpeech() {
    voiceToken++;
    window.speechSynthesis?.cancel();
    if (state === "speaking") setState("idle");
  }
  function respond(text, speak = true) {
    $("#last-response p").textContent = text;
    saveChat();
    if (!speak || !voiceOn || !window.speechSynthesis) {
      setState("idle");
      return;
    }
    stopSpeech();
    const token = voiceToken;
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 1800));
    utterance.lang = /[가-힣]/.test(text) ? "ko-KR" : "en-US";
    const voices = speechSynthesis.getVoices();
    utterance.voice =
      voices.find((v) => v.voiceURI === $("#voice-select").value) ||
      voices.find((v) => v.lang.startsWith(utterance.lang.slice(0, 2))) ||
      null;
    utterance.rate = Number($("#rate").value) || 1;
    utterance.pitch = 0.88;
    utterance.onstart = () => {
      if (token === voiceToken) setState("speaking");
    };
    utterance.onend = () => {
      if (token === voiceToken && state === "speaking") setState("idle");
    };
    utterance.onerror = () => {
      if (token === voiceToken) {
        if (state === "speaking") setState("idle");
        toast("음성 재생을 시작하지 못했습니다. 텍스트 응답을 확인해 주세요.");
      }
    };
    setState("speaking");
    speechSynthesis.speak(utterance);
  }
  function showHelp() {
    return "코어를 클릭해 음성으로 말하거나 메시지를 입력할 수 있습니다. 메모 저장·조회, 시간·날짜 확인을 지원합니다. AI 연결 후에는 자유롭게 대화할 수 있습니다.";
  }
  /*__CONNECTIONS__*/
  async function execute(text) {
    text = text.trim();
    if (!text) return;
    if (busy || connectionPending) {
      toast("현재 요청이 끝나면 다시 입력해 주세요.");
      return;
    }
    if (listening) stopListening();
    stopSpeech();
    busy = true;
    $("#send").disabled = true;
    setState("thinking");
    $("#command").value = "";
    let reply;
    try {
      const local = parseLocalCommand(text);

      if (local?.type === "save-note") {
        const value = local.value;
        if (!value) reply = "“메모: 기록할 내용” 형식으로 입력해 주세요.";
        else if (notes.length >= 50) reply = "메모는 최대 50개입니다.";
        else {
          const next = [
            { text: value, time: new Date().toISOString() },
            ...notes,
          ];
          if (save("ultron.notes", next)) {
            notes = next;
            reply = "메모를 저장했습니다. " + value;
          } else reply = "메모를 저장하지 못했습니다.";
        }
      } else if (local?.type === "notes")
        reply = notes.length
          ? "저장한 메모입니다.\n" +
            notes.map((n, i) => i + 1 + ". " + n.text).join("\n")
          : "아직 메모가 없습니다. “메모: 내일 책 가져오기”라고 말해 보세요.";
      else if (local?.type === "status") {
        await status();
        reply =
          "코어가 실행 중입니다. " +
          providerNames[selectedProvider("chat")] +
          "는 " +
          (configured ? "키가 설정되어 있습니다." : "키 설정이 필요합니다.");
      } else if (local?.type === "time")
        reply =
          "현재 시간은 " +
          new Date().toLocaleTimeString("ko-KR", {
            hour: "numeric",
            minute: "numeric",
          }) +
          "입니다.";
      else if (local?.type === "date")
        reply =
          "오늘은 " +
          new Date().toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          }) +
          "입니다.";
      else if (local?.type === "help") reply = showHelp();
      else if (local?.type === "hello")
        reply = "안녕하세요. 저는 울트론입니다. 무엇을 도와드릴까요?";
      else {
        if (!configured)
          throw Error("설정에서 대화 AI의 키를 연결하고 모델을 선택해 주세요.");
        if (text.length > MAX_MESSAGE_CHARS)
          throw Error("메시지는 6000자 이내로 입력해 주세요.");
        const pending = boundedHistory([
          ...chatHistory,
          { role: "user", content: text },
        ]);
        const d = await requestChat(pending);
        if (d.error) throw Error(d.error);
        if (typeof d.answer !== "string")
          throw Error("AI 응답을 확인하지 못했습니다.");
        reply = d.answer;
        chatHistory = boundedHistory([
          ...pending,
          { role: "assistant", content: reply },
        ]);
      }

      respond(reply);
    } catch (error) {
      const message =
        error.name === "TimeoutError"
          ? "연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요."
          : error.message || "요청을 완료하지 못했습니다.";
      respond(message, false);
      setState("error");
    } finally {
      busy = false;
      $("#send").disabled = false;
    }
  }
  function stopMicMeter() {
    micEpoch++;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    levels = null;
    audioContext?.close().catch(() => {});
    audioContext = null;
    amplitude = 0;
  }
  async function startMicMeter() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const epoch = ++micEpoch;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (epoch !== micEpoch || !listening) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      levels = new Uint8Array(analyser.frequencyBinCount);
      audioContext.createMediaStreamSource(s).connect(analyser);
    } catch {
      /* Recognition can still work without the separate visual meter. */
    }
  }
  function stopListening() {
    if (desktopRecorder) {
      finishDesktopRecording(false);
      return;
    }
    listening = false;
    recognition?.abort();
    stopMicMeter();
    $("#mic").setAttribute("aria-pressed", "false");
    $("#mic").ariaLabel = "음성 입력 시작";
    if (state === "listening") setState("idle");
  }
  function toggleMic() {
    if (selectedProvider("stt") === "none") {
      toast("설정에서 음성 인식을 켜 주세요.");
      return;
    }
    if (selectedProvider("stt") !== "browser") {
      toggleDesktopMic();
      return;
    }
    if (busy || connectionPending) {
      toast("요청 처리 후 다시 말해 주세요.");
      return;
    }
    stopSpeech();
    if (listening) {
      stopListening();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast(
        "이 브라우저는 음성 인식을 지원하지 않습니다. Chrome에서 열거나 텍스트로 입력해 주세요.",
      );
      return;
    }
    recognition = new SR();
    recognition.lang = $("#language").value;
    recognition.interimResults = true;
    recognition.continuous = false;
    let sent = false;
    recognition.onstart = () => {
      listening = true;
      setState("listening");
      $("#mic").setAttribute("aria-pressed", "true");
      $("#mic").ariaLabel = "음성 입력 중지";
      startMicMeter();
    };
    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        interim += e.results[i][0].transcript;
        if (e.results[i].isFinal && !sent) {
          sent = true;
          const text = interim;
          stopListening();
          execute(text);
          return;
        }
      }
      $("#command").value = interim;
    };
    recognition.onerror = (e) => {
      stopListening();
      if (e.error === "aborted") return;
      const messages = {
        "not-allowed":
          "마이크 접근이 차단되었습니다. 주소창에서 마이크 권한을 허용해 주세요.",
        "no-speech":
          "음성이 감지되지 않았습니다. 마이크를 눌러 다시 말해 주세요.",
        "audio-capture": "사용할 수 있는 마이크가 없습니다.",
        network:
          "음성 인식 서비스에 연결할 수 없습니다. 텍스트 입력을 사용해 주세요.",
      };
      toast(messages[e.error] || "음성 인식을 시작하지 못했습니다.");
    };
    recognition.onend = () => {
      listening = false;
      stopMicMeter();
      $("#mic").setAttribute("aria-pressed", "false");
      $("#mic").ariaLabel = "음성 입력 시작";
      if (state === "listening") setState("idle");
    };
    try {
      recognition.start();
    } catch {
      toast("마이크를 시작하지 못했습니다. 잠시 후 다시 눌러 주세요.");
    }
  }
  function voicesChanged() {
    if (!window.speechSynthesis) return;
    const selected = $("#voice-select").value || prefs.voice;
    $("#voice-select").innerHTML =
      '<option value="">언어에 맞는 기본 음성</option>';
    speechSynthesis
      .getVoices()
      .filter((v) => /^(ko|en)/i.test(v.lang))
      .forEach((v) => {
        const o = document.createElement("option");
        o.value = v.voiceURI;
        o.textContent = v.name + " · " + v.lang;
        $("#voice-select").append(o);
      });
    if ([...$("#voice-select").options].some((o) => o.value === selected))
      $("#voice-select").value = selected;
  }
  function persistPrefs() {
    prefs = {
      voiceOn,
      reduced,
      voice: $("#voice-select").value,
      rate: $("#rate").value,
      language: $("#language").value,
    };
    save("ultron.preferences", prefs);
  }
  function updateVoice() {
    $("#voice-toggle").textContent = "음성 응답 " + (voiceOn ? "ON" : "OFF");
    $("#voice-toggle").setAttribute("aria-pressed", String(voiceOn));
  }
  function updateMotion() {
    $("#motion-toggle").textContent = reduced ? "모션 켜기" : "모션 줄이기";
    $("#motion-toggle").setAttribute("aria-pressed", String(reduced));
  }
  $("#command-form").onsubmit = (e) => {
    e.preventDefault();
    execute($("#command").value);
  };
  document.addEventListener("click", (e) => {
    const button = e.target.closest("[data-command]");
    if (button) execute(button.dataset.command);
    const closer = e.target.closest("[data-close]");
    if (closer) $("#" + closer.dataset.close).close();
  });
  $("#mic").onclick = toggleMic;
  $("#core-button").onclick = toggleMic;
  $("#voice-toggle").onclick = () => {
    voiceOn = !voiceOn;
    stopSpeech();
    updateVoice();
    persistPrefs();
  };
  $("#motion-toggle").onclick = () => {
    reduced = !reduced;
    updateMotion();
    persistPrefs();
  };
  $("#settings-open").onclick = () => {
    $("#settings").showModal();
    status();
  };
  $("#rate").value = prefs.rate || 1;
  $("#rate-value").textContent = Number($("#rate").value).toFixed(1);
  $("#rate").oninput = () => {
    $("#rate-value").textContent = Number($("#rate").value).toFixed(1);
    persistPrefs();
  };
  $("#voice-select").onchange = persistPrefs;
  $("#language").value = prefs.language || "ko-KR";
  $("#language").onchange = () => {
    $("#lang-label").textContent =
      $("#language").value === "ko-KR" ? "한국어" : "English";
    persistPrefs();
  };
  $("#lang-label").textContent =
    $("#language").value === "ko-KR" ? "한국어" : "English";
  let desktopRecorder = null,
    recordTimer = null,
    recordChunks = [],
    recordStarted = 0,
    micStarting = false;
  function finishDesktopRecording(send) {
    if (!desktopRecorder) return;
    const recorder = desktopRecorder;
    desktopRecorder = null;
    clearTimeout(recordTimer);
    listening = false;
    micStarting = true;
    if (send) {
      busy = true;
      $("#send").disabled = true;
    }
    $("#mic").setAttribute("aria-pressed", "false");
    $("#mic").ariaLabel = "음성 입력 시작";
    recorder.onstop = async () => {
      stopMicMeter();
      if (!send) {
        micStarting = false;
        if (!busy) setState("idle");
        return;
      }
      if (Date.now() - recordStarted < 400) {
        micStarting = false;
        busy = false;
        $("#send").disabled = false;
        setState("idle");
        toast("조금 더 길게 말해 주세요.");
        return;
      }
      busy = true;
      $("#send").disabled = true;
      setState("thinking");
      try {
        const audio = await new Blob(recordChunks, {
          type: "audio/webm",
        }).arrayBuffer();
        const d = await requestTranscription(audio, $("#language").value);
        if (d.error) throw Error(d.error);
        busy = false;
        $("#send").disabled = false;
        if (d.text?.trim()) {
          await execute(d.text);
        } else {
          setState("idle");
          toast("음성을 인식하지 못했습니다. 다시 말해 주세요.");
        }
      } catch (e) {
        respond(e.message, false);
        setState("error");
      } finally {
        micStarting = false;
        busy = false;
        $("#send").disabled = false;
      }
    };
    recorder.stop();
  }
  async function toggleDesktopMic() {
    if (busy || micStarting || connectionPending) {
      toast("요청 처리 후 다시 말해 주세요.");
      return;
    }
    stopSpeech();
    if (listening) {
      finishDesktopRecording(true);
      return;
    }
    if (
      !providerState[selectedProvider("stt")]?.configured ||
      !selectedModel("stt")
    ) {
      $("#settings").showModal();
      $(".voice-connection").open = true;
      $("#stt-provider").scrollIntoView({ block: "center" });
      toast("음성 인식 제공사의 키와 모델을 먼저 연결해 주세요.");
      return;
    }
    micStarting = true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = s;
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      levels = new Uint8Array(analyser.frequencyBinCount);
      audioContext.createMediaStreamSource(s).connect(analyser);
      desktopRecorder = new MediaRecorder(s, { mimeType: "audio/webm" });
      recordChunks = [];
      desktopRecorder.ondataavailable = (e) => {
        if (e.data.size) recordChunks.push(e.data);
      };
      desktopRecorder.onerror = () => {
        finishDesktopRecording(false);
        toast("녹음을 완료하지 못했습니다.");
      };
      recordStarted = Date.now();
      desktopRecorder.start();
      listening = true;
      setState("listening");
      $("#state-help").textContent =
        "다시 클릭하면 전송 · Esc 취소 · 최대 60초";
      $("#mic").setAttribute("aria-pressed", "true");
      $("#mic").ariaLabel = "녹음 완료 및 전송";
      recordTimer = setTimeout(() => finishDesktopRecording(true), 60000);
    } catch {
      stopMicMeter();
      setState("idle");
      toast(
        "마이크를 사용할 수 없습니다. Windows 마이크 권한을 확인해 주세요.",
      );
    } finally {
      micStarting = false;
    }
  }
  if (desktop) {
    document.body.classList.add("desktop-widget");
    $("#window-minimize").onclick = () => {
      stopListening();
      stopSpeech();
      desktop.window("minimize");
    };
    $("#window-close").onclick = () => desktop.window("close");
    $("#window-pin").onclick = async () => {
      const d = await desktop.window("pin");
      $("#window-pin").setAttribute("aria-pressed", String(d.alwaysOnTop));
    };
  }
  initConnections();
  restoreChat();
  initPrivacy();
  if (storageError) setTimeout(() => toast(storageError), 0);
  window.addEventListener("pagehide", () => {
    stopListening();
    stopSpeech();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      stopListening();
      stopSpeech();
    }
  });
  updateVoice();
  updateMotion();
  voicesChanged();
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = voicesChanged;
  for (let i = 0; i < 47; i++) $("#wave").append(document.createElement("i"));
  const wave = $$("#wave i");
  let clockTimer;
  function refreshClock() {
    clearTimeout(clockTimer);
    if (document.hidden) return;
    $("#clock").textContent = new Date().toLocaleTimeString("en-GB");
    clockTimer = setTimeout(refreshClock, 1000 - (Date.now() % 1000));
  }
  document.addEventListener("visibilitychange", refreshClock);
  refreshClock();
  /*__CORE3D__*/
})();
