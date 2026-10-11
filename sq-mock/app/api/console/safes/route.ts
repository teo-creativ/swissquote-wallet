import { consoleRoute, consoleSafes } from "@/lib/console";

// GET /api/console/safes. Protected by CONSOLE_PASSWORD.
export const GET = consoleRoute(consoleSafes);
