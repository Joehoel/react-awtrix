import { http } from "./http.ts";
import type { NotifyOptions, RenderOptions, RuntimeOptions } from "../api.ts";
import type { AwtrixProtocol } from "../protocol.ts";

type ProtocolOptions = RenderOptions | NotifyOptions | RuntimeOptions;

export function resolveProtocol(options: ProtocolOptions): AwtrixProtocol {
  if ("protocol" in options) {
    return options.protocol;
  }

  return http({ host: options.host, port: options.port });
}
