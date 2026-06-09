// Add-on entrypoint: starts a react-awtrix runtime and registers the apps.
// Home Assistant connectivity is wired up as a side effect of importing the
// components (see ha.tsx), so state changes re-render and push to the device.
import { createRuntime } from "react-awtrix";
import { WeatherClock } from "./clock.tsx";
import { resolveProtocol } from "./discover.ts";

async function main(): Promise<void> {
  const protocol = await resolveProtocol();
  const runtime = createRuntime({ protocol, debounce: 50 });

  runtime.app("clock", <WeatherClock />);
  runtime.handleSignals();

  console.log("[react-awtrix] add-on started");
}

main().catch((error) => {
  console.error("[react-awtrix] fatal:", error);
  process.exit(1);
});
