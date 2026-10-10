import { consoleRoute, consoleIdentityOutcome } from "@/lib/console";

// POST /api/console/identity-outcome (CDC annex A.3). Protected by CONSOLE_PASSWORD.
export const POST = consoleRoute(consoleIdentityOutcome);
