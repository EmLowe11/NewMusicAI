// Suno requires a callBackUrl. The app polls for status, so this endpoint
// simply acknowledges the webhook quickly with a 200 as the docs require.
export default async (req) => {
  try {
    const body = await req.json();
    console.log("[callback]", body?.data?.callbackType, body?.data?.task_id || body?.data?.taskId);
  } catch {
    /* ignore */
  }
  return new Response(JSON.stringify({ status: "received" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

export const config = { path: "/api/callback" };
