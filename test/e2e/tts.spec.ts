import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

const DIC_ARCHIVE_PATH = "/open_jtalk_dic_utf_8-1.11.tar.gz";
const DIC_ARCHIVE_SHA256 = "33e9cd251bc41aa2bd7ca36f57abbf61eae3543ca25ca892ae345e394cb10549";

// Fast, no-page check: this alone would have caught the dicUrl bug this suite
// was written for — openjtalkjs's browser runtime fetches these 8 files
// individually as `${dicUrl}/<file>` (see src/g2p/japanese.ts), so a URL
// shaped like an archive (the original, broken default) 404s here immediately
// instead of only surfacing later as an opaque WASM configure() failure.
test("bundled dictionary archive + extracted files + voice are reachable", async ({ request }) => {
  const archiveRes = await request.get(DIC_ARCHIVE_PATH);
  expect(archiveRes.ok(), `GET ${DIC_ARCHIVE_PATH}`).toBeTruthy();
  expect(createHash("sha256").update(await archiveRes.body()).digest("hex"), `${DIC_ARCHIVE_PATH} SHA-256`).toBe(DIC_ARCHIVE_SHA256);

  const dicFiles = ["sys.dic", "matrix.bin", "char.bin", "unk.dic", "left-id.def", "right-id.def", "pos-id.def", "rewrite.def"];
  for (const file of dicFiles) {
    const res = await request.get(`/openjtalk-dic/${file}`);
    expect(res.ok(), `GET /openjtalk-dic/${file}`).toBeTruthy();
  }
  const voiceRes = await request.get("/openjtalk-voice.htsvoice");
  expect(voiceRes.ok(), "GET /openjtalk-voice.htsvoice").toBeTruthy();
});

test("full pipeline: English + Japanese synthesis, unsupported voiceId", async ({ page }) => {
  page.on("console", (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => console.log(`[browser:pageerror] ${err.message}`));
  await page.goto("/index.html");

  // Everything happens in one page.evaluate/one KokoroJP.load() call: Cache
  // Storage (where kokoro-js/transformers.js cache the ONNX model) doesn't
  // persist across Playwright test() blocks (fresh context each time), so
  // splitting this into multiple tests would multiply the model download.
  const result = await page.evaluate(async () => {
    // @ts-expect-error -- served build output, not resolvable at typecheck time
    const { KokoroJP } = await import("/consumer.js");
    const tts = await KokoroJP.load({
      dtype: "q4", // smallest quantization: this only needs to prove the pipeline runs, not audio quality
      japanese: { assetsUrl: "/" },
    });

    const summarize = (audio: { audio: Float32Array; sampling_rate: number }) => ({
      length: audio.audio.length,
      samplingRate: audio.sampling_rate,
      hasSignal: audio.audio.some((sample) => Math.abs(sample) > 0.001),
    });

    const en = summarize(await tts.speak("Hello, world.", "af_heart"));
    const ja = summarize(await tts.speak("こんにちは", "jf_alpha"));

    let unsupportedError: string | null = null;
    try {
      await tts.speak("Bonjour", "ff_siwis");
    } catch (err) {
      unsupportedError = err instanceof Error ? err.message : String(err);
    }

    return { en, ja, unsupportedError };
  });

  expect(result.en.length, "English sample count").toBeGreaterThan(1000);
  expect(result.en.samplingRate, "English sampling rate").toBe(24000);
  expect(result.en.hasSignal, "English audio should not be silence").toBe(true);

  expect(result.ja.length, "Japanese sample count").toBeGreaterThan(1000);
  expect(result.ja.samplingRate, "Japanese sampling rate").toBe(24000);
  expect(result.ja.hasSignal, "Japanese audio should not be silence").toBe(true);

  expect(result.unsupportedError).toContain("unsupported voiceId");
});
