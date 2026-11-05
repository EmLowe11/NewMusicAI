// Shared helpers for talking to the SunoAPI.org REST API.
// Docs: https://docs.sunoapi.org/

export const SUNO_BASE = "https://api.sunoapi.org/api/v1";

export const MODELS = ["V6", "V6_MINI", "V6_WILD"];

const STATUS_HELP = {
  400: "Invalid parameters.",
  401: "Unauthorized — check the SUNO_API_KEY environment variable.",
  404: "Invalid request method or path.",
  405: "Rate limit exceeded. Please wait a moment.",
  413: "Prompt, style or lyrics is too long.",
  429: "Out of credits. Top up at sunoapi.org.",
  430: "Too many requests right now. Please try again shortly.",
  455: "Suno API is under maintenance. Try again later.",
  500: "Suno API server error.",
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function fail(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

/** Optional shared-secret gate so strangers can't spend your credits. */
export function checkAccess(req) {
  const code = process.env.APP_ACCESS_CODE;
  if (!code) return null;
  if (req.headers.get("x-access-code") === code) return null;
  return fail("Access code required.", 401, { needAccessCode: true });
}

export function getKey() {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    throw Object.assign(
      new Error("Server is missing SUNO_API_KEY. Add it in Netlify → Site configuration → Environment variables."),
      { status: 500 }
    );
  }
  return key;
}

/** Call Suno and unwrap its {code,msg,data} envelope. */
export async function suno(path, { method = "GET", body, query } = {}) {
  const url = new URL(SUNO_BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${getKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error("Could not reach Suno API."), { status: 502 });
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw Object.assign(new Error(`Suno API returned an unexpected response (HTTP ${res.status}).`), { status: 502 });
  }

  const code = payload?.code ?? res.status;
  if (code !== 200) {
    const msg = payload?.msg || STATUS_HELP[code] || "Request failed.";
    const hint = STATUS_HELP[code] && STATUS_HELP[code] !== msg ? ` (${STATUS_HELP[code]})` : "";
    throw Object.assign(new Error(msg + hint), { status: code >= 400 && code < 600 ? code : 502, sunoCode: code });
  }
  return payload.data;
}

export function callbackUrl(req) {
  // Netlify sets URL to the site's primary URL. Fall back to the request origin.
  const base = process.env.URL || new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/api/callback`;
}

/** Suno has used both snake_case and camelCase field names — accept either. */
export function normalizeTrack(t = {}) {
  const pick = (...keys) => {
    for (const k of keys) if (t[k] !== undefined && t[k] !== null && t[k] !== "") return t[k];
    return "";
  };
  return {
    id: pick("id"),
    title: pick("title"),
    tags: pick("tags"),
    lyrics: pick("prompt"),
    audioUrl: pick("audio_url", "audioUrl", "source_audio_url", "sourceAudioUrl"),
    streamUrl: pick("stream_audio_url", "streamAudioUrl", "source_stream_audio_url", "sourceStreamAudioUrl"),
    imageUrl: pick("image_url", "imageUrl", "source_image_url", "sourceImageUrl"),
    duration: Number(pick("duration")) || 0,
    model: pick("model_name", "modelName"),
    createTime: pick("createTime", "create_time"),
  };
}

export function handleError(err) {
  console.error("[suno]", err);
  return fail(err.message || "Unexpected error.", err.status || 500);
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
