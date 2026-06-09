import type { ReactNode } from "react";
import type { AwtrixProtocol, AwtrixProtocolEventMap } from "./protocol.ts";

interface HostConnectionOptions {
  host: string;
  port?: number;
}

interface ProtocolConnectionOptions {
  protocol: AwtrixProtocol;
  host?: never;
  port?: never;
}

type ConnectionOptions = HostConnectionOptions | ProtocolConnectionOptions;

export type RenderOptions = ConnectionOptions & {
  app: string;
  debug?: boolean;
  debounce?: number;
  width?: number;
  height?: number;
};

export type NotifyOptions = ConnectionOptions & {
  hold?: boolean;
  sound?: string;
  stack?: boolean;
  wakeup?: boolean;
  debug?: boolean;
  width?: number;
  height?: number;
  /** Timeout in ms before notify() rejects if nothing renders. Default: 5000 */
  timeout?: number;
};

export interface RenderHandle {
  unmount(): Promise<void>;
}

export interface AppHandle extends RenderHandle {
  update(element: ReactNode): void;
}

export type RuntimeOptions = ConnectionOptions & {
  debug?: boolean;
  debounce?: number;
  width?: number;
  height?: number;
  hmr?: boolean;
  onError?: (appName: string, error: unknown) => void;
};

export interface Runtime {
  app(name: string, element: ReactNode): AppHandle;
  remove(name: string): Promise<void>;
  dispose(): Promise<void>;
  apps(): string[];
  on<K extends keyof AwtrixProtocolEventMap>(
    event: K,
    handler: (payload: AwtrixProtocolEventMap[K]) => void,
  ): void;
  off<K extends keyof AwtrixProtocolEventMap>(
    event: K,
    handler: (payload: AwtrixProtocolEventMap[K]) => void,
  ): void;
  handleSignals(): void;
}
