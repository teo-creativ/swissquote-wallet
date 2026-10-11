import { hmacRoute } from "@/lib/http";
import { gasDeploy } from "@/lib/sponsor";

// POST /api/gas/deploy {sqRef, owners, threshold, saltNonce}. The sponsor deploys the Safe.
export const POST = hmacRoute(gasDeploy);
