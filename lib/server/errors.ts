// API errors: { error: { code: "SNAKE_UPPER", message: "English text without internal details" } }. The browser maps them to SqKeysError.
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: { "cache-control": "no-store" } });
  // Only the error class is logged: no payload, no environment value.
  console.error("client server internal error:", e instanceof Error ? e.name : "unknown");
  return Response.json({ error: { code: "INTERNAL", message: "Something went wrong. Nothing was sent. Try again." } }, { status: 500, headers: { "cache-control": "no-store" } });
}
