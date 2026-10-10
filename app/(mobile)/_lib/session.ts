// Small UI-only memory (sessionStorage) for things the sqkeys contract does not return.
// Never put keys, shares or credentials here.
export const SESSION_KEYS = {
  displayName: "sqkeys.ui.displayName",
  consents: "sqkeys.ui.consents",
  invite: "sqkeys.ui.invite",
  afterLogin: "sqkeys.ui.afterLogin",
} as const;

export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* memory only */
  }
}

export function clearSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}
