// The console reads and writes the real sq-mock state in live mode, and the in-memory demo data in mock mode. Server only.
import * as live from "./console.live";
import * as mock from "./console.mock";
import { isMockMode } from "./sqkeys.mode";

const d = (): typeof mock => (isMockMode ? mock : (live as unknown as typeof mock));

export const listRecoveries = () => d().listRecoveries();
export const getRecovery = (id: string) => d().getRecovery(id);
export const sendIdentityCheck = (id: string) => d().sendIdentityCheck(id);
export const setNextIdentityOutcome = (...a: Parameters<typeof mock.setNextIdentityOutcome>) => d().setNextIdentityOutcome(...a);
export const cosignRelease = (id: string) => d().cosignRelease(id);
export const listClients = () => d().listClients();
export const listProofs = () => d().listProofs();
export const listAlerts = () => d().listAlerts();
export const listCalls = () => d().listCalls();
