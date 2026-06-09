// Add-on entrypoint: starts a react-awtrix runtime and registers the apps.
// Home Assistant connectivity is wired up as a side effect of importing the
// components (see ha.tsx), so state changes re-render and push to the device.
import { readFileSync } from "node:fs";
import { createRuntime } from "react-awtrix";
import { WeatherClock } from "./clock.tsx";

function awtrixHost(): string {
  // The Supervisor writes the add-on options here.
  try {
    const options = JSON.parse(readFileSync("/data/options.json", "utf8")) as {
      awtrix_host?: string;
    };
    if (options.awtrix_host) {
      return options.awtrix_host;
    }
  } catch {
    // Not running as an add-on (e.g. `bun run dev`): fall back to the env var.
  }

  const fromEnv = process.env.AWTRIX_HOST;
  if (fromEnv) {
    return fromEnv;
  }

  throw new Error("Set the add-on's `awtrix_host` option (or AWTRIX_HOST for local dev).");
}

const runtime = createRuntime({ host: awtrixHost(), debounce: 50 });

runtime.app("clock", <WeatherClock />);

runtime.handleSignals();

console.log("[react-awtrix] add-on started");
