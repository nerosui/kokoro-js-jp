// src/browser/wasm-runtime.ts
var modulePromise = null;
var configured = false;
async function importModuleFactory() {
  const mod = await import("../openjtalk-wasm-wrapper-D6E3BSJO.js");
  const candidate = mod.createOpenJTalkModule ?? mod.default;
  if (typeof candidate !== "function") {
    throw new Error("module factory export missing (expected named createOpenJTalkModule or default export)");
  }
  return candidate;
}
async function getModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const factory = await importModuleFactory();
      const wasmUrl = new URL("../openjtalk-wasm.wasm", import.meta.url);
      return factory({
        locateFile: (file) => file.endsWith(".wasm") ? wasmUrl.href : file
      });
    })();
  }
  return modulePromise;
}
async function configureBrowser(config) {
  const mod = await getModule();
  await mod.configure(config.dicUrl, config.voiceUrl);
  configured = true;
}
async function ensureConfigured() {
  const mod = await getModule();
  if (!configured) {
    throw new Error("openjtalkjs browser runtime not configured. Call configure({ dicUrl, voiceUrl }) first.");
  }
  return mod;
}
async function g2pBrowser(text, options = {}) {
  const mod = await ensureConfigured();
  return mod.g2p(text, Boolean(options.kana));
}
async function extractFullContextBrowser(text, options = {}) {
  const mod = await ensureConfigured();
  return mod.extractFullContext(text, options.runMecab ?? true);
}
async function synthesizeBrowser(text, options = {}) {
  const mod = await ensureConfigured();
  const result = mod.synthesize(text, JSON.stringify(options));
  return { pcm: new Float32Array(result.pcm), sampleRate: result.sampleRate };
}
async function runFrontendBrowser(text) {
  const mod = await ensureConfigured();
  return mod.runFrontend(text);
}

// src/browser/worker.ts
self.onmessage = async (event) => {
  const request = event.data;
  try {
    let result;
    if (request.method === "configure") {
      await configureBrowser(request.args[0]);
      result = void 0;
    } else if (request.method === "g2p") {
      result = await g2pBrowser(request.args[0], request.args[1]);
    } else if (request.method === "extractFullContext") {
      result = await extractFullContextBrowser(request.args[0], request.args[1]);
    } else if (request.method === "runFrontend") {
      result = await runFrontendBrowser(request.args[0]);
    } else {
      result = await synthesizeBrowser(request.args[0], request.args[1]);
    }
    const response = { id: request.id, ok: true, result };
    self.postMessage(response);
  } catch (error) {
    const response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
    self.postMessage(response);
  }
};
