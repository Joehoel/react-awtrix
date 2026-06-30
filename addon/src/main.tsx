// Add-on entrypoint: starts a react-awtrix runtime and registers the apps.
// Home Assistant connectivity is wired up as a side effect of importing the
// components (see ha.tsx), so state changes re-render and push to the device.
import { createRuntime } from "react-awtrix";
import { initManager } from "./credentials/manager.ts";
// Side-effect import: registers all built-in Credential Types before anything
// exposes credentials (masking is registry-driven) or renders an app.
import "./credentials/types/index.ts";
import { resolveProtocol } from "./discover.ts";
import { GitHubContributionGraph } from "./github-contributions.tsx";
import { startWebServer } from "./server.ts";

async function main(): Promise<void> {
  await initManager();
  startWebServer();

  const protocol = await resolveProtocol();
  try {
    await protocol.deleteApp("clock");
  } catch (error) {
    console.warn("[react-awtrix] failed to delete stale clock app", error);
  }

  const runtime = createRuntime({ protocol, debounce: 50 });

  runtime.app("github-contributions", <GitHubContributionGraph />);
  runtime.handleSignals();

  console.log("[react-awtrix] add-on started");
}

main().catch((error) => {
  console.error("[react-awtrix] fatal:", error);
  process.exit(1);
});
