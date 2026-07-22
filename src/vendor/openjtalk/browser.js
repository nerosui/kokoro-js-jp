// src/browser.ts
var nextId = 1;
var pending = /* @__PURE__ */ new Map();
var worker = new Worker(new URL("./browser/worker.js", import.meta.url), { type: "module" });
var REQUEST_TIMEOUT_MS = 2e4;
var workerFailure = null;
worker.addEventListener("error", (event) => {
  workerFailure = new Error(`openjtalkjs browser worker failed to load: ${event.message || "unknown error"}`);
  for (const [, entry] of pending) {
    entry.reject(workerFailure);
  }
  pending.clear();
});
worker.addEventListener("message", (event) => {
  const msg = event.data;
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  if (msg.ok) {
    entry.resolve(msg.result);
  } else {
    entry.reject(new Error(msg.error));
  }
});
function callWorker(method, args) {
  if (workerFailure) {
    return Promise.reject(workerFailure);
  }
  const id = nextId++;
  const request = { id, method, args };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error(`openjtalkjs browser worker timed out after ${REQUEST_TIMEOUT_MS}ms while calling ${method}`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (reason) => {
        clearTimeout(timer);
        reject(reason);
      }
    });
    worker.postMessage(request);
  });
}
function configure(config) {
  return callWorker("configure", [config]);
}
function g2p(text, options = {}) {
  void text;
  void options;
  throw new Error("Browser g2p() sync API is unavailable. Use g2pAsync().");
}
function g2pAsync(text, options = {}) {
  return callWorker("g2p", [text, options]);
}
function extractFullContext(text, options = {}) {
  void text;
  void options;
  throw new Error("Browser extractFullContext() sync API is unavailable. Use extractFullContextAsync().");
}
function extractFullContextAsync(text, options = {}) {
  return callWorker("extractFullContext", [text, options]);
}
function synthesize(text, options = {}) {
  void text;
  void options;
  throw new Error("Browser synthesize() sync API is unavailable. Use synthesizeAsync().");
}
function synthesizeAsync(text, options = {}) {
  return callWorker("synthesize", [text, options]);
}
function runFrontend(text) {
  void text;
  throw new Error("Browser runFrontend() sync API is unavailable. Use runFrontendAsync().");
}
function runFrontendAsync(text) {
  return callWorker("runFrontend", [text]);
}
export {
  configure,
  extractFullContext,
  extractFullContextAsync,
  g2p,
  g2pAsync,
  runFrontend,
  runFrontendAsync,
  synthesize,
  synthesizeAsync
};
