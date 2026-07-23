import type { NJDNode } from "../vendor/openjtalk/browser.js";

const REQUEST_TIMEOUT_MS = 60_000;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

let nextId = 1;
let worker: Worker | null = null;
let workerUrl: string | null = null;
let workerFailure: Error | null = null;
const pending = new Map<number, PendingRequest>();

function constructWorker(url: string): Worker {
  const resolved = new URL(url, globalThis.location.href);
  if (resolved.origin === globalThis.location.origin) {
    return new Worker(resolved.href, { type: "module" });
  }
  // Worker entrypoints must be same-origin even when the remote server sends
  // CORS headers. A tiny same-origin blob worker can import the versioned
  // jsDelivr module, whose own relative imports then stay on that CDN.
  const bootstrap = URL.createObjectURL(new Blob([`import ${JSON.stringify(resolved.href)};`], { type: "text/javascript" }));
  return new Worker(bootstrap, { type: "module" });
}

function ensureWorker(url: string): Worker {
  if (worker && workerUrl !== url) {
    throw new Error(`Open JTalk worker is already using ${workerUrl}; all callers must use the same workerUrl.`);
  }
  if (worker) return worker;

  workerUrl = url;
  worker = constructWorker(url);
  worker.addEventListener("error", (event) => {
    workerFailure = new Error(`openjtalkjs browser worker failed to load: ${event.message || "unknown error"}`);
    for (const entry of pending.values()) entry.reject(workerFailure);
    pending.clear();
  });
  worker.addEventListener("message", (event) => {
    const message = event.data as { id: number; ok: boolean; result?: unknown; error?: string };
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(new Error(message.error ?? "Open JTalk worker request failed"));
  });
  return worker;
}

function callWorker<T>(url: string, method: string, args: unknown[]): Promise<T> {
  if (workerFailure) return Promise.reject(workerFailure);

  let activeWorker: Worker;
  try {
    activeWorker = ensureWorker(url);
  } catch (error) {
    return Promise.reject(error);
  }

  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error(`openjtalkjs browser worker timed out after ${REQUEST_TIMEOUT_MS}ms while calling ${method}`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value as T);
      },
      reject: (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    });
    activeWorker.postMessage({ id, method, args });
  });
}

export function configureWorker(workerUrl: string, config: { dicUrl?: string; dicArchiveUrl?: string; voiceUrl: string }): Promise<void> {
  return callWorker(workerUrl, "configure", [config]);
}

export function runFrontendAsync(workerUrl: string, text: string): Promise<NJDNode[]> {
  return callWorker(workerUrl, "runFrontend", [text]);
}
