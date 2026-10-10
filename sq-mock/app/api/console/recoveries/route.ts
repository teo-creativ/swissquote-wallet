import { consoleRoute, consoleRecoveries } from "@/lib/console";

// GET /api/console/recoveries (CDC annex A.3). Protected by CONSOLE_PASSWORD.
export const GET = consoleRoute(consoleRecoveries);
