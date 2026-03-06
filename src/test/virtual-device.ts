import type { AwtrixPayload } from "../types.ts";

const MATRIX_WIDTH = 32;
const MATRIX_HEIGHT = 8;
const MATRIX_PIXEL_COUNT = MATRIX_WIDTH * MATRIX_HEIGHT;
const BUILT_IN_APPS = ["Time", "Date", "Temperature", "Humidity", "Battery"];
const EFFECT_NAMES = [
  "Fade",
  "MovingLine",
  "BrickBreaker",
  "PingPong",
  "Radar",
  "Checkerboard",
  "Fireworks",
  "PlasmaCloud",
  "Ripple",
  "Snake",
  "Pacifica",
  "TheaterChase",
  "Plasma",
  "Matrix",
  "SwirlIn",
  "SwirlOut",
  "LookingEyes",
  "TwinklingStars",
  "ColorWaves",
];
const TRANSITION_NAMES = [
  "Random",
  "Slide",
  "Dim",
  "Zoom",
  "Rotate",
  "Pixelate",
  "Curtain",
  "Ripple",
  "Blink",
  "Reload",
  "Fade",
];

export interface VirtualAwtrixDeviceOptions {
  host?: string;
  port?: number;
  version?: string;
}

export interface CustomAppRequest {
  name: string;
  deleted: boolean;
  payload?: AwtrixPayload | AwtrixPayload[];
}

export interface IndicatorState {
  enabled: boolean;
  color?: unknown;
  blinkMs: number;
  fadeMs: number;
}

interface Waiter {
  condition: () => boolean;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  message: string;
}

interface AppVectorUpdateItem {
  name: string;
  show: boolean;
  pos?: number;
}

function createDefaultSettings(): Record<string, unknown> {
  return {
    MATP: true,
    ABRI: false,
    BRI: 128,
    ATRANS: true,
    TCOL: "#FFFFFF",
    TEFF: 1,
    TSPEED: 500,
    ATIME: 7,
    TMODE: 1,
    CHCOL: "#FF0000",
    CTCOL: "#000000",
    CBCOL: "#FFFFFF",
    TFORMAT: "%H:%M",
    DFORMAT: "%d.%m.%y",
    SOM: true,
    CEL: true,
    BLOCKN: false,
    MAT: 0,
    SOUND: true,
    GAMMA: 1,
    UPPERCASE: true,
    CCORRECTION: "#FFFFFF",
    CTEMP: "#FFFFFF",
    WD: true,
    WDCA: "#FFFFFF",
    WDCI: "#404040",
    TIME_COL: 0,
    DATE_COL: 0,
    HUM_COL: 0,
    TEMP_COL: 0,
    BAT_COL: 0,
    SSPEED: 100,
    TIM: true,
    DAT: true,
    HUM: true,
    TEMP: true,
    BAT: true,
    VOL: 5,
    OVERLAY: "",
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPayloadObject(value: unknown): value is AwtrixPayload {
  return isObject(value);
}

function toPayloadOrEmptyObject(value: unknown): AwtrixPayload {
  if (isPayloadObject(value)) {
    return value;
  }

  return {};
}

function clonePayload(payload: AwtrixPayload): AwtrixPayload {
  return structuredClone(payload);
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(record);
}

function cloneStringArray(values: string[]): string[] {
  return [...values];
}

function cloneIndicatorState(state: IndicatorState): IndicatorState {
  return {
    enabled: state.enabled,
    color: structuredClone(state.color),
    blinkMs: state.blinkMs,
    fadeMs: state.fadeMs,
  };
}

function removeClientsFromPayload(payload: AwtrixPayload): AwtrixPayload {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (key !== "clients") {
      sanitized[key] = value;
    }
  }

  if (isPayloadObject(sanitized)) {
    return sanitized;
  }

  return {};
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

function readBooleanKey(object: Record<string, unknown>, key: string): boolean | undefined {
  return readBoolean(object[key]);
}

function readNumberKey(object: Record<string, unknown>, key: string): number | undefined {
  return readNumber(object[key]);
}

function readStringKey(object: Record<string, unknown>, key: string): string | undefined {
  return readString(object[key]);
}

function readStackOption(value: unknown): boolean {
  if (!isObject(value)) {
    return true;
  }

  const stackValue = readBooleanKey(value, "stack");
  if (stackValue === undefined) {
    return true;
  }

  return stackValue;
}

function readPowerOption(jsonText: string, parsed: unknown): boolean | undefined {
  if (isObject(parsed)) {
    const powerValue = readBooleanKey(parsed, "power");
    if (powerValue !== undefined) {
      return powerValue;
    }
  }

  if (jsonText === "true" || jsonText === "1") {
    return true;
  }
  return undefined;
}

function clampChannel(channel: number): number {
  return Math.min(255, Math.max(0, Math.round(channel)));
}

function readColorValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    const clamped = Math.min(0xffffff, Math.max(0, value));
    return clamped;
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (normalized === "0") {
      return 0;
    }

    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      const parsed = Number.parseInt(normalized.slice(1), 16);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return undefined;
  }

  if (Array.isArray(value) && value.length === 3) {
    const red = readNumber(value[0]);
    const green = readNumber(value[1]);
    const blue = readNumber(value[2]);

    if (red !== undefined && green !== undefined && blue !== undefined) {
      return (clampChannel(red) << 16) | (clampChannel(green) << 8) | clampChannel(blue);
    }
  }

  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return undefined;
    }

    result.push(entry);
  }

  return result;
}

function parseAppVectorUpdate(value: unknown): AppVectorUpdateItem[] | undefined {
  const rawItems: unknown[] = [];

  if (Array.isArray(value)) {
    rawItems.push(...value);
  } else if (isObject(value)) {
    rawItems.push(value);
  } else {
    return undefined;
  }

  const result: AppVectorUpdateItem[] = [];

  for (const item of rawItems) {
    if (!isObject(item)) {
      continue;
    }

    const name = readStringKey(item, "name");
    const show = readBooleanKey(item, "show");

    if (name === undefined || show === undefined) {
      continue;
    }

    const pos = readNumberKey(item, "pos");
    result.push({
      name,
      show,
      pos,
    });
  }

  return result;
}

function createAppLoopIndexObject(loopNames: string[]): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [index, name] of loopNames.entries()) {
    result[name] = index;
  }

  return result;
}

function createBlackScreen(): number[] {
  const screen: number[] = [];

  for (let index = 0; index < MATRIX_PIXEL_COUNT; index += 1) {
    screen.push(0);
  }

  return screen;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}

function isBuiltInApp(name: string): boolean {
  return BUILT_IN_APPS.includes(name);
}

export class VirtualAwtrixDevice {
  readonly host: string;
  readonly port: number;
  readonly version: string;

  private readonly server: ReturnType<typeof Bun.serve>;
  private readonly apps = new Map<string, AwtrixPayload>();
  private readonly customRequests: CustomAppRequest[] = [];
  private readonly activeNotifications: AwtrixPayload[] = [];
  private readonly notificationRequests: AwtrixPayload[] = [];
  private readonly waiters = new Set<Waiter>();
  private readonly soundRequests: string[] = [];
  private readonly rtttlRequests: string[] = [];
  private readonly r2d2Requests: string[] = [];
  private readonly indicators: Record<1 | 2 | 3, IndicatorState> = {
    1: { enabled: false, color: 0, blinkMs: 0, fadeMs: 0 },
    2: { enabled: false, color: 0, blinkMs: 0, fadeMs: 0 },
    3: { enabled: false, color: 0, blinkMs: 0, fadeMs: 0 },
  };
  private readonly uid = crypto.randomUUID();
  private requestCount = 0;
  private stopped = false;
  private matrixPowerOn = true;
  private sleepSeconds = 0;
  private moodlightEnabled = false;
  private moodlightPayload: Record<string, unknown> | undefined;
  private settings = createDefaultSettings();
  private appLoop = cloneStringArray(BUILT_IN_APPS);
  private currentAppIndex = 0;
  private screen = createBlackScreen();
  private rebootCount = 0;
  private eraseCount = 0;
  private resetSettingsCount = 0;
  private updateAvailable = false;

  constructor(options: VirtualAwtrixDeviceOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.version = options.version ?? "virtual-awtrix3";

    this.server = Bun.serve({
      hostname: this.host,
      port: options.port ?? 0,
      fetch: this.handleRequest,
    });

    const serverPort = this.server.port;
    if (serverPort === undefined) {
      this.server.stop();
      throw new Error("VirtualAwtrixDevice failed to bind to a port.");
    }

    this.port = serverPort;
  }

  get url(): string {
    return `http://${this.host}:${this.port}`;
  }

  stop(): void {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.server.stop();

    for (const waiter of this.waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error(waiter.message));
    }

    this.waiters.clear();
  }

  reset(): void {
    this.apps.clear();
    this.customRequests.length = 0;
    this.activeNotifications.length = 0;
    this.notificationRequests.length = 0;
    this.soundRequests.length = 0;
    this.rtttlRequests.length = 0;
    this.r2d2Requests.length = 0;
    this.requestCount = 0;
    this.matrixPowerOn = true;
    this.sleepSeconds = 0;
    this.moodlightEnabled = false;
    this.moodlightPayload = undefined;
    this.settings = createDefaultSettings();
    this.appLoop = cloneStringArray(BUILT_IN_APPS);
    this.currentAppIndex = 0;
    this.screen = createBlackScreen();
    this.rebootCount = 0;
    this.eraseCount = 0;
    this.resetSettingsCount = 0;
    this.updateAvailable = false;
    this.indicators[1] = { enabled: false, color: 0, blinkMs: 0, fadeMs: 0 };
    this.indicators[2] = { enabled: false, color: 0, blinkMs: 0, fadeMs: 0 };
    this.indicators[3] = { enabled: false, color: 0, blinkMs: 0, fadeMs: 0 };
  }

  setUpdateAvailable(value: boolean): void {
    this.updateAvailable = value;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  getCustomRequestCount(): number {
    return this.customRequests.length;
  }

  getNotificationCount(): number {
    return this.notificationRequests.length;
  }

  getActiveNotificationCount(): number {
    return this.activeNotifications.length;
  }

  isMatrixPoweredOn(): boolean {
    return this.matrixPowerOn;
  }

  getSleepSeconds(): number {
    return this.sleepSeconds;
  }

  isMoodlightEnabled(): boolean {
    return this.moodlightEnabled;
  }

  getMoodlightPayload(): Record<string, unknown> | undefined {
    if (this.moodlightPayload === undefined) {
      return undefined;
    }

    return cloneRecord(this.moodlightPayload);
  }

  getSettings(): Record<string, unknown> {
    return cloneRecord(this.settings);
  }

  getAppLoop(): string[] {
    return cloneStringArray(this.appLoop);
  }

  getCurrentAppName(): string {
    if (this.activeNotifications.length > 0) {
      return "Notification";
    }

    if (this.appLoop.length === 0) {
      return "";
    }

    const appName = this.appLoop[this.currentAppIndex];
    if (appName === undefined) {
      return "";
    }

    return appName;
  }

  getIndicatorState(indicator: 1 | 2 | 3): IndicatorState {
    return cloneIndicatorState(this.indicators[indicator]);
  }

  getSoundRequests(): string[] {
    return cloneStringArray(this.soundRequests);
  }

  getRtttlRequests(): string[] {
    return cloneStringArray(this.rtttlRequests);
  }

  getR2D2Requests(): string[] {
    return cloneStringArray(this.r2d2Requests);
  }

  getRebootCount(): number {
    return this.rebootCount;
  }

  getEraseCount(): number {
    return this.eraseCount;
  }

  getResetSettingsCount(): number {
    return this.resetSettingsCount;
  }

  getScreen(): number[] {
    return structuredClone(this.screen);
  }

  getApp(name: string): AwtrixPayload | undefined {
    const payload = this.apps.get(name);
    if (payload === undefined) {
      return undefined;
    }

    return clonePayload(payload);
  }

  getApps(): Record<string, AwtrixPayload> {
    const result: Record<string, AwtrixPayload> = {};

    for (const [name, payload] of this.apps.entries()) {
      result[name] = clonePayload(payload);
    }

    return result;
  }

  getCustomRequests(): CustomAppRequest[] {
    return this.customRequests.map((request) => {
      if (request.payload === undefined) {
        return { name: request.name, deleted: request.deleted };
      }

      if (Array.isArray(request.payload)) {
        return {
          name: request.name,
          deleted: request.deleted,
          payload: request.payload.map((entry) => clonePayload(entry)),
        };
      }

      return {
        name: request.name,
        deleted: request.deleted,
        payload: clonePayload(request.payload),
      };
    });
  }

  getLastNotification(): AwtrixPayload | undefined {
    const payload = this.notificationRequests.at(-1);
    if (payload === undefined) {
      return undefined;
    }

    return clonePayload(payload);
  }

  getNotifications(): AwtrixPayload[] {
    return this.notificationRequests.map((payload) => clonePayload(payload));
  }

  getActiveNotifications(): AwtrixPayload[] {
    return this.activeNotifications.map((payload) => clonePayload(payload));
  }

  waitForRequestCount(count: number, timeoutMs = 1000): Promise<void> {
    return this.waitFor(
      () => this.requestCount >= count,
      timeoutMs,
      `Timed out waiting for ${count} requests. Observed ${this.requestCount}.`,
    );
  }

  waitForCustomRequestCount(count: number, timeoutMs = 1000): Promise<void> {
    return this.waitFor(
      () => this.customRequests.length >= count,
      timeoutMs,
      `Timed out waiting for ${count} custom app requests. Observed ${this.customRequests.length}.`,
    );
  }

  waitForNotificationCount(count: number, timeoutMs = 1000): Promise<void> {
    return this.waitFor(
      () => this.notificationRequests.length >= count,
      timeoutMs,
      `Timed out waiting for ${count} notifications. Observed ${this.notificationRequests.length}.`,
    );
  }

  waitForActiveNotificationCount(count: number, timeoutMs = 1000): Promise<void> {
    return this.waitFor(
      () => this.activeNotifications.length >= count,
      timeoutMs,
      `Timed out waiting for ${count} active notifications. Observed ${this.activeNotifications.length}.`,
    );
  }

  async waitForApp(name: string, timeoutMs = 1000): Promise<AwtrixPayload> {
    await this.waitFor(
      () => this.apps.has(name),
      timeoutMs,
      `Timed out waiting for app payload "${name}".`,
    );

    const payload = this.getApp(name);
    if (payload === undefined) {
      throw new Error(`App payload "${name}" was not found after wait.`);
    }

    return payload;
  }

  waitForAppDeletion(name: string, timeoutMs = 1000): Promise<void> {
    return this.waitFor(
      () => !this.apps.has(name),
      timeoutMs,
      `Timed out waiting for app deletion "${name}".`,
    );
  }

  private waitFor(condition: () => boolean, timeoutMs: number, message: string): Promise<void> {
    if (condition()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        condition,
        resolve: () => {
          clearTimeout(waiter.timeout);
          this.waiters.delete(waiter);
          resolve();
        },
        reject,
        timeout: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(message));
        }, timeoutMs),
        message,
      };

      this.waiters.add(waiter);
    });
  }

  private flushWaiters(): void {
    for (const waiter of this.waiters) {
      if (waiter.condition()) {
        waiter.resolve();
      }
    }
  }

  private ensureLoopIndexInRange(): void {
    if (this.appLoop.length === 0) {
      this.currentAppIndex = 0;
      return;
    }

    if (this.currentAppIndex >= this.appLoop.length) {
      this.currentAppIndex = 0;
    }

    if (this.currentAppIndex < 0) {
      this.currentAppIndex = 0;
    }
  }

  private deleteCustomAppsByPrefix(prefix: string): void {
    for (const name of this.apps.keys()) {
      if (name.startsWith(prefix)) {
        this.apps.delete(name);
      }
    }

    this.appLoop = this.appLoop.filter((name) => !name.startsWith(prefix));
    this.ensureLoopIndexInRange();
  }

  private upsertLoopApp(name: string, position: number | undefined): void {
    const existingIndex = this.appLoop.indexOf(name);
    if (existingIndex !== -1) {
      this.appLoop.splice(existingIndex, 1);
    }

    if (position === undefined) {
      this.appLoop.push(name);
      this.ensureLoopIndexInRange();
      return;
    }

    const normalizedPosition = Math.max(0, Math.min(this.appLoop.length, Math.floor(position)));
    this.appLoop.splice(normalizedPosition, 0, name);
    this.ensureLoopIndexInRange();
  }

  private moveLoopApp(name: string, position: number): void {
    const existingIndex = this.appLoop.indexOf(name);
    if (existingIndex === -1) {
      return;
    }

    this.appLoop.splice(existingIndex, 1);
    const normalizedPosition = Math.max(0, Math.min(this.appLoop.length, Math.floor(position)));
    this.appLoop.splice(normalizedPosition, 0, name);
    this.ensureLoopIndexInRange();
  }

  private maybeApplyMoodlightToScreen(payload: Record<string, unknown>): void {
    const colorValue = readColorValue(payload["color"]);
    if (colorValue === undefined) {
      return;
    }

    const nextScreen: number[] = [];
    for (let index = 0; index < MATRIX_PIXEL_COUNT; index += 1) {
      nextScreen.push(colorValue);
    }

    this.screen = nextScreen;
  }

  private clearScreen(): void {
    this.screen = createBlackScreen();
  }

  private applySettingsPatch(patch: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(patch)) {
      this.settings[key] = value;

      if (key === "MATP") {
        const matrixPower = readBoolean(value);
        if (matrixPower !== undefined) {
          this.matrixPowerOn = matrixPower;
        }
      }
    }
  }

  private getAppsWithIcon(): Array<Record<string, unknown>> {
    const list: Array<Record<string, unknown>> = [];

    for (const appName of this.appLoop) {
      const item: Record<string, unknown> = { name: appName };
      const customApp = this.apps.get(appName);
      if (customApp !== undefined && typeof customApp.icon === "string") {
        item.icon = customApp.icon;
      }

      list.push(item);
    }

    return list;
  }

  private getStatsObject(): Record<string, unknown> {
    return {
      type: 0,
      bat: 100,
      batRaw: 4200,
      lux: 0,
      ldrRaw: 0,
      ram: 0,
      bri: this.settings["BRI"],
      temp: 21,
      hum: 40,
      uptime: this.requestCount,
      signal: -45,
      messages: this.requestCount,
      version: this.version,
      indicator1: this.indicators[1].enabled,
      indicator2: this.indicators[2].enabled,
      indicator3: this.indicators[3].enabled,
      app: this.getCurrentAppName(),
      uid: this.uid,
      matrix: this.matrixPowerOn,
      ip_address: `${this.host}:${this.port}`,
    };
  }

  private applyAppsVectorUpdate(items: AppVectorUpdateItem[]): void {
    for (const item of items) {
      const existsInLoop = this.appLoop.includes(item.name);
      const isNative = isBuiltInApp(item.name);

      if (!item.show) {
        if (existsInLoop) {
          this.appLoop = this.appLoop.filter((name) => name !== item.name);
        }

        continue;
      }

      if (isNative) {
        this.upsertLoopApp(item.name, item.pos);
        continue;
      }

      if (existsInLoop && item.pos !== undefined) {
        this.moveLoopApp(item.name, item.pos);
      }
    }

    this.ensureLoopIndexInRange();
  }

  private applyReorder(names: string[]): void {
    const reordered: string[] = [];

    for (const name of names) {
      if (this.appLoop.includes(name)) {
        reordered.push(name);
      }
    }

    this.appLoop = reordered;
    this.ensureLoopIndexInRange();
  }

  private handleNotifyDismiss(): Response {
    if (this.activeNotifications.length > 0) {
      this.activeNotifications.shift();
    }

    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private handleReboot(): Response {
    this.rebootCount += 1;
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private handleNextApp(): Response {
    if (this.appLoop.length > 0) {
      this.currentAppIndex = (this.currentAppIndex + 1) % this.appLoop.length;
    }

    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private handlePreviousApp(): Response {
    if (this.appLoop.length > 0) {
      this.currentAppIndex = (this.currentAppIndex + this.appLoop.length - 1) % this.appLoop.length;
    }

    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private handleResetSettings(): Response {
    this.resetSettingsCount += 1;
    this.settings = createDefaultSettings();
    this.matrixPowerOn = true;
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private handleErase(): Response {
    this.eraseCount += 1;
    this.apps.clear();
    this.appLoop = cloneStringArray(BUILT_IN_APPS);
    this.currentAppIndex = 0;
    this.activeNotifications.length = 0;
    this.notificationRequests.length = 0;
    this.settings = createDefaultSettings();
    this.matrixPowerOn = true;
    this.sleepSeconds = 0;
    this.moodlightEnabled = false;
    this.moodlightPayload = undefined;
    this.clearScreen();
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private readonly handleRequest = async (request: Request): Promise<Response> => {
    this.requestCount += 1;

    const requestUrl = new URL(request.url);
    const path = requestUrl.pathname;

    if (path === "/api/notify/dismiss") {
      return this.handleNotifyDismiss();
    }

    if (path === "/api/reboot") {
      return this.handleReboot();
    }

    if (path === "/api/nextapp") {
      return this.handleNextApp();
    }

    if (path === "/api/erase") {
      return this.handleErase();
    }

    if (path === "/api/resetSettings") {
      return this.handleResetSettings();
    }

    if (path === "/version" && request.method === "GET") {
      this.flushWaiters();
      return textResponse(this.version, 200);
    }

    if (path === "/api/loop" && request.method === "GET") {
      this.flushWaiters();
      return jsonResponse(createAppLoopIndexObject(this.appLoop), 200);
    }

    if (path === "/api/effects" && request.method === "GET") {
      this.flushWaiters();
      return jsonResponse(EFFECT_NAMES, 200);
    }

    if (path === "/api/transitions" && request.method === "GET") {
      this.flushWaiters();
      return jsonResponse(TRANSITION_NAMES, 200);
    }

    if (path === "/api/apps" && request.method === "GET") {
      this.flushWaiters();
      return jsonResponse(this.getAppsWithIcon(), 200);
    }

    if (path === "/api/settings" && request.method === "GET") {
      this.flushWaiters();
      return jsonResponse(this.settings, 200);
    }

    if (path === "/api/stats" && request.method === "GET") {
      this.flushWaiters();
      return jsonResponse(this.getStatsObject(), 200);
    }

    if (path === "/api/screen" && request.method === "GET") {
      this.flushWaiters();
      return jsonResponse(this.screen, 200);
    }

    if (request.method !== "POST") {
      this.flushWaiters();
      return textResponse("Method Not Allowed", 405);
    }

    if (path === "/api/custom") {
      return this.handleCustomRequest(request, requestUrl);
    }

    if (path === "/api/notify") {
      return this.handleNotifyRequest(request);
    }

    if (path === "/api/power") {
      return this.handlePowerRequest(request);
    }

    if (path === "/api/sleep") {
      return this.handleSleepRequest(request);
    }

    if (path === "/api/moodlight") {
      return this.handleMoodlightRequest(request);
    }

    if (path === "/api/indicator1") {
      return this.handleIndicatorRequest(request, 1);
    }

    if (path === "/api/indicator2") {
      return this.handleIndicatorRequest(request, 2);
    }

    if (path === "/api/indicator3") {
      return this.handleIndicatorRequest(request, 3);
    }

    if (path === "/api/apps") {
      return this.handleAppsRequest(request);
    }

    if (path === "/api/reorder") {
      return this.handleReorderRequest(request);
    }

    if (path === "/api/switch") {
      return this.handleSwitchRequest(request);
    }

    if (path === "/api/settings") {
      return this.handleSettingsRequest(request);
    }

    if (path === "/api/sound") {
      return this.handleSoundRequest(request);
    }

    if (path === "/api/rtttl") {
      return this.handleRtttlRequest(request);
    }

    if (path === "/api/r2d2") {
      return this.handleR2D2Request(request);
    }

    if (path === "/api/previousapp") {
      return this.handlePreviousAppPost();
    }

    if (path === "/api/doupdate") {
      return this.handleDoUpdateRequest();
    }

    this.flushWaiters();
    return textResponse("Not Found", 404);
  };

  private async handleCustomRequest(request: Request, requestUrl: URL): Promise<Response> {
    const name = requestUrl.searchParams.get("name") ?? "";
    const bodyText = await request.text();

    if (bodyText.length === 0 || bodyText === "{}") {
      this.deleteCustomAppsByPrefix(name);
      this.customRequests.push({ name, deleted: true });
      this.flushWaiters();
      return textResponse("OK", 200);
    }

    const parsedBody = parseJson(bodyText);
    if (!parsedBody.ok) {
      this.flushWaiters();
      return textResponse("ErrorParsingJson", 500);
    }

    if (isObject(parsedBody.value)) {
      const payload = clonePayload(toPayloadOrEmptyObject(parsedBody.value));
      const position = readNumberKey(parsedBody.value, "pos");
      this.apps.set(name, payload);
      this.upsertLoopApp(name, position);
      this.customRequests.push({ name, deleted: false, payload: clonePayload(payload) });
      this.flushWaiters();
      return textResponse("OK", 200);
    }

    if (Array.isArray(parsedBody.value)) {
      const payloadArray: AwtrixPayload[] = [];

      for (let index = 0; index < parsedBody.value.length; index += 1) {
        const pageValue = parsedBody.value[index];
        const payload = clonePayload(toPayloadOrEmptyObject(pageValue));
        const appName = `${name}${index}`;
        this.apps.set(appName, payload);
        this.upsertLoopApp(appName, undefined);
        payloadArray.push(clonePayload(payload));
      }

      this.customRequests.push({ name, deleted: false, payload: payloadArray });
      this.flushWaiters();
      return textResponse("OK", 200);
    }

    this.customRequests.push({ name, deleted: false });
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleNotifyRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();
    const parsedBody = parseJson(bodyText);

    if (!parsedBody.ok) {
      this.flushWaiters();
      return textResponse("ErrorParsingJson", 500);
    }

    const payloadObject = toPayloadOrEmptyObject(parsedBody.value);
    const payload = removeClientsFromPayload(payloadObject);
    const stack = readStackOption(parsedBody.value);
    const requestPayload = clonePayload(payload);

    if (stack) {
      this.activeNotifications.push(clonePayload(requestPayload));
    } else if (this.activeNotifications.length === 0) {
      this.activeNotifications.push(clonePayload(requestPayload));
    } else {
      this.activeNotifications[0] = clonePayload(requestPayload);
    }

    this.notificationRequests.push(requestPayload);
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handlePowerRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();
    const parsed = parseJson(bodyText);

    let nextPowerState: boolean;
    if (parsed.ok) {
      const parsedPower = readPowerOption(bodyText, parsed.value);
      if (parsedPower === undefined) {
        this.flushWaiters();
        return textResponse("OK", 200);
      }

      nextPowerState = parsedPower;
    } else {
      nextPowerState = bodyText === "true" || bodyText === "1";
    }

    this.matrixPowerOn = nextPowerState;
    this.settings["MATP"] = nextPowerState;

    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleSleepRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();
    const parsedBody = parseJson(bodyText);

    if (parsedBody.ok && isObject(parsedBody.value)) {
      const sleepValue = readNumberKey(parsedBody.value, "sleep");
      if (sleepValue !== undefined) {
        this.sleepSeconds = Math.max(0, Math.floor(sleepValue));
      }
    }

    this.matrixPowerOn = false;
    this.settings["MATP"] = false;
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleMoodlightRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();

    if (bodyText === "") {
      this.moodlightEnabled = false;
      this.moodlightPayload = undefined;
      this.clearScreen();
      this.flushWaiters();
      return textResponse("OK", 200);
    }

    const parsedBody = parseJson(bodyText);
    if (!parsedBody.ok || !isObject(parsedBody.value)) {
      this.flushWaiters();
      return textResponse("ErrorParsingJson", 500);
    }

    this.moodlightEnabled = true;
    this.moodlightPayload = cloneRecord(parsedBody.value);
    this.maybeApplyMoodlightToScreen(parsedBody.value);
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleIndicatorRequest(request: Request, indicator: 1 | 2 | 3): Promise<Response> {
    const bodyText = await request.text();

    if (bodyText === "" || bodyText === "{}") {
      this.indicators[indicator] = {
        enabled: false,
        color: this.indicators[indicator].color,
        blinkMs: 0,
        fadeMs: 0,
      };

      this.flushWaiters();
      return textResponse("OK", 200);
    }

    const parsedBody = parseJson(bodyText);
    if (!parsedBody.ok || !isObject(parsedBody.value)) {
      this.flushWaiters();
      return textResponse("ErrorParsingJson", 500);
    }

    const nextState: IndicatorState = {
      enabled: this.indicators[indicator].enabled,
      color: this.indicators[indicator].color,
      blinkMs: 0,
      fadeMs: 0,
    };

    if (Object.hasOwn(parsedBody.value, "color")) {
      const colorValue = readColorValue(parsedBody.value["color"]);
      nextState.color = structuredClone(parsedBody.value["color"]);
      nextState.enabled = colorValue !== undefined && colorValue > 0;
    }

    const blink = readNumberKey(parsedBody.value, "blink");
    if (blink !== undefined) {
      nextState.blinkMs = Math.max(0, Math.floor(blink));
    }

    const fade = readNumberKey(parsedBody.value, "fade");
    if (fade !== undefined) {
      nextState.fadeMs = Math.max(0, Math.floor(fade));
    }

    this.indicators[indicator] = nextState;
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleAppsRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();
    const parsedBody = parseJson(bodyText);

    if (parsedBody.ok) {
      const updates = parseAppVectorUpdate(parsedBody.value);
      if (updates !== undefined) {
        this.applyAppsVectorUpdate(updates);
      }
    }

    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleReorderRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();
    const parsedBody = parseJson(bodyText);

    if (parsedBody.ok) {
      const names = readStringArray(parsedBody.value);
      if (names !== undefined) {
        this.applyReorder(names);
      }
    }

    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleSwitchRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();
    const parsedBody = parseJson(bodyText);

    if (!parsedBody.ok || !isObject(parsedBody.value)) {
      this.flushWaiters();
      return textResponse("FAILED", 500);
    }

    const name = readStringKey(parsedBody.value, "name");
    if (name === undefined) {
      this.flushWaiters();
      return textResponse("FAILED", 500);
    }

    const index = this.appLoop.indexOf(name);
    if (index === -1) {
      this.flushWaiters();
      return textResponse("FAILED", 500);
    }

    this.currentAppIndex = index;
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleSettingsRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();
    const parsedBody = parseJson(bodyText);

    if (parsedBody.ok && isObject(parsedBody.value)) {
      this.applySettingsPatch(parsedBody.value);
    }

    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleSoundRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();
    const parsedBody = parseJson(bodyText);

    if (parsedBody.ok && isObject(parsedBody.value)) {
      const soundName = readStringKey(parsedBody.value, "sound");
      if (soundName !== undefined && soundName.length > 0) {
        this.soundRequests.push(soundName);
        this.flushWaiters();
        return textResponse("OK", 200);
      }

      this.flushWaiters();
      return textResponse("FileNotFound", 404);
    }

    if (bodyText.length > 0) {
      this.soundRequests.push(bodyText);
      this.flushWaiters();
      return textResponse("OK", 200);
    }

    this.flushWaiters();
    return textResponse("FileNotFound", 404);
  }

  private async handleRtttlRequest(request: Request): Promise<Response> {
    const bodyText = await request.text();
    this.rtttlRequests.push(bodyText);
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private async handleR2D2Request(request: Request): Promise<Response> {
    const bodyText = await request.text();
    this.r2d2Requests.push(bodyText);
    this.flushWaiters();
    return textResponse("OK", 200);
  }

  private handlePreviousAppPost(): Response {
    return this.handlePreviousApp();
  }

  private handleDoUpdateRequest(): Response {
    this.flushWaiters();

    if (this.updateAvailable) {
      return textResponse("OK", 200);
    }

    return textResponse("NoUpdateFound", 404);
  }
}

export function createVirtualAwtrixDevice(
  options: VirtualAwtrixDeviceOptions = {},
): VirtualAwtrixDevice {
  return new VirtualAwtrixDevice(options);
}
