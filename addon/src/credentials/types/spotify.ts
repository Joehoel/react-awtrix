import { type } from "arktype";
import type { CredentialType } from "../registry.ts";

/**
 * Spotify is a public OAuth 2.0 client: there is no client secret, so the
 * authorization-code flow uses PKCE. The client id defaults from
 * SPOTIFY_CLIENT_ID at connect time when not supplied.
 */
export const spotify: CredentialType = {
  name: "spotify",
  displayName: "Spotify",
  fields: [
    {
      name: "clientId",
      displayName: "OAuth client ID",
      schema: type("string > 0"),
      description: "Spotify app client ID (defaults to SPOTIFY_CLIENT_ID).",
    },
  ],
  auth: {
    kind: "oauth2-code",
    provider: "spotify",
    scopes: ["user-read-currently-playing", "user-read-playback-state"],
    pkce: true,
  },
  test: { url: "https://api.spotify.com/v1/me" },
};
