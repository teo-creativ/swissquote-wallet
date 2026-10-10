import { consoleRoute, consoleClients } from "@/lib/console";

// GET /api/console/clients (CDC annex A.3). Protected by CONSOLE_PASSWORD.
export const GET = consoleRoute(consoleClients);
