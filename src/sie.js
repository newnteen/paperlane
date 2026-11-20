/**
 * One HTTP client for every SIE call.
 *
 * SIE Serverless answers msgpack by default, so every request asks for JSON.
 * A model that is not loaded yet answers 503 with `Retry-After`; that is a cold
 * start, not a failure, so the client waits it out instead of giving up.
 */

const RETRY_STATUS = new Set([429, 503]);
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_RETRIES = 10;
const MAX_WAIT_S = 60;

export function baseUrl() {
  return (process.env.SIE_BASE_URL || "https://api.superlinked.com").replace(/\/+$/, "");
}

function apiKey() {
  const key = process.env.SIE_API_KEY;
  if (!key || key.includes("sk-sie-...")) {
    throw new Error("SIE_API_KEY is not set. Copy .env.example to .env and put your sk-sie- key in it.");
  }
  return key;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function post(path, body, { retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let lastError = "";

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!RETRY_STATUS.has(response.status) || attempt === retries) {
      if (!response.ok) {
        lastError = (await response.text()).slice(0, 500);
        throw new Error(`${response.status} ${response.statusText} ${path}: ${lastError}`);
      }
      return response.json();
    }

    const header = Number(response.headers.get("retry-after"));
    const wait = Number.isFinite(header) && header > 0 ? header : Math.min(2 ** attempt, MAX_WAIT_S);
    await sleep(Math.min(wait, MAX_WAIT_S) * 1000);
  }

  throw new Error(`unreachable: ${lastError}`);
}
