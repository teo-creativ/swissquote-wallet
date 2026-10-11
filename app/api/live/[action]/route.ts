import { handleAction } from "@/lib/server/http";

export const dynamic = "force-dynamic";
// Transfers wait for the sponsor transaction to be mined.
export const maxDuration = 60;

// POST /api/live/<action>: the browser's only door to the server in live mode. Session cookie + same-origin check.
export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  return handleAction(req, (await ctx.params).action);
}
