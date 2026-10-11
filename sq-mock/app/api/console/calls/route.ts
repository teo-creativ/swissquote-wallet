import { consoleRoute, consoleCalls } from "@/lib/console";

// GET /api/console/calls (CDC annex A.3). Protected by CONSOLE_PASSWORD.
export const GET = consoleRoute(consoleCalls);
