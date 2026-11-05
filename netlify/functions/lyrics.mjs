import { suno, json, fail, checkAccess, callbackUrl, handleError, readJson } from "../lib/suno.mjs";

// POST { prompt } -> start lyrics task.  GET ?taskId= -> poll lyrics task.
export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;

  try {
    if (req.method === "POST") {
      const { prompt } = await readJson(req);
      const p = typeof prompt === "string" ? prompt.trim().slice(0, 200) : "";
      if (!p) return fail("Tell us what the lyrics should be about.");
      const data = await suno("/lyrics", { method: "POST", body: { prompt: p, callBackUrl: callbackUrl(req) } });
      return json({ ok: true, taskId: data.taskId });
    }

    const taskId = new URL(req.url).searchParams.get("taskId");
    if (!taskId) return fail("Missing taskId.");
    const data = await suno("/lyrics/record-info", { query: { taskId } });
    const status = data?.status || "PENDING";
    const items = (data?.response?.data || [])
      .filter((d) => d && d.status !== "failed" && d.text)
      .map((d) => ({ title: d.title || "", text: d.text }));
    return json({
      ok: true,
      status,
      done: status === "SUCCESS",
      failed: /FAILED|ERROR|EXCEPTION/.test(status),
      error: data?.errorMessage || null,
      lyrics: items,
    });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: "/api/lyrics" };
