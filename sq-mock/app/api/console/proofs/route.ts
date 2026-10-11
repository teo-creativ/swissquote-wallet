import { consoleRoute, consoleProofs } from "@/lib/console";

// GET /api/console/proofs (CDC annex A.3). Protected by CONSOLE_PASSWORD.
export const GET = consoleRoute(consoleProofs);
