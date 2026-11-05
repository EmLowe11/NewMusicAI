import { MODELS, suno, json, fail, checkAccess, callbackUrl, handleError, readJson } from "../lib/suno.mjs";

const clampNum = (v, min, max, step) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const c = Math.min(max, Math.max(min, n));
  return step ? Math.round(c / step) * step : c;
};
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export default async (req) => {
  if (req.method !== "POST") return fail("Use POST.", 405);
  const denied = checkAccess(req);
  if (denied) return denied;

  const input = await readJson(req);
  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.includes(input.model) ? input.model : "V6";

  const body = { customMode, instrumental, model, callBackUrl: callbackUrl(req) };
  const style = str(input.style, 1000);
  const lyrics = str(input.lyrics, 5000);

  if (customMode) {
    const title = str(input.title, 80);
    const negativeTags = str(input.negativeTags, 1000);
    if (!style && !lyrics && !negativeTags) {
      return fail("Custom mode needs at least a style, lyrics or tags to avoid.");
    }
    if (title) body.title = title;
    if (style) body.style = style;
    if (negativeTags) body.negativeTags = negativeTags;
    if (!instrumental && lyrics) body.lyrics = lyrics;
    if (input.vocalGender === "m" || input.vocalGender === "f") body.vocalGender = input.vocalGender;

    const styleWeight = clampNum(input.styleWeight, 0, 1, 0.01);
    const weirdness = clampNum(input.weirdnessConstraint, 0, 1, 0.01);
    const audioWeight = clampNum(input.audioWeight, 0, 1, 0.01);
    const variety = clampNum(input.variety, 0, 4, 1);
    const duration = clampNum(input.duration, 10, 360, 1);
    if (styleWeight !== undefined) body.styleWeight = Number(styleWeight.toFixed(2));
    if (weirdness !== undefined) body.weirdnessConstraint = Number(weirdness.toFixed(2));
    if (audioWeight !== undefined && !instrumental) body.audioWeight = Number(audioWeight.toFixed(2));
    if (variety !== undefined) body.variety = variety;
    if (duration !== undefined) body.duration = duration;
  } else {
    const prompt = str(input.prompt, 3000);
    if (!prompt && !style && !lyrics) return fail("Describe the song you want to create.");
    if (prompt) body.prompt = prompt;
    if (style) body.style = style;
    if (lyrics && !instrumental) body.lyrics = lyrics;
  }

  try {
    const data = await suno("/generate", { method: "POST", body });
    if (!data?.taskId) return fail("Suno did not return a task ID.", 502);
    return json({ ok: true, taskId: data.taskId });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: "/api/generate" };
