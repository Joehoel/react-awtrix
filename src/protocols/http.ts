import { deleteApp, pushApp, pushNotify } from "../client.ts";
import type { AwtrixPayload, AwtrixProtocol } from "../types.ts";

export interface HttpProtocolOptions {
  host: string;
  port?: number;
}

export function http(options: HttpProtocolOptions): AwtrixProtocol {
  const host = options.host;
  const port = options.port ?? 80;

  return {
    kind: "http",
    key: `http:${host}:${port}`,
    pushApp: async (name: string, payload: AwtrixPayload) => {
      await pushApp(host, port, name, payload);
    },
    deleteApp: async (name: string) => {
      await deleteApp(host, port, name);
    },
    pushNotify: async (payload: AwtrixPayload) => {
      await pushNotify(host, port, payload);
    },
  };
}
