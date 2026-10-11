import { consoleRoute, consoleAlerts } from "@/lib/console";

// GET /api/console/alerts (CDC annex A.3). Protected by CONSOLE_PASSWORD.
export const GET = consoleRoute(consoleAlerts);
