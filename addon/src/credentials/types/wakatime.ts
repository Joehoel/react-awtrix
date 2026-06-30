import { type } from "arktype";
import type { CredentialType } from "../registry.ts";

/**
 * WakaTime authenticates with HTTP Basic, where the username is the base64 of
 * the API key (no password). The injection template emits the Basic header
 * directly from the stored `apiKey` field.
 */
export const wakatime: CredentialType = {
  name: "wakatime",
  displayName: "WakaTime",
  fields: [
    {
      name: "apiKey",
      displayName: "API key",
      schema: type("string > 0"),
      secret: true,
      description: "Your WakaTime API key from https://wakatime.com/settings/api-key",
    },
  ],
  auth: {
    kind: "apiKey",
    inject: {
      in: "header",
      name: "Authorization",
      template: "Basic {{base64(apiKey)}}",
    },
  },
  test: { url: "https://wakatime.com/api/v1/users/current" },
};
