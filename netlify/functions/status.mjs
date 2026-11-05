import { suno, json, fail, checkAccess, normalizeTrack, handleError } from "../lib/suno.mjs";

const FAILED = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR", "FAILED"]);

export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId) return fail("Missing taskId.");

  try {
    const data = await suno("/generate/record-info", { query: { taskId } });
    const status = data?.status || "PENDING";
    const raw = data?.response?.sunoData || data?.response?.data || [];
    const tracks = (Array.isArray(raw) ? raw : []).map(normalizeTrack);
    return json({
      ok: true,
      taskId,
      status,
      done: status === "SUCCESS",
      failed: FAILED.has(status),
      error: data?.errorMessage || (status === "SENSITIVE_WORD_ERROR" ? "Your prompt contains words that aren't allowed." : null),
      tracks,
    });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: "/api/status" };
