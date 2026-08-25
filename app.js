const TAU = Math.PI * 2;
const STORAGE_KEY = "superformula-live-presets-v1";
const GIFENC_URL = "https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm";

const PRESETS = [
  { name: "Aurora Bloom", m: 6.93, n1: 1.26, n2: 3.25, n3: 3.25, primary: "#73f5eb", accent: "#7b8dff", motion: 0.38, depth: 1.15 },
  { name: "Magenta Galaxy", m: 13.76, n1: 0.27, n2: 0.8, n3: 0.8, primary: "#ff53be", accent: "#83f8ff", motion: 0.24, depth: 1.05 },
  { name: "Electric Coral", m: 5, n1: 0.3, n2: 1.7, n3: 1.7, primary: "#55fff1", accent: "#ff8e72", motion: 0.46, depth: 1.22 },
  { name: "Lunar Orchid", m: 8, n1: 0.62, n2: 0.42, n3: 0.42, primary: "#d193ff", accent: "#68f5ff", motion: 0.31, depth: 0.92 },
  { name: "Solar Crystal", m: 4, n1: 0.22, n2: 1.55, n3: 1.55, primary: "#ffd166", accent: "#ff5fa2", motion: 0.28, depth: 1.32 },
  { name: "Deep Current", m: 7, n1: 0.48, n2: 4.2, n3: 1.3, primary: "#30e3ca", accent: "#4776e6", motion: 0.58, depth: 1.16 },
];

const DEFAULT_STATE = {
  version: 1,
  name: "Aurora Bloom",
  mode: "shape",
  seed: 684213,
  m: 6.93,
  n1: 1.26,
  n2: 3.25,
  n3: 3.25,
  density: 52,
  particleSize: 1.25,
  glow: 0.78,
  motion: 0.38,
  trail: 0.1,
  depth: 1.15,
  audioReact: 0.9,
  loopDuration: 6,
  exportDuration: 6,
  primary: "#73f5eb",
  accent: "#7b8dff",
  background: "#050609",
};

const state = { ...DEFAULT_STATE };
const canvas = document.querySelector("#visual-canvas");
const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });

let pointField = [];
let animationFrame = 0;
let lastTimestamp = performance.now();
let elapsed = 0;
let isPlaying = true;
let orbitX = -0.45;
let orbitY = -0.55;
let dragOrigin = null;
let resizeObserver;
let analyser = null;
let audioContext = null;
let audioSource = null;
let mediaElementSource = null;
let microphoneStream = null;
let frequencyData = null;
let audioMetrics = { bass: 0, mid: 0, high: 0, energy: 0 };
let toastTimer = 0;

const elements = {
  title: document.querySelector("#preset-title"),
  formula: document.querySelector("#formula-readout"),
  modeLabel: document.querySelector("#mode-label"),
  modeSwitch: document.querySelector("#mode-switch"),
  presetGrid: document.querySelector("#preset-grid"),
  savedList: document.querySelector("#saved-list"),
  seed: document.querySelector("#seed-input"),
  presetName: document.querySelector("#preset-name"),
  audioStatus: document.querySelector("#audio-status"),
  audioPlayer: document.querySelector("#audio-player"),
  audioFile: document.querySelector("#audio-file"),
  micStart: document.querySelector("#mic-start"),
  audioStop: document.querySelector("#audio-stop"),
  overlay: document.querySelector("#export-overlay"),
  exportMessage: document.querySelector("#export-message"),
  exportProgress: document.querySelector("#export-progress"),
  toast: document.querySelector("#toast"),
  togglePlay: document.querySelector("#toggle-play"),
  exportSize: document.querySelector("#export-size"),
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(first, second, amount, alpha = 1) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const t = clamp(amount, 0, 1);
  const values = a.map((channel, index) => Math.round(channel + (b[index] - channel) * t));
  return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${alpha})`;
}

function rgbaFromHex(hex, alpha) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function superformula(angle, m, n1, n2, n3) {
  const cosine = Math.abs(Math.cos((m * angle) / 4)) ** n2;
  const sine = Math.abs(Math.sin((m * angle) / 4)) ** n3;
  const radius = (cosine + sine) ** (-1 / Math.max(0.06, n1));
  return clamp(Number.isFinite(radius) ? radius : 0, 0.025, 3.4);
}

function buildPointField() {
  const random = mulberry32(state.seed);
  const density = Math.round(state.density);
  const points = [];

  if (state.mode === "loader") {
    const segments = Math.round(density * 2.2);
    const rings = Math.max(8, Math.round(density / 4));
    for (let segment = 0; segment < segments; segment += 1) {
      const u = (segment / segments) * TAU;
      for (let ring = 0; ring < rings; ring += 1) {
        const v = (ring / rings) * TAU;
        const minor = 0.16 + 0.055 * Math.sin(state.m * u + v * 2);
        const major = 1.02 + 0.12 * Math.sin(state.n2 * u);
        points.push({
          x: (major + minor * Math.cos(v)) * Math.cos(u),
          y: (major + minor * Math.cos(v)) * Math.sin(u),
          z: minor * Math.sin(v),
          u,
          v,
          jitter: random(),
        });
      }
    }
  } else {
    const longitudeSteps = density * 2;
    const latitudeSteps = density;
    for (let latitude = 0; latitude <= latitudeSteps; latitude += 1) {
      const phi = -Math.PI / 2 + (latitude / latitudeSteps) * Math.PI;
      const r2 = superformula(phi, state.m, state.n1, state.n2, state.n3);
      for (let longitude = 0; longitude < longitudeSteps; longitude += 1) {
        const theta = -Math.PI + (longitude / longitudeSteps) * TAU;
        const r1 = superformula(theta, state.m, state.n1, state.n2, state.n3);
        points.push({
          x: r1 * Math.cos(theta) * r2 * Math.cos(phi),
          y: r1 * Math.sin(theta) * r2 * Math.cos(phi),
          z: r2 * Math.sin(phi),
          u: theta,
          v: phi,
          jitter: random(),
        });
      }
    }
  }
  pointField = points;
}

function rotatePoint(point, xRotation, yRotation, zRotation) {
  const cosX = Math.cos(xRotation);
  const sinX = Math.sin(xRotation);
  const cosY = Math.cos(yRotation);
  const sinY = Math.sin(yRotation);
  const cosZ = Math.cos(zRotation);
  const sinZ = Math.sin(zRotation);

  const y1 = point.y * cosX - point.z * sinX;
  const z1 = point.y * sinX + point.z * cosX;
  const x2 = point.x * cosY + z1 * sinY;
  const z2 = -point.x * sinY + z1 * cosY;
  return {
    x: x2 * cosZ - y1 * sinZ,
    y: x2 * sinZ + y1 * cosZ,
    z: z2,
  };
}

function getAudioMetrics() {
  if (!analyser || !frequencyData) {
    const decay = 0.92;
    for (const key of Object.keys(audioMetrics)) audioMetrics[key] *= decay;
    return audioMetrics;
  }

  analyser.getByteFrequencyData(frequencyData);
  const average = (start, end) => {
    let sum = 0;
    for (let index = start; index < end; index += 1) sum += frequencyData[index];
    return sum / Math.max(1, end - start) / 255;
  };
  const length = frequencyData.length;
  const target = {
    bass: average(0, Math.floor(length * 0.08)),
    mid: average(Math.floor(length * 0.08), Math.floor(length * 0.38)),
    high: average(Math.floor(length * 0.38), Math.floor(length * 0.82)),
  };
  target.energy = target.bass * 0.45 + target.mid * 0.4 + target.high * 0.15;
  for (const key of Object.keys(audioMetrics)) {
    const speed = target[key] > audioMetrics[key] ? 0.35 : 0.1;
    audioMetrics[key] += (target[key] - audioMetrics[key]) * speed;
  }
  return audioMetrics;
}

function renderScene(targetContext, width, height, timeSeconds, cleanFrame = false) {
  const phase = ((timeSeconds % state.loopDuration) + state.loopDuration) / state.loopDuration % 1;
  const loopWave = Math.sin(phase * TAU);
  const audio = getAudioMetrics();
  const reactivity = state.audioReact;
  const idleBreath = analyser ? 0 : (loopWave + 1) * 0.035;
  const breath = 1 + idleBreath + audio.energy * reactivity * 0.42;
  const backgroundAlpha = cleanFrame ? 1 : clamp(0.34 - state.trail * 0.45, 0.08, 0.34);

  targetContext.globalCompositeOperation = "source-over";
  targetContext.fillStyle = cleanFrame ? state.background : rgbaFromHex(state.background, backgroundAlpha);
  targetContext.fillRect(0, 0, width, height);

  const minimum = Math.min(width, height);
  const scale = minimum * (state.mode === "loader" ? 0.25 : 0.285) * state.depth;
  const centerX = width * 0.5;
  const centerY = height * 0.51;
  const zRotation = phase * TAU * (0.12 + state.motion * 0.68);
  const yRotation = orbitY + phase * TAU * (0.06 + state.motion * 0.24);
  const xRotation = orbitX + Math.sin(phase * TAU) * state.motion * 0.15;
  const buckets = Array.from({ length: 14 }, () => new Path2D());
  const glowBuckets = Array.from({ length: 14 }, () => new Path2D());

  for (const point of pointField) {
    let multiplier = breath;
    if (state.mode === "loader") {
      const travel = ((point.u / TAU - phase) % 1 + 1) % 1;
      const head = Math.exp(-travel * 4.8);
      const pulse = 1 + 0.16 * Math.sin(point.u * state.m - phase * TAU * 2);
      multiplier *= pulse * (0.86 + head * 0.28 + audio.bass * reactivity * 0.28);
    } else {
      const ripple = Math.sin(point.u * 3 + point.v * 4 - phase * TAU * 2);
      multiplier *= 1 + ripple * (0.025 + audio.mid * reactivity * 0.16) * state.motion;
    }

    const transformed = rotatePoint(
      { x: point.x * multiplier, y: point.y * multiplier, z: point.z * multiplier },
      xRotation,
      yRotation,
      zRotation,
    );
    const perspective = 3.7 / (4.2 - transformed.z * 0.55);
    const screenX = centerX + transformed.x * scale * perspective;
    const screenY = centerY + transformed.y * scale * perspective;
    if (screenX < -10 || screenX > width + 10 || screenY < -10 || screenY > height + 10) continue;

    const depthTone = clamp((transformed.z + 1.7) / 3.4, 0, 1);
    const shimmer = clamp(depthTone * 0.7 + point.jitter * 0.18 + audio.high * 0.25, 0, 1);
    const bucket = Math.min(13, Math.floor(shimmer * 14));
    let visibility = 0.28 + depthTone * 0.72;
    if (state.mode === "loader") {
      const travel = ((point.u / TAU - phase) % 1 + 1) % 1;
      visibility *= 0.16 + 0.84 * Math.exp(-travel * 3.4);
      if (point.jitter > visibility) continue;
    }
    const radius = state.particleSize * perspective * (0.62 + depthTone * 0.72) * (1 + audio.high * reactivity * 0.42);
    buckets[bucket].moveTo(screenX + radius, screenY);
    buckets[bucket].arc(screenX, screenY, Math.max(0.35, radius), 0, TAU);
    if (state.glow > 0.03 && visibility > 0.24) {
      const glowRadius = radius * (2.2 + state.glow * 2.8);
      glowBuckets[bucket].moveTo(screenX + glowRadius, screenY);
      glowBuckets[bucket].arc(screenX, screenY, glowRadius, 0, TAU);
    }
    point._visibility = visibility;
  }

  targetContext.globalCompositeOperation = "lighter";
  for (let index = 0; index < buckets.length; index += 1) {
    const amount = index / (buckets.length - 1);
    if (state.glow > 0.03) {
      targetContext.fillStyle = mixColor(state.primary, state.accent, amount, 0.018 + state.glow * 0.028);
      targetContext.fill(glowBuckets[index]);
    }
    targetContext.fillStyle = mixColor(state.primary, state.accent, amount, 0.32 + amount * 0.42);
    targetContext.fill(buckets[index]);
  }
  targetContext.globalCompositeOperation = "source-over";
}

function updateMeters() {
  document.querySelector("#meter-bass").style.setProperty("--level", `${audioMetrics.bass * 100}%`);
  document.querySelector("#meter-mid").style.setProperty("--level", `${audioMetrics.mid * 100}%`);
  document.querySelector("#meter-high").style.setProperty("--level", `${audioMetrics.high * 100}%`);
}

function animate(timestamp) {
  const delta = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;
  if (isPlaying) elapsed += delta;
  renderScene(context, canvas.width, canvas.height, elapsed, false);
  updateMeters();
  animationFrame = requestAnimationFrame(animate);
}

function resizeCanvas() {
  const rectangle = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rectangle.width * ratio));
  const height = Math.max(1, Math.round(rectangle.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = state.background;
    context.fillRect(0, 0, width, height);
  }
}

function outputValue(key, value) {
  if (["loopDuration", "exportDuration"].includes(key)) return `${value}s`;
  if (key === "density") return `${value}`;
  return Number(value).toFixed(key === "m" ? 2 : 2);
}

function syncControls() {
  document.querySelectorAll("[data-key]").forEach((input) => {
    input.value = state[input.dataset.key];
  });
  document.querySelectorAll("[data-output]").forEach((output) => {
    const key = output.dataset.output;
    output.textContent = outputValue(key, state[key]);
  });
  elements.seed.value = state.seed;
  elements.title.textContent = state.name;
  elements.formula.textContent = `m ${round(state.m)} · n₁ ${round(state.n1)} · n₂ ${round(state.n2)} · n₃ ${round(state.n3)}`;
  elements.modeLabel.textContent = state.mode === "loader" ? "SEAMLESS LOADER" : "ORGANIC SHAPE";
  elements.modeSwitch.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
  document.documentElement.style.setProperty("--cyan", state.primary);
  document.documentElement.style.setProperty("--violet", state.accent);
}

function applyState(nextState, rebuild = true) {
  Object.assign(state, DEFAULT_STATE, nextState);
  state.seed = clamp(Math.round(Number(state.seed) || 1), 1, 999999999);
  state.name = nextState.name || "Untitled form";
  if (rebuild) buildPointField();
  syncControls();
  writeHash();
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;
  let channels = [0, 0, 0];
  if (hue < 60) channels = [chroma, x, 0];
  else if (hue < 120) channels = [x, chroma, 0];
  else if (hue < 180) channels = [0, chroma, x];
  else if (hue < 240) channels = [0, x, chroma];
  else if (hue < 300) channels = [x, 0, chroma];
  else channels = [chroma, 0, x];
  return `#${channels.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function randomize(seed = Math.floor(1 + Math.random() * 999999998)) {
  const random = mulberry32(seed);
  const hue = Math.floor(random() * 360);
  const symmetryBase = 3 + Math.floor(random() * 10);
  const fractional = random() < 0.28 ? round(random(), 2) : 0;
  const names = ["Signal", "Bloom", "Current", "Halo", "Organism", "Pulse", "Nebula", "Crystal"];
  applyState({
    ...state,
    seed,
    name: `${["Quiet", "Electric", "Lunar", "Deep", "Soft", "Solar"][Math.floor(random() * 6)]} ${names[Math.floor(random() * names.length)]}`,
    m: symmetryBase + fractional,
    n1: round(0.2 + random() ** 1.8 * 2.8),
    n2: round(0.25 + random() ** 1.35 * 5.6),
    n3: round(0.25 + random() ** 1.35 * 5.6),
    density: 38 + Math.floor(random() * 12) * 2,
    particleSize: round(0.8 + random() * 0.9),
    glow: round(0.48 + random() * 0.48),
    motion: round(0.18 + random() * 0.62),
    trail: round(0.04 + random() * 0.19),
    depth: round(0.86 + random() * 0.48),
    loopDuration: round(3 + random() * 9, 1),
    exportDuration: round(3 + random() * 7, 1),
    primary: hslToHex(hue, 88, 70),
    accent: hslToHex((hue + 55 + random() * 90) % 360, 88, 67),
  });
  showToast(`Variation ${seed} created`);
}

function renderPresets() {
  elements.presetGrid.replaceChildren();
  PRESETS.forEach((preset) => {
    const button = document.createElement("button");
    button.className = "preset-card";
    button.type = "button";
    button.style.setProperty("--c1", preset.primary);
    button.style.setProperty("--c2", preset.accent);
    button.innerHTML = `<i></i><strong>${preset.name}</strong><small>m ${preset.m}</small>`;
    button.addEventListener("click", () => applyState({ ...state, ...preset, seed: PRESETS.indexOf(preset) * 9173 + 1021 }));
    elements.presetGrid.append(button);
  });
}

function readSavedPresets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function renderSavedPresets() {
  const presets = readSavedPresets();
  elements.savedList.replaceChildren();
  presets.forEach((preset, index) => {
    const row = document.createElement("div");
    row.className = "saved-item";
    const load = document.createElement("button");
    load.type = "button";
    load.textContent = preset.name;
    load.addEventListener("click", () => applyState(preset));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${preset.name}`);
    remove.addEventListener("click", () => {
      const next = readSavedPresets();
      next.splice(index, 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      renderSavedPresets();
    });
    row.append(load, remove);
    elements.savedList.append(row);
  });
}

function serializableState() {
  return Object.fromEntries(Object.keys(DEFAULT_STATE).map((key) => [key, state[key]]));
}

function encodeState() {
  const json = JSON.stringify(serializableState());
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeState(value) {
  const normal = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normal);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function writeHash() {
  history.replaceState(null, "", `#v=${encodeState()}`);
}

function loadHash() {
  const match = location.hash.match(/^#v=(.+)$/);
  if (!match) return false;
  try { applyState(decodeState(match[1])); return true; }
  catch { return false; }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function setupAudioGraph() {
  if (!audioContext) audioContext = new AudioContext();
  if (!analyser) {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
  }
  return audioContext.resume();
}

async function useMicrophone() {
  try {
    await stopAudio();
    await setupAudioGraph();
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    audioSource = audioContext.createMediaStreamSource(microphoneStream);
    audioSource.connect(analyser);
    setAudioStatus("LIVE SPEECH", true);
    elements.audioStop.disabled = false;
  } catch (error) {
    setAudioStatus("MIC BLOCKED", false);
    showToast(error?.message || "Microphone unavailable");
  }
}

async function useAudioFile(file) {
  try {
    await stopAudio();
    await setupAudioGraph();
    elements.audioPlayer.src = URL.createObjectURL(file);
    elements.audioPlayer.hidden = false;
    if (!mediaElementSource) mediaElementSource = audioContext.createMediaElementSource(elements.audioPlayer);
    audioSource = mediaElementSource;
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);
    elements.audioPlayer.addEventListener("play", () => setAudioStatus("AUDIO FILE", true), { once: true });
    elements.audioPlayer.addEventListener("ended", () => setAudioStatus("IDLE", false), { once: true });
    await elements.audioPlayer.play();
    elements.audioStop.disabled = false;
  } catch (error) {
    showToast(error?.message || "Could not play this audio file");
  }
}

async function stopAudio() {
  if (elements.audioPlayer && !elements.audioPlayer.paused) elements.audioPlayer.pause();
  if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
  if (audioSource) {
    try { audioSource.disconnect(); } catch { /* already disconnected */ }
  }
  microphoneStream = null;
  audioSource = null;
  analyser = null;
  frequencyData = null;
  elements.audioStop.disabled = true;
  setAudioStatus("IDLE", false);
}

function setAudioStatus(label, live) {
  elements.audioStatus.textContent = label;
  elements.audioStatus.classList.toggle("live", live);
}

function parseExportSize(limit = Infinity) {
  const raw = elements.exportSize.value;
  let width;
  let height;
  if (raw.includes("x")) [width, height] = raw.split("x").map(Number);
  else width = height = Number(raw);
  const largest = Math.max(width, height);
  if (largest > limit) {
    const scale = limit / largest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  return { width, height };
}

function createExportCanvas(limit = Infinity) {
  const size = parseExportSize(limit);
  const output = document.createElement("canvas");
  output.width = size.width;
  output.height = size.height;
  return output;
}

function filename(extension) {
  const safeName = state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "superformula";
  return `${safeName}-${state.seed}.${extension}`;
}

function downloadBlob(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

function setExportProgress(message, progress) {
  elements.overlay.hidden = false;
  elements.exportMessage.textContent = message;
  elements.exportProgress.textContent = `${Math.round(progress * 100)}%`;
}

function finishExport(message) {
  elements.overlay.hidden = true;
  showToast(message);
}

async function exportPng() {
  setExportProgress("Rendering still…", 0.5);
  const output = createExportCanvas();
  renderScene(output.getContext("2d", { alpha: false }), output.width, output.height, 0, true);
  const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
  downloadBlob(blob, filename("png"));
  finishExport("PNG saved");
}

async function exportWebm() {
  const output = createExportCanvas(1080);
  const outputContext = output.getContext("2d", { alpha: false });
  const fps = 30;
  const duration = state.exportDuration;
  if (!window.MediaRecorder || !output.captureStream) {
    showToast("WebM recording is not supported in this browser");
    return;
  }
  const mimeTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) { showToast("WebM recording is not supported in this browser"); return; }

  setExportProgress("Recording WebM loop…", 0);
  const stream = output.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
  const finished = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
  recorder.start(250);
  const start = performance.now();
  await new Promise((resolve) => {
    function frame(now) {
      const progress = clamp((now - start) / (duration * 1000), 0, 1);
      renderScene(outputContext, output.width, output.height, progress * state.loopDuration, true);
      setExportProgress("Recording WebM loop…", progress);
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
  recorder.stop();
  await finished;
  stream.getTracks().forEach((track) => track.stop());
  downloadBlob(new Blob(chunks, { type: mimeType }), filename("webm"));
  finishExport("WebM loop saved");
}

async function exportGif() {
  try {
    setExportProgress("Loading GIF encoder…", 0);
    const { GIFEncoder, quantize, applyPalette } = await import(GIFENC_URL);
    const output = createExportCanvas(640);
    const outputContext = output.getContext("2d", { alpha: false, willReadFrequently: true });
    const fps = 12;
    const frames = Math.max(12, Math.round(state.exportDuration * fps));
    const encoder = GIFEncoder();
    for (let index = 0; index < frames; index += 1) {
      const progress = index / frames;
      renderScene(outputContext, output.width, output.height, progress * state.loopDuration, true);
      const rgba = outputContext.getImageData(0, 0, output.width, output.height).data;
      const palette = quantize(rgba, 128, { format: "rgb444" });
      const indexed = applyPalette(rgba, palette, "rgb444");
      encoder.writeFrame(indexed, output.width, output.height, { palette, delay: 1000 / fps, repeat: 0 });
      setExportProgress("Encoding GIF loop…", (index + 1) / frames);
      if (index % 2 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    encoder.finish();
    downloadBlob(new Blob([encoder.bytesView()], { type: "image/gif" }), filename("gif"));
    finishExport("GIF loop saved");
  } catch (error) {
    elements.overlay.hidden = true;
    showToast(`GIF export failed: ${error?.message || "unknown error"}`);
  }
}

function exportJson() {
  const blob = new Blob([`${JSON.stringify(serializableState(), null, 2)}\n`], { type: "application/json" });
  downloadBlob(blob, filename("json"));
  showToast("Parameters saved");
}

function bindControls() {
  document.querySelectorAll("[data-key]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.key;
      state[key] = input.type === "color" ? input.value : Number(input.value);
      state.name = "Custom form";
      if (["m", "n1", "n2", "n3", "density"].includes(key)) buildPointField();
      syncControls();
      writeHash();
    });
  });

  document.querySelectorAll("#randomize-top, #randomize-dock").forEach((button) => button.addEventListener("click", () => randomize()));
  elements.modeSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    state.name = state.mode === "loader" ? "Living Loader" : "Custom form";
    buildPointField();
    syncControls();
    writeHash();
  });
  elements.togglePlay.addEventListener("click", () => {
    isPlaying = !isPlaying;
    elements.togglePlay.textContent = isPlaying ? "Ⅱ" : "▶";
    elements.togglePlay.title = isPlaying ? "Pause animation" : "Play animation";
  });

  elements.seed.addEventListener("keydown", (event) => { if (event.key === "Enter") randomize(Number(elements.seed.value)); });
  document.querySelector("#apply-seed").addEventListener("click", () => randomize(Number(elements.seed.value)));
  document.querySelector("#save-preset").addEventListener("click", () => {
    const presets = readSavedPresets();
    const preset = serializableState();
    preset.name = elements.presetName.value.trim() || state.name;
    presets.unshift(preset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, 20)));
    elements.presetName.value = "";
    renderSavedPresets();
    showToast("Preset saved on this device");
  });
  document.querySelector("#copy-link").addEventListener("click", async () => {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); showToast("Variation link copied"); }
    catch { showToast("Copy the link from the address bar"); }
  });

  elements.micStart.addEventListener("click", useMicrophone);
  elements.audioStop.addEventListener("click", stopAudio);
  elements.audioFile.addEventListener("change", () => { if (elements.audioFile.files[0]) useAudioFile(elements.audioFile.files[0]); });
  document.querySelector("#export-png").addEventListener("click", exportPng);
  document.querySelector("#export-webm").addEventListener("click", exportWebm);
  document.querySelector("#export-gif").addEventListener("click", exportGif);
  document.querySelector("#export-json").addEventListener("click", exportJson);

  canvas.addEventListener("pointerdown", (event) => {
    dragOrigin = { x: event.clientX, y: event.clientY, orbitX, orbitY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragOrigin) return;
    orbitY = dragOrigin.orbitY + (event.clientX - dragOrigin.x) * 0.006;
    orbitX = clamp(dragOrigin.orbitX + (event.clientY - dragOrigin.y) * 0.006, -1.4, 1.4);
  });
  canvas.addEventListener("pointerup", () => { dragOrigin = null; });
  canvas.addEventListener("pointercancel", () => { dragOrigin = null; });
}

function initialize() {
  renderPresets();
  renderSavedPresets();
  bindControls();
  if (!loadHash()) applyState(DEFAULT_STATE);
  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener("resize", resizeCanvas);
  }
  resizeCanvas();
  animationFrame = requestAnimationFrame(animate);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
}

initialize();

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  window.removeEventListener("resize", resizeCanvas);
  if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
});
