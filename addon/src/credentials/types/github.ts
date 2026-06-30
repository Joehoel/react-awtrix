import { type } from "arktype";
import type { CredentialType } from "../registry.ts";

/**
 * GitHub is a confidential OAuth 2.0 client: token exchange needs both the
 * client id and client secret, so no PKCE. The client credentials default from
 * GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET at connect time when not supplied.
 */
export const github: CredentialType = {
  name: "github",
  displayName: "GitHub",
  fields: [
    {
      name: "clientId",
      displayName: "OAuth client ID",
      schema: type("string > 0"),
      description: "GitHub OAuth app client ID (defaults to GITHUB_CLIENT_ID).",
    },
    {
      name: "clientSecret",
      displayName: "OAuth client secret",
      schema: type("string > 0"),
      secret: true,
      description: "GitHub OAuth app client secret (defaults to GITHUB_CLIENT_SECRET).",
    },
  ],
  auth: {
    kind: "oauth2-code",
    provider: "github",
    scopes: ["read:user"],
    pkce: false,
  },
  test: { url: "https://api.github.com/user" },
};
