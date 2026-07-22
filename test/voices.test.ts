import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_ID, JA_VOICE_IDS, resolveLang } from "../src/voices.js";

describe("resolveLang", () => {
  it.each(["af_heart", "af_nicole", "am_adam", "bf_emma", "bm_george"])("resolves %s as English", (voiceId) => {
    expect(resolveLang(voiceId)).toBe("en");
  });

  it.each(["jf_alpha", "jf_gongitsune", "jm_kumo"])("resolves %s as Japanese", (voiceId) => {
    expect(resolveLang(voiceId)).toBe("ja");
  });

  it.each(["zf_xiaobei", "ff_siwis", "ef_dora", "hf_alpha", "if_sara", "pf_dora", "not-a-voice", ""])("returns undefined for unsupported/unknown voiceId %s", (voiceId) => {
    expect(resolveLang(voiceId)).toBeUndefined();
  });

  it("resolves the default voiceId", () => {
    expect(resolveLang(DEFAULT_VOICE_ID)).toBe("en");
  });
});

describe("JA_VOICE_IDS", () => {
  it("only contains ids resolveLang identifies as Japanese", () => {
    for (const voiceId of JA_VOICE_IDS) {
      expect(resolveLang(voiceId)).toBe("ja");
    }
  });

  it("does not contain an unknown jf_/jm_-prefixed id", () => {
    expect(JA_VOICE_IDS).not.toContain("jf_nonexistent");
  });
});
