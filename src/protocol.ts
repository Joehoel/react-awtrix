import type { AwtrixPayload } from "./payload.ts";

export interface AwtrixProtocolEventMap {
  "button:left": { pressed: boolean; raw: string };
  "button:select": { pressed: boolean; raw: string };
  "button:right": { pressed: boolean; raw: string };
  currentApp: { name: string };
  stats: { value: Record<string, unknown> };
  device: { online: boolean };
}

export interface AwtrixProtocol {
  // oxlint-disable-next-line typescript/ban-types -- `string & {}` is an intentional pattern for autocomplete hints
  readonly kind: "http" | "mqtt" | (string & {});
  readonly key: string;
  pushApp(name: string, payload: AwtrixPayload): Promise<void>;
  deleteApp(name: string): Promise<void>;
  pushNotify(payload: AwtrixPayload): Promise<void>;
  dismissNotify?(): Promise<void>;
  connect?(): Promise<void>;
  dispose?(): Promise<void>;
  on?<K extends keyof AwtrixProtocolEventMap>(
    event: K,
    handler: (payload: AwtrixProtocolEventMap[K]) => void,
  ): () => void;
}
