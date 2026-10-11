import { consoleOperatorActions, consoleRoute } from "@/lib/console";

// GET /api/console/operator-actions. Protected by CONSOLE_PASSWORD.
export const GET = consoleRoute(consoleOperatorActions);
