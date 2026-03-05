# react-awtrix

Control an Awtrix 3 display with React JSX.

## Install

```bash
bun install
```

## Basic usage

```tsx
import { AwtrixApp, AwtrixRect, AwtrixText, render } from "react-awtrix";

render(
  <AwtrixApp icon="87" duration={15}>
    <AwtrixRect x={0} y={0} width={32} height={8} color="#000011" filled />
    <AwtrixText x={1} y={1} color="#FFFFFF" maxWidth={30}>Hello JSX</AwtrixText>
  </AwtrixApp>,
  { host: "192.168.1.45", app: "jsx_demo" },
);
```

The public API is component-based (`AwtrixApp`, `AwtrixPixel`, `AwtrixLine`, `AwtrixRect`, `AwtrixCircle`, `AwtrixText`, `AwtrixBitmap`).

`host`/`port` options are shorthand for HTTP transport.

## Protocols

You can pass an explicit protocol instead of `host`/`port`.

### HTTP

```tsx
import { AwtrixApp, AwtrixText, http, render } from "react-awtrix";

render(
  <AwtrixApp>
    <AwtrixText x={0} y={7} color="#FFFFFF">Hello</AwtrixText>
  </AwtrixApp>,
  {
    app: "http-demo",
    protocol: http({ host: "192.168.1.45", port: 80 }),
  },
);
```

### MQTT

```tsx
import { AwtrixApp, AwtrixText, createRuntime, mqtt } from "react-awtrix";

const runtime = createRuntime({
  protocol: mqtt({
    broker: "mqtt://192.168.1.20",
    prefix: "awtrix_abcd",
  }),
});

runtime.app(
  "mqtt-demo",
  <AwtrixApp>
    <AwtrixText x={0} y={7} color="#FFFFFF">MQTT</AwtrixText>
  </AwtrixApp>,
);
```

## Runtime events

`createRuntime()` supports protocol-backed subscriptions:

```tsx
runtime.on("button:left", (event) => {
  console.log(event.pressed, event.raw);
});
```

HTTP does not provide subscription events. Calling `runtime.on(...)` with an HTTP protocol throws a descriptive error.

## Examples

```bash
bun run example:hello
bun run example:clock
bun run example:progress
bun run example:complex
bun run example:pomodoro
bun run example:mqtt
bun run example:server
```
