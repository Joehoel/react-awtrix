export interface AppStatus {
  state: "missing-credential" | "loading" | "ready" | "error";
  message?: string;
  updatedAt: string;
  details?: Record<string, string | number | boolean | null | undefined>;
}

const statuses = new Map<string, AppStatus>();

export function setAppStatus(
  appName: string,
  state: AppStatus["state"],
  message?: string,
  details?: AppStatus["details"],
): void {
  const status = { state, message, details, updatedAt: new Date().toISOString() };
  statuses.set(appName, status);
  console.log(`[${appName}] ${state}${message === undefined ? "" : `: ${message}`}`);
}

export function getAppStatuses(): Record<string, AppStatus> {
  return Object.fromEntries(statuses);
}
