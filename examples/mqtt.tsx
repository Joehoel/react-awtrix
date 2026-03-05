import { AwtrixApp, AwtrixText, createRuntime, mqtt } from "../src/index.ts";

const broker = process.env.AWTRIX_MQTT_BROKER;
const prefix = process.env.AWTRIX_MQTT_PREFIX;

if (broker === undefined || prefix === undefined) {
  throw new Error(
    "[react-awtrix] Missing AWTRIX_MQTT_BROKER or AWTRIX_MQTT_PREFIX in environment.",
  );
}

const runtime = createRuntime({
  protocol: mqtt({ broker, prefix }),
  debounce: 50,
});

runtime.app(
  "mqtt-hello",
  <AwtrixApp>
    <AwtrixText x={0} y={7} color="#FFFFFF">
      MQTT
    </AwtrixText>
  </AwtrixApp>,
);

runtime.handleSignals();
console.log("[react-awtrix] Running MQTT example. Press Ctrl+C to exit.");
