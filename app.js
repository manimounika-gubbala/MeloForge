const STEP_COUNT = 16;
const MIN_BPM = 40;
const MAX_BPM = 200;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;

const trackCatalog = {
  kick: { name: "Kick", kind: "DRUMS", color: "#c8fa72", steps: [0, 8] },
  snare: { name: "Snare", kind: "DRUMS", color: "#fa805b", steps: [4, 12] },
  hihat: { name: "Hi-hat", kind: "PERCUSSION", color: "#ebcf73", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
  bass: { name: "Bass", kind: "LOW END", color: "#80d9bb", steps: [0, 6, 10] },
  melody: { name: "Melody", kind: "KEYS", color: "#83bce6", steps: [2, 6, 10, 14] },
  piano: { name: "Piano", kind: "KEYS", color: "#d4a6ed", steps: [0, 3, 7, 11, 14] },
};

const patterns = Object.fromEntries(
  Object.entries(trackCatalog).map(([id, track]) => [
    id,
    Array.from({ length: STEP_COUNT }, (_, step) => track.steps.includes(step)),
  ]),
);
const trackOrder = ["kick", "snare", "hihat", "bass", "melody"];
const notes = [43.65, 51.91, 58.27, 65.41, 77.78, 87.31, 103.83, 116.54];
const notePattern = [0, 3, 5, 2, 6, 4, 2, 5, 0, 3, 5, 7, 4, 2, 6, 5];
const elements = {
  bpm: document.querySelector("#bpmValue"),
  genre: document.querySelector("#genreLabel"),
  meter: document.querySelector("#timeSignature"),
  grid: document.querySelector("#sequencerGrid"),
  count: document.querySelector("#trackCount"),
  addPiano: document.querySelector("#addPianoButton"),
  pianoButtonIcon: document.querySelector("#pianoButtonIcon"),
  pianoButtonLabel: document.querySelector("#pianoButtonLabel"),
  play: document.querySelector("#playButton"),
  stop: document.querySelector("#stopButton"),
  transport: document.querySelector("#transportStatus"),
  transportBar: document.querySelector(".bar-info"),
  mic: document.querySelector("#micButton"),
  micLabel: document.querySelector("#micLabel"),
  micStatus: document.querySelector("#micStatus"),
  transcript: document.querySelector("#transcriptionText"),
  session: document.querySelector("#sessionLabel"),
  commandForm: document.querySelector("#commandForm"),
  commandInput: document.querySelector("#commandInput"),
};

let bpm = 84;
let genre = "lofi";
let meterBeats = 4;
let audioContext;
let masterGain;
let noiseBuffer;
let schedulerId;
let nextStepTime = 0;
let currentStep = 0;
let playing = false;
let recognition;
let recognitionState = "idle";
let networkRetries = 0;
let networkRetryPending = false;
let networkRetryTimer;
let microphoneRequestId = 0;
let speechEventSequence = 0;
let visualTimers = [];

function renderSequencer() {
  const ruler = document.createElement("div");
  ruler.className = "step-ruler";
  const spacer = document.createElement("span");
  spacer.setAttribute("aria-hidden", "true");
  ruler.append(spacer);

  for (let step = 0; step < STEP_COUNT; step += 1) {
    const number = document.createElement("span");
    number.className = `step-number${step % 4 === 0 ? " measure-start" : ""}`;
    number.textContent = String(step + 1).padStart(2, "0");
    ruler.append(number);
  }

  const grid = document.createDocumentFragment();
  grid.append(ruler);
  for (const id of trackOrder) {
    const track = trackCatalog[id];
    const row = document.createElement("div");
    row.className = "track-row";
    row.dataset.track = id;
    row.style.setProperty("--track-color", track.color);

    const label = document.createElement("div");
    label.className = "track-label";
    label.innerHTML = `<span class="track-dot" aria-hidden="true"></span><span class="track-name-wrap"><span class="track-name">${track.name}</span><span class="track-kind">${track.kind}</span></span>`;
    if (id === "piano") {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "track-remove";
      removeButton.dataset.removeTrack = id;
      removeButton.setAttribute("aria-label", "Remove piano track");
      removeButton.title = "Remove piano track";
      removeButton.textContent = "×";
      label.append(removeButton);
    }
    row.append(label);

    for (let step = 0; step < STEP_COUNT; step += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `step-cell${patterns[id][step] ? " is-on" : ""}`;
      button.dataset.step = String(step);
      button.setAttribute("aria-label", `${track.name}, step ${step + 1}`);
      button.setAttribute("aria-pressed", String(patterns[id][step]));
      row.append(button);
    }
    grid.append(row);
  }

  elements.grid.replaceChildren(grid);
  elements.count.textContent = `${String(trackOrder.length).padStart(2, "0")} TRACKS`;
  const hasPiano = trackOrder.includes("piano");
  elements.pianoButtonIcon.textContent = hasPiano ? "−" : "+";
  elements.pianoButtonLabel.textContent = hasPiano ? "Remove Piano" : "Add Piano";
  elements.addPiano.classList.toggle("remove-track-mode", hasPiano);
  elements.addPiano.setAttribute("aria-label", hasPiano ? "Remove piano track" : "Add piano track");
}

function setTempo(value) {
  bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)));
  elements.bpm.textContent = String(bpm);
}

function setMeter(beats) {
  meterBeats = beats;
  elements.meter.textContent = `${beats} / 4`;
  const beatSteps = Array.from({ length: beats }, (_, index) => Math.round(index * STEP_COUNT / beats));
  for (const id of ["kick", "snare", "bass", "melody"]) patterns[id].fill(false);
  for (const step of beatSteps) patterns.kick[step] = true;
  for (const index of [1, 3]) {
    if (beatSteps[index] !== undefined) patterns.snare[beatSteps[index]] = true;
  }
  beatSteps.forEach((step, index) => {
    if (index % 2 === 0) patterns.bass[step] = true;
    patterns.melody[(step + 2) % STEP_COUNT] = true;
  });
  if (trackOrder.includes("piano")) patterns.piano = [...patterns.melody];
}

function addPiano() {
  if (!trackOrder.includes("piano")) {
    trackOrder.push("piano");
    renderSequencer();
  }
}

function removePiano() {
  const index = trackOrder.indexOf("piano");
  if (index !== -1) {
    trackOrder.splice(index, 1);
    renderSequencer();
  }
}

function togglePiano() {
  if (trackOrder.includes("piano")) removePiano();
  else addPiano();
}

function clearPattern() {
  for (const track of trackOrder) patterns[track].fill(false);
  renderSequencer();
}

function setGenre(nextGenre) {
  genre = nextGenre;
  elements.genre.textContent = nextGenre === "lofi" ? "Lo-fi" : nextGenre[0].toUpperCase() + nextGenre.slice(1);
  const stylePatterns = {
    lofi: {
      kick: [0, 8], snare: [4, 12], hihat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 6, 10], melody: [2, 6, 10, 14],
    },
    house: {
      kick: [0, 4, 8, 12], snare: [4, 12], hihat: [2, 6, 10, 14], bass: [0, 3, 6, 9, 12, 15], melody: [2, 6, 10, 14],
    },
    techno: {
      kick: [0, 4, 8, 12], snare: [4, 12], hihat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 3, 7, 10, 14], melody: [1, 5, 9, 13],
    },
    ambient: {
      kick: [0, 10], snare: [8], hihat: [3, 11], bass: [0, 8], melody: [2, 7, 12],
    },
  };
  const style = stylePatterns[nextGenre];
  if (style) {
    for (const [id, steps] of Object.entries(style)) {
      patterns[id].fill(false);
      for (const step of steps) patterns[id][step] = true;
    }
    if (trackOrder.includes("piano")) patterns.piano = Array.from({ length: STEP_COUNT }, (_, step) => [0, 7, 10, 14].includes(step));
  }
  renderSequencer();
}

function startAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio is not available in this browser.");
  if (!audioContext) {
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    const compressor = audioContext.createDynamicsCompressor();
    masterGain.gain.value = 0.62;
    compressor.threshold.value = -16;
    compressor.ratio.value = 4;
    masterGain.connect(compressor);
    compressor.connect(audioContext.destination);
    noiseBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate), audioContext.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
  }
  if (audioContext.state === "suspended") audioContext.resume();
}

function drumStepSeconds() {
  return (60 / bpm * meterBeats) / STEP_COUNT;
}

function playKick(time) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(145, time);
  oscillator.frequency.exponentialRampToValueAtTime(43, time + 0.13);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.85, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.33);
  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + 0.34);
}

function playNoise(time, { duration, filterType, frequency, volume, resonance = 0.7 }) {
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = noiseBuffer;
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = resonance;
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(time);
  source.stop(time + duration);
}

function playSnare(time) {
  playNoise(time, { duration: 0.17, filterType: "highpass", frequency: 1250, volume: 0.24 });
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(190, time);
  oscillator.frequency.exponentialRampToValueAtTime(90, time + 0.1);
  gain.gain.setValueAtTime(0.23, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + 0.14);
}

function playHiHat(time) {
  playNoise(time, { duration: 0.065, filterType: "highpass", frequency: 6900, volume: 0.105 });
}

function playNote(time, trackId, step) {
  const degree = notePattern[step];
  const frequency = notes[degree] * (trackId === "bass" ? 1 : trackId === "piano" ? 4 : 2);
  const isBass = trackId === "bass";
  const isPiano = trackId === "piano";
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  oscillator.type = isBass ? "triangle" : isPiano ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(frequency, time);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(isBass ? 440 : isPiano ? 3800 : 2100, time);
  const duration = isPiano ? 0.48 : isBass ? 0.2 : 0.23;
  const volume = isPiano ? 0.17 : isBass ? 0.25 : 0.115;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(volume, time + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.01);
  if (isPiano) {
    const overtone = audioContext.createOscillator();
    const overtoneGain = audioContext.createGain();
    overtone.type = "sine";
    overtone.frequency.setValueAtTime(frequency * 2.01, time);
    overtoneGain.gain.setValueAtTime(0.0001, time);
    overtoneGain.gain.exponentialRampToValueAtTime(0.034, time + 0.01);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    overtone.connect(overtoneGain);
    overtoneGain.connect(masterGain);
    overtone.start(time);
    overtone.stop(time + 0.19);
  }
}

function highlightStep(step, time) {
  const delay = Math.max(0, (time - audioContext.currentTime) * 1000);
  const timer = window.setTimeout(() => {
    elements.grid.querySelectorAll(".is-current").forEach((cell) => cell.classList.remove("is-current"));
    elements.grid.querySelectorAll(`.track-row .step-cell[data-step="${step}"]`).forEach((cell) => cell.classList.add("is-current"));
    elements.grid.querySelectorAll(".step-number")[step]?.classList.add("is-current");
  }, delay);
  visualTimers.push(timer);
}

function scheduleStep(step, time) {
  for (const id of trackOrder) {
    if (!patterns[id][step]) continue;
    if (id === "kick") playKick(time);
    else if (id === "snare") playSnare(time);
    else if (id === "hihat") playHiHat(time);
    else playNote(time, id, step);
  }
  highlightStep(step, time);
}

function scheduler() {
  if (!audioContext || !playing) return;
  while (nextStepTime < audioContext.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(currentStep, nextStepTime);
    nextStepTime += drumStepSeconds();
    currentStep = (currentStep + 1) % STEP_COUNT;
  }
}

function play() {
  try {
    startAudio();
  } catch (error) {
    elements.session.textContent = "AUDIO UNAVAILABLE";
    return;
  }
  if (playing) return;
  playing = true;
  currentStep = 0;
  nextStepTime = audioContext.currentTime + 0.06;
  elements.play.classList.add("is-playing");
  elements.play.innerHTML = '<span aria-hidden="true">Ⅱ</span>';
  elements.play.setAttribute("aria-label", "Pause");
  elements.transport.textContent = "PLAYING";
  elements.transportBar.classList.add("is-active");
  elements.session.textContent = "PLAYING YOUR BEAT";
  scheduler();
  schedulerId = window.setInterval(scheduler, LOOKAHEAD_MS);
}

function stop() {
  playing = false;
  window.clearInterval(schedulerId);
  visualTimers.forEach(window.clearTimeout);
  visualTimers = [];
  elements.grid.querySelectorAll(".is-current").forEach((cell) => cell.classList.remove("is-current"));
  elements.play.classList.remove("is-playing");
  elements.play.innerHTML = '<span aria-hidden="true">▶</span>';
  elements.play.setAttribute("aria-label", "Play");
  elements.transport.textContent = "STOPPED";
  elements.transportBar.classList.remove("is-active");
  elements.session.textContent = "SESSION READY";
}

function processCommand(command) {
  const text = command.toLowerCase().replace(/[,.!?]/g, " ").replace(/\s+/g, " ").trim();
  const changes = [];
  elements.transcript.textContent = command.trim();
  elements.transcript.classList.remove("is-placeholder");
  const tempoMatch = text.match(/\b(\d{2,3})\s*(?:bpm|beats per minute)\b/) || text.match(/\b(?:at|to|tempo(?:\s+to)?|set(?:\s+(?:the\s+)?tempo\s+to)?)\s+(\d{2,3})\b/);
  if (tempoMatch) {
    const requestedTempo = Number(tempoMatch[1]);
    if (requestedTempo >= MIN_BPM && requestedTempo <= MAX_BPM) {
      setTempo(requestedTempo);
      changes.push(`BPM set to ${requestedTempo}`);
    } else {
      changes.push(`tempo must be ${MIN_BPM}–${MAX_BPM} BPM`);
    }
  }

  const createMatch = text.match(/\b(?:create|make|start|give me)\b.*\b(lo(?:w)?[ -]?fi|house|techno|ambient|hip[ -]?hop|jazz|trap)\b/);
  if (createMatch) {
    const requestedGenre = createMatch[1].replace(/[ -]/g, "");
    const supportedGenre = ["hiphop", "lowfi"].includes(requestedGenre) ? "lofi" : requestedGenre;
    setGenre(supportedGenre);
    changes.push(`${supportedGenre === "lofi" ? "lofi" : supportedGenre} pattern applied`);
    if (/\bslow\b/.test(text) && !tempoMatch) {
      setTempo(72);
      changes.push("BPM set to 72");
    } else if (/\bfast\b|\bupbeat\b/.test(text) && !tempoMatch) {
      setTempo(116);
      changes.push("BPM set to 116");
    }
  }

  const beatMatch = text.match(/\b([3-7])\s*[- ]?beats?\b/);
  if (beatMatch && /\b(?:create|make|start|build|give me)\b/.test(text)) {
    const beats = Number(beatMatch[1]);
    if (!createMatch) setGenre("lofi");
    setMeter(beats);
    renderSequencer();
    changes.push(`${beats}-beat ${/\blow\b/.test(text) ? "low-end " : ""}groove`);
  }

  if (/\b(?:add|bring in|put in)\s+(?:the\s+)?piano\b/.test(text) || /\bpiano\b/.test(text) && /\b(?:with|include)\b/.test(text)) {
    const alreadyAdded = trackOrder.includes("piano");
    addPiano();
    changes.push(alreadyAdded ? "piano already exists" : "piano added");
  } else if (/\b(?:remove|delete|take out|drop)\s+(?:the\s+)?piano\b/.test(text)) {
    const wasAdded = trackOrder.includes("piano");
    removePiano();
    changes.push(wasAdded ? "piano removed" : "no piano track to remove");
  }

  if (/\b(?:drums?|beat|tempo)\b.*\b(?:faster|quicker|speed up)\b|\b(?:faster|quicker|speed up)\b.*\b(?:drums?|beat|tempo)\b/.test(text)) {
    const next = Math.min(MAX_BPM, bpm + 10);
    setTempo(next);
    changes.push(`BPM increased to ${next}`);
  } else if (/\b(?:drums?|beat|tempo)\b.*\b(?:slower|slow down)\b|\b(?:slower|slow down)\b.*\b(?:drums?|beat|tempo)\b/.test(text)) {
    const next = Math.max(MIN_BPM, bpm - 10);
    setTempo(next);
    changes.push(`BPM decreased to ${next}`);
  }

  if (/\b(?:play|start playing)\b/.test(text)) {
    play();
    changes.push("playing");
  } else if (/\b(?:stop|pause)\b/.test(text)) {
    stop();
    changes.push("stopped");
  }

  if (!changes.length) {
    elements.transcript.textContent = `${command.trim()} — no matching command`;
    return;
  }
  elements.transcript.textContent = `${command.trim()} — ${changes.join(" · ")}`;
}

function setMicStatus(message, warning = false) {
  elements.micStatus.textContent = message;
  elements.micStatus.classList.toggle("is-warning", warning);
}

function logSpeechEvent(name, detail = {}) {
  speechEventSequence += 1;
  console.info(`[MeloForge speech ${speechEventSequence}] ${name}`, detail);
}

function setRecognitionState(state) {
  recognitionState = state;
  elements.mic.classList.toggle("is-listening", state === "listening");
  elements.mic.classList.toggle("is-requesting", state === "requesting");
  elements.mic.classList.toggle("is-retrying", state === "retrying");
  elements.mic.classList.toggle("is-stopping", state === "stopping");
  elements.mic.disabled = state === "requesting" || state === "stopping";

  const labels = {
    idle: ["TAP TO SPEAK", "Start voice input", "Ready"],
    requesting: ["REQUESTING MIC...", "Requesting microphone permission", "Requesting microphone permission..."],
    listening: ["LISTENING · TAP TO STOP", "Stop voice input", "Listening"],
    retrying: ["RETRYING ONCE...", "Retrying browser speech recognition", "Speech service unavailable. Retrying once..."],
    stopping: ["STOPPING...", "Stopping voice input", "Stopping"],
  };
  const [label, accessibleLabel, status] = labels[state];
  elements.micLabel.textContent = label;
  elements.mic.setAttribute("aria-label", accessibleLabel);
  setMicStatus(status, state === "retrying");
  elements.session.textContent = state === "listening" ? "LISTENING FOR YOUR CUE"
    : state === "requesting" ? "REQUESTING MICROPHONE"
      : state === "retrying" ? "RETRYING SPEECH ONCE"
        : state === "stopping" ? "STOPPING VOICE INPUT"
          : playing ? "PLAYING YOUR BEAT" : "SESSION READY";
}

function showVoiceFallback(message) {
  setRecognitionState("idle");
  setMicStatus(message, true);
  elements.commandInput.focus();
}

function startRecognition() {
  try {
    logSpeechEvent("recognition.start() requested", {
      language: recognition.lang,
      continuous: recognition.continuous,
      interimResults: recognition.interimResults,
    });
    recognition.start();
  } catch (error) {
    logSpeechEvent("recognition.start() failed", { name: error.name, message: error.message });
    if (error.name === "InvalidStateError") {
      setRecognitionState("stopping");
      setMicStatus("Speech recognition is stopping. Try again shortly.", true);
      elements.commandInput.focus();
    } else {
      showVoiceFallback("Speech recognition is unavailable. Type a command below instead.");
    }
  }
}

async function requestMicrophoneAndStart() {
  if (recognitionState !== "idle") return;
  const requestId = ++microphoneRequestId;
  let permissionTimer;
  networkRetries = 0;
  networkRetryPending = false;
  setRecognitionState("requesting");
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      logSpeechEvent("microphone permission requested");
      const permissionRequest = navigator.mediaDevices.getUserMedia({ audio: true });
      permissionRequest.then((stream) => {
        logSpeechEvent("microphone permission granted", { audioTracks: stream.getAudioTracks().length });
        if (requestId !== microphoneRequestId) stream.getTracks().forEach((track) => track.stop());
      }, () => {});
      const stream = await Promise.race([
        permissionRequest,
        new Promise((_, reject) => {
          permissionTimer = window.setTimeout(() => {
            const error = new Error("Microphone permission request timed out.");
            error.name = "PermissionTimeoutError";
            reject(error);
          }, 15000);
        }),
      ]);
      window.clearTimeout(permissionTimer);
      if (requestId !== microphoneRequestId || recognitionState !== "requesting") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.getTracks().forEach((track) => track.stop());
    }
    if (requestId !== microphoneRequestId || recognitionState !== "requesting") return;
    startRecognition();
  } catch (error) {
    logSpeechEvent("microphone permission failed", { name: error.name, message: error.message });
    window.clearTimeout(permissionTimer);
    if (requestId === microphoneRequestId) microphoneRequestId += 1;
    const messages = {
      NotAllowedError: "Mic blocked: Not allowed: microphone permission was denied.",
      NotFoundError: "Microphone unavailable: Audio capture microphone could not be accessed.",
      NotReadableError: "Microphone unavailable: Audio capture microphone could not be accessed.",
      SecurityError: "Mic blocked: Not allowed: microphone permission was denied.",
      PermissionTimeoutError: "Microphone permission is still pending. Allow it in the browser prompt, or type a command below.",
    };
    showVoiceFallback(messages[error.name] || `Microphone access failed (${error.name || "error"}). You can still dictate or type in the command field below.`);
  }
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    elements.mic.addEventListener("click", () => {
      showVoiceFallback("Unavailable: browser speech recognition is not supported here.");
    });
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onstart = () => {
    logSpeechEvent("on start");
    setRecognitionState("listening");
  };
  recognition.onaudiostart = () => logSpeechEvent("on audio start");
  recognition.onsoundstart = () => logSpeechEvent("on sound start");
  recognition.onspeechstart = () => logSpeechEvent("on speech start");
  recognition.onspeechend = () => logSpeechEvent("on speech end");
  recognition.onsoundend = () => logSpeechEvent("on sound end");
  recognition.onaudioend = () => logSpeechEvent("on audio end");
  recognition.onnomatch = (event) => {
    logSpeechEvent("on no match", { confidence: event.results?.[0]?.[0]?.confidence });
    setMicStatus("No speech detected. Try again.", true);
  };
  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    const results = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      results.push({ transcript, isFinal: event.results[index].isFinal });
      if (event.results[index].isFinal) finalText += transcript;
      else interimText += transcript;
    }
    logSpeechEvent("on result", { resultIndex: event.resultIndex, results });
    if (finalText && recognitionState === "listening") {
      logSpeechEvent("transcript passed to command parser", { transcript: finalText.trim() });
      processCommand(finalText);
      setRecognitionState("stopping");
      try {
        recognition.stop();
      } catch {
        setRecognitionState("idle");
      }
    } else if (interimText && recognitionState === "listening") {
      elements.transcript.textContent = interimText.trim();
      elements.transcript.classList.remove("is-placeholder");
      setMicStatus("Listening");
    }
  };
  recognition.onerror = (event) => {
    logSpeechEvent("on error", { error: event.error, state: recognitionState });
    if (event.error === "network" && networkRetries === 0) {
      networkRetries = 1;
      networkRetryPending = true;
      setRecognitionState("retrying");
      networkRetryTimer = window.setTimeout(() => {
        if (!networkRetryPending) return;
        networkRetryPending = false;
        try {
          recognition.abort();
        } catch {}
        setRecognitionState("stopping");
        setMicStatus("Speech recognition could not connect. Type a command below instead.", true);
        elements.commandInput.focus();
      }, 3000);
      return;
    }

    const errors = {
      "not-allowed": "Mic blocked: Not allowed: microphone permission was denied.",
      "service-not-allowed": "Speech service unavailable.",
      network: "Speech recognition could not connect. Type a command below instead.",
      "audio-capture": "Microphone unavailable: Audio capture microphone could not be accessed.",
      "no-speech": "No speech detected. Try again.",
      aborted: "Voice input stopped.",
    };
    networkRetryPending = false;
    window.clearTimeout(networkRetryTimer);
    setRecognitionState("stopping");
    setMicStatus(errors[event.error] || "Speech recognition failed. Try again or type a command below.", true);
    elements.commandInput.focus();
  };
  recognition.onend = () => {
    logSpeechEvent("on end", { state: recognitionState, networkRetries });
    if (networkRetryPending) {
      networkRetryPending = false;
      window.clearTimeout(networkRetryTimer);
      networkRetryTimer = window.setTimeout(() => {
        if (recognitionState !== "retrying") return;
        startRecognition();
      }, 250);
      return;
    }
    networkRetries = 0;
    const warning = elements.micStatus.classList.contains("is-warning");
    const status = elements.micStatus.textContent;
    if (recognitionState !== "idle") setRecognitionState("idle");
    if (warning) setMicStatus(status, true);
  };
  elements.mic.addEventListener("click", () => {
    if (recognitionState === "listening") {
      setRecognitionState("stopping");
      try {
        recognition.stop();
      } catch {
        showVoiceFallback("Voice input has stopped. Use the command field below whenever you like.");
      }
    } else if (recognitionState === "retrying") {
      networkRetryPending = false;
      window.clearTimeout(networkRetryTimer);
      setRecognitionState("stopping");
      setMicStatus("Speech retry cancelled.", true);
      try {
        recognition.abort();
      } catch {
        setRecognitionState("idle");
      }
    } else if (recognitionState === "idle") {
      requestMicrophoneAndStart();
    }
  });
}

elements.grid.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-track]");
  if (removeButton) {
    removePiano();
    return;
  }
  const cell = event.target.closest(".step-cell");
  if (!cell) return;
  const trackId = cell.closest(".track-row").dataset.track;
  const step = Number(cell.dataset.step);
  patterns[trackId][step] = !patterns[trackId][step];
  cell.classList.toggle("is-on", patterns[trackId][step]);
  cell.setAttribute("aria-pressed", String(patterns[trackId][step]));
});

elements.commandForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const command = elements.commandInput.value.trim();
  if (!command) {
    elements.commandInput.focus();
    return;
  }
  processCommand(command);
  elements.commandInput.value = "";
});
elements.play.addEventListener("click", () => playing ? stop() : play());
elements.stop.addEventListener("click", stop);
elements.addPiano.addEventListener("click", togglePiano);
document.querySelector("#clearButton").addEventListener("click", clearPattern);
document.querySelector("#tempoDown").addEventListener("click", () => setTempo(bpm - 1));
document.querySelector("#tempoUp").addEventListener("click", () => setTempo(bpm + 1));
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || /INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
  event.preventDefault();
  playing ? stop() : play();
});

for (const bar of document.querySelectorAll(".waveform span")) {
  const seed = Array.from(bar.parentElement.children).indexOf(bar);
  const height = 15 + ((seed * 37 + seed * seed * 13) % 75);
  bar.style.setProperty("--bar-height", `${height}%`);
}

elements.transcript.classList.add("is-placeholder");
renderSequencer();
setupSpeechRecognition();
