// Demo page for kokoro-js-jp — see .github/workflows/deploy-pages.yml for how
// ./dist/index.js (referenced below) gets built and placed alongside this
// file before deploying to GitHub Pages. Not part of the npm package itself.
import { KokoroJP } from "./dist/index.js";

// Full English voice list kokoro-js ships (node_modules/kokoro-js/voices/af_*
// etc.) and the Japanese voices this package wires up (see src/voices.ts's
// JA_VOICE_IDS) — duplicated here rather than importing from the package
// since neither list is part of its public API.
const EN_PREFIX_LABEL = {
  af: "米・女",
  am: "米・男",
  bf: "英・女",
  bm: "英・男",
};

const EN_VOICE_IDS = ["af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa", "bf_emma", "bf_isabella", "bf_alice", "bf_lily", "bm_george", "bm_lewis", "bm_daniel", "bm_fable"];

const JA_VOICES = [
  { id: "jf_alpha", label: "Alpha（女）" },
  { id: "jf_gongitsune", label: "Gongitsune（女）" },
  { id: "jf_nezumi", label: "Nezumi（女）" },
  { id: "jf_tebukuro", label: "Tebukuro（女）" },
  { id: "jm_kumo", label: "Kumo（男）" },
];

const SAMPLE_TEXT = {
  en: "The quiet moment before dawn holds a stillness all its own.",
  ja: "静かな夜に、筆の先から言葉が生まれる。",
};

function enVoiceLabel(id) {
  const prefix = id.slice(0, 2);
  const name = id.slice(3);
  const capitalized = name[0].toUpperCase() + name.slice(1);
  return `${capitalized}（${EN_PREFIX_LABEL[prefix]}）`;
}

const textEl = document.getElementById("text");
const langEl = document.getElementById("lang");
const voiceEl = document.getElementById("voice");
const speedEl = document.getElementById("speed");
const speedValueEl = document.getElementById("speedValue");
const speakEl = document.getElementById("speak");
const statusEl = document.getElementById("status");
const playerEl = document.getElementById("player");

function populateVoices(lang) {
  const voices = lang === "ja" ? JA_VOICES : EN_VOICE_IDS.map((id) => ({ id, label: enVoiceLabel(id) }));
  voiceEl.replaceChildren(
    ...voices.map((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.label;
      return opt;
    }),
  );
}

function applyLang(lang) {
  populateVoices(lang);
  if (textEl.dataset.userEdited !== "1") {
    textEl.value = SAMPLE_TEXT[lang];
  }
}

textEl.addEventListener("input", () => {
  textEl.dataset.userEdited = "1";
});
langEl.addEventListener("change", () => applyLang(langEl.value));
speedEl.addEventListener("input", () => {
  speedValueEl.textContent = `${Number(speedEl.value).toFixed(1)}×`;
});

applyLang(langEl.value);

let tts = null;
let currentAudioUrl = null;
let japaneseWarmedUp = false;

async function init() {
  try {
    // GitHub Pages serves this demo below /kokoro-js-jp/, not at the origin
    // root. Resolve the copied dist/ directory relative to this module so the
    // same code also works for forks and local/static hosting.
    const assetsUrl = new URL("./dist", import.meta.url).href;
    tts = await KokoroJP.load({ dtype: "q8", japanese: { assetsUrl } });
    statusEl.textContent = "準備ができました。";
    speakEl.disabled = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `モデルの読み込みに失敗しました: ${err instanceof Error ? err.message : err}`;
  }
}

speakEl.addEventListener("click", async () => {
  if (!tts) return;
  const text = textEl.value.trim();
  if (!text) return;

  const isJapanese = langEl.value === "ja";
  speakEl.disabled = true;
  statusEl.textContent = isJapanese && !japaneseWarmedUp ? "日本語の辞書を読み込み中…(初回のみ、回線によっては数十秒かかります)" : "音声を生成中…";

  try {
    const audio = await tts.speak(text, voiceEl.value, Number(speedEl.value));
    if (isJapanese) japaneseWarmedUp = true;

    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = URL.createObjectURL(audio.toBlob());
    playerEl.src = currentAudioUrl;
    playerEl.hidden = false;
    await playerEl.play().catch(() => {});
    statusEl.textContent = "完了しました。";
  } catch (err) {
    console.error(err);
    statusEl.textContent = `エラー: ${err instanceof Error ? err.message : err}`;
  } finally {
    speakEl.disabled = false;
  }
});

init();
