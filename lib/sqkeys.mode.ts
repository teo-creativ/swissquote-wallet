// NEXT_PUBLIC_SQKEYS_MODE: "mock" (default) or "live". Inlined at build time.
export const SQKEYS_MODE: "mock" | "live" = process.env.NEXT_PUBLIC_SQKEYS_MODE === "live" ? "live" : "mock";
export const isMockMode = SQKEYS_MODE === "mock";
