// Booleans only. Never put a value, key or URL in this response.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ allowNoPrf: process.env.ALLOW_NO_PRF === "true" });
}
