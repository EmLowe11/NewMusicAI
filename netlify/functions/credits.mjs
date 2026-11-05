import { suno, json, checkAccess, handleError } from "../lib/suno.mjs";

export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;
  try {
    const credits = await suno("/generate/credit");
    return json({ ok: true, credits });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: "/api/credits" };
