import { http } from "./http.ts";
import type { AwtrixProtocol, NotifyOptions, RenderOptions, RuntimeOptions } from "../types.ts";

type ProtocolOptions = RenderOptions | NotifyOptions | RuntimeOptions;

export function resolveProtocol(options: ProtocolOptions): AwtrixProtocol {
  if ("protocol" in options) {
    return options.protocol;
  }

  return http({ host: options.host, port: options.port });
}
