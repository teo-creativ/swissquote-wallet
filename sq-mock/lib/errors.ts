// API errors (CDC annex A conventions): { error: { code: "SNAKE_UPPER", message: "English text without internal details" } }.
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  // Only the error class is logged: no payload, no environment value.
  console.error("sq-mock internal error:", e instanceof Error ? e.name : "unknown");
  return Response.json({ error: { code: "INTERNAL", message: "Internal error." } }, { status: 500 });
}
