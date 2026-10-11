// Server to server calls from the client app to the lawyer node and to Swissquote (sq-mock). HMAC on every call (CDC 3.10).
// Browsers never call these services. A failing peer becomes a plain English error, never its raw body.
import { signRequest } from "@/lib/shared/hmac";
import { ApiError } from "./errors";

export interface Peer {
  post<T = any>(path: string, body: Record<string, unknown>): Promise<T>;
  get<T = any>(path: string, query?: Record<string, string>): Promise<T>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function httpPeer(name: string, baseUrl: string | undefined, secret: string | undefined, fetchImpl: FetchLike = fetch, now: () => Date = () => new Date()): Peer {
  const call = async (method: "GET" | "POST", path: string, body: string) => {
    if (!baseUrl || !secret) throw new ApiError(503, "NOT_CONFIGURED", `${name} is not set up. Tell the SQ Keys team.`);
    let res: Response;
    try {
      res = await fetchImpl(baseUrl.replace(/\/+$/, "") + path, {
        method, ...(method === "POST" ? { body } : {}), cache: "no-store",
        headers: { "content-type": "application/json", ...signRequest({ secret, method, path, body, now: now() }) },
        signal: AbortSignal.timeout(55_000),
      } as RequestInit);
    } catch {
      throw new ApiError(502, "PEER_UNAVAILABLE", `${name} did not answer. Nothing was sent. Try again.`);
    }
    const data = (await res.json().catch(() => null)) as Record<string, any> | null;
    if (!res.ok) {
      const code = typeof data?.error?.code === "string" ? data.error.code : `PEER_${res.status}`;
      const message = typeof data?.error?.message === "string" ? data.error.message : `${name} could not do this. Try again.`;
      throw new ApiError(res.status >= 500 ? 502 : res.status === 401 ? 502 : res.status, code, message);
    }
    return data;
  };
  return {
    post: (path, body) => call("POST", path, JSON.stringify(body)) as Promise<any>,
    get: (path, query) => call("GET", query ? `${path}?${new URLSearchParams(query).toString()}` : path, "") as Promise<any>,
  };
}
