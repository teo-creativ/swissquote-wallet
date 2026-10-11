import { hmacRoute } from "@/lib/server/http";
import { walletRegister } from "@/lib/server/nodes";

export const dynamic = "force-dynamic";

// POST /api/node/wallet/register. Client app server (HMAC): registers the deployed Safe after checking it on chain.
export const POST = hmacRoute(walletRegister);
