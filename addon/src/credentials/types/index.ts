import { registerCredentialType } from "../registry.ts";
import { github } from "./github.ts";
import { spotify } from "./spotify.ts";
import { wakatime } from "./wakatime.ts";

/**
 * Registers all built-in Credential Types. Import this module once at boot,
 * before exposing credentials via the API, so masking is registry-driven.
 */
registerCredentialType(wakatime);
registerCredentialType(github);
registerCredentialType(spotify);
