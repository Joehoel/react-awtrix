# react-awtrix

A React renderer for [Awtrix 3](https://github.com/Blueforcer/awtrix3) LED matrix displays. Write JSX, see pixels.

```tsx
import { AwtrixApp, AwtrixRect, AwtrixText, render } from "react-awtrix";

render(
  <AwtrixApp icon="87" duration={15}>
    <AwtrixRect x={0} y={0} width={32} height={8} color="#0D1117" filled />
    <AwtrixText x={7} y={1} color="#58A6FF">
      Hello
    </AwtrixText>
  </AwtrixApp>,
  { host: "192.168.1.45", app: "greeting" },
);
```

State changes re-render and push to the device automatically. `useState`, `useEffect`, `useRef` and everything else from React 19 works as expected.

## Install

```bash
bun add react-awtrix
```

Peer dependencies: `react` ^19.0.0 and `typescript` ^5.

## Table of Contents

- [Quick Start](#quick-start)
- [Components](#components)
- [Rendering](#rendering)
- [Runtime](#runtime)
- [Protocols](#protocols)
- [Events](#events)
- [Examples](#examples)
- [Development](#development)

## Quick Start

Set the `AWTRIX_HOST` environment variable to your device IP, then:

```tsx
import { useState, useEffect } from "react";
import { AwtrixApp, AwtrixRect, AwtrixText, render } from "react-awtrix";

function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <AwtrixApp icon="66" duration={10}>
      <AwtrixRect x={0} y={0} width={32} height={8} color="#000814" filled />
      <AwtrixText x={7} y={1} color="#E0E0E0">
        {time}
      </AwtrixText>
    </AwtrixApp>
  );
}

const handle = render(<Clock />, {
  host: process.env.AWTRIX_HOST!,
  app: "clock",
});

process.on("SIGINT", () => handle.unmount());
```

## Components

All drawing happens on a 32x8 pixel matrix (configurable). Coordinates start at (0, 0) in the top-left corner.

### `<AwtrixApp>`

Top-level container that sets app-level options. Every render tree should have one.

```tsx
<AwtrixApp
  icon="87"
  duration={15}
  background="#0D1117"
  effect="Pulse"
  effectSettings={{ speed: 3, palette: "Rainbow" }}
  progress={75}
  progressC="#2ECC71"
  progressBC="#1A1F26"
  pushIcon={1}
  noScroll
  center
>
  {children}
</AwtrixApp>
```

| Prop             | Type          | Description                                                                                       |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `icon`           | `string`      | Icon ID from the [Awtrix icon database](https://developer.blueforcer.de/icon-database/)           |
| `duration`       | `number`      | Display duration in seconds                                                                       |
| `lifetime`       | `number`      | Lifetime in seconds before the app is removed                                                     |
| `lifetimeMode`   | `0 \| 1`      | `0` = remove after lifetime, `1` = mark stale                                                     |
| `text`           | `string`      | Native Awtrix text (separate from draw commands)                                                  |
| `textCase`       | `0 \| 1 \| 2` | `0` = global, `1` = uppercase, `2` = as-is                                                        |
| `topText`        | `boolean`     | Draw text at the top of the display                                                               |
| `textOffset`     | `number`      | Text X offset                                                                                     |
| `center`         | `boolean`     | Center text horizontally                                                                          |
| `noScroll`       | `boolean`     | Disable text scrolling                                                                            |
| `scrollSpeed`    | `number`      | Scroll speed percentage                                                                           |
| `background`     | `Color`       | Background color                                                                                  |
| `rainbow`        | `boolean`     | Rainbow text effect                                                                               |
| `effect`         | `string`      | Background effect name                                                                            |
| `effectSettings` | `object`      | Effect config: `{ speed?, palette?, blend? }`                                                     |
| `overlay`        | `string`      | Weather overlay: `"clear"`, `"snow"`, `"rain"`, `"drizzle"`, `"storm"`, `"thunder"`, or `"frost"` |
| `progress`       | `number`      | Progress bar value (0--100)                                                                       |
| `progressC`      | `Color`       | Progress bar color                                                                                |
| `progressBC`     | `Color`       | Progress bar background color                                                                     |
| `bar`            | `number[]`    | Bar chart data                                                                                    |
| `line`           | `number[]`    | Line chart data                                                                                   |
| `pushIcon`       | `0 \| 1 \| 2` | `0` = static, `1` = push once, `2` = push with animation                                          |
| `repeat`         | `number`      | Repeat count                                                                                      |
| `save`           | `boolean`     | Save to flash                                                                                     |

### Drawing Primitives

All drawing components accept colors as hex strings (`"#FF0000"`) or RGB tuples (`[255, 0, 0]`).

#### `<AwtrixText>`

```tsx
<AwtrixText x={0} y={1} color="#FFFFFF" maxWidth={24}>
  Score: {score}
</AwtrixText>
```

| Prop        | Type               | Description                                           |
| ----------- | ------------------ | ----------------------------------------------------- |
| `x`         | `number`           | X position                                            |
| `y`         | `number`           | Y position                                            |
| `color`     | `Color`            | Text color                                            |
| `maxWidth`  | `number`           | Maximum width in pixels (clips text)                  |
| `charWidth` | `number`           | Character width for clipping calculation (default: 4) |
| `children`  | `string \| number` | Text content                                          |

#### `<AwtrixRect>`

```tsx
<AwtrixRect x={0} y={0} width={32} height={8} color="#1A1A2E" filled />
```

| Prop              | Type      | Description        |
| ----------------- | --------- | ------------------ |
| `x`, `y`          | `number`  | Top-left corner    |
| `width`, `height` | `number`  | Dimensions         |
| `color`           | `Color`   | Stroke/fill color  |
| `filled`          | `boolean` | Fill the rectangle |

#### `<AwtrixPixel>`

```tsx
<AwtrixPixel x={15} y={3} color="#FF6B6B" />
```

| Prop     | Type     | Description |
| -------- | -------- | ----------- |
| `x`, `y` | `number` | Position    |
| `color`  | `Color`  | Pixel color |

#### `<AwtrixLine>`

```tsx
<AwtrixLine x1={0} y1={0} x2={31} y2={7} color="#4ECDC4" />
```

| Prop       | Type     | Description |
| ---------- | -------- | ----------- |
| `x1`, `y1` | `number` | Start point |
| `x2`, `y2` | `number` | End point   |
| `color`    | `Color`  | Line color  |

#### `<AwtrixCircle>`

```tsx
<AwtrixCircle x={16} y={4} radius={3} color="#FFE66D" filled />
```

| Prop     | Type      | Description       |
| -------- | --------- | ----------------- |
| `x`, `y` | `number`  | Center            |
| `radius` | `number`  | Radius            |
| `color`  | `Color`   | Stroke/fill color |
| `filled` | `boolean` | Fill the circle   |

#### `<AwtrixBitmap>`

```tsx
<AwtrixBitmap x={0} y={0} width={2} height={2} data={[0xff0000, 0x00ff00, 0x0000ff, 0xffff00]} />
```

| Prop              | Type       | Description                        |
| ----------------- | ---------- | ---------------------------------- |
| `x`, `y`          | `number`   | Top-left corner                    |
| `width`, `height` | `number`   | Dimensions                         |
| `data`            | `number[]` | Pixel data (row-major, 24-bit RGB) |

## Rendering

### `render()` -- Persistent App

Renders a React tree as a named custom app. Re-renders push updates to the device automatically.

```tsx
import { render } from "react-awtrix";

const handle = render(<MyApp />, {
  host: "192.168.1.45",
  app: "my_app",
  debounce: 50, // ms between device updates (default: 50)
  debug: false, // log serialized payloads
  width: 32, // matrix width (default: 32)
  height: 8, // matrix height (default: 8)
});

// Later:
await handle.unmount(); // detach tree + delete app from device
```

### `notify()` -- One-Shot Notification

Renders a React tree as a notification. Resolves when sent.

```tsx
import { notify } from "react-awtrix";

await notify(
  <AwtrixApp icon="alert">
    <AwtrixText x={7} y={1} color="#FF0000">
      ALERT
    </AwtrixText>
  </AwtrixApp>,
  {
    host: "192.168.1.45",
    hold: true, // keep notification until dismissed
    sound: "alarm", // play a sound
    stack: true, // stack with other notifications
    wakeup: true, // wake the display
  },
);
```

## Runtime

For applications that manage multiple apps on one device, `createRuntime()` provides a shared transport with automatic cleanup.

```tsx
import { AwtrixApp, AwtrixText, createRuntime } from "react-awtrix";

const runtime = createRuntime({
  host: process.env.AWTRIX_HOST!,
  debounce: 50,
});

runtime.app(
  "clock",
  <AwtrixApp icon="66">
    <AwtrixText x={7} y={1} color="#E0E0E0">
      12:00
    </AwtrixText>
  </AwtrixApp>,
);

runtime.app(
  "status",
  <AwtrixApp>
    <AwtrixText x={1} y={1} color="#2ECC71">
      OK
    </AwtrixText>
  </AwtrixApp>,
);

// Update an app by calling runtime.app() again with the same name
// Remove an app:
await runtime.remove("status");

// Clean shutdown (unmounts all apps, deletes from device):
await runtime.dispose();

// Or handle SIGINT/SIGTERM automatically:
runtime.handleSignals();
```

### Hot Module Replacement

The runtime supports `bun --hot` for live reloading during development. Apps that are no longer registered after a module re-evaluation are automatically removed from the device.

```tsx
const runtime = createRuntime({
  host: process.env.AWTRIX_HOST!,
  hmr: true,
});

runtime.app("clock", <ClockApp />);
runtime.app("weather", <WeatherApp />);

runtime.handleSignals();
```

```bash
bun --hot app.tsx
```

Edit the file, save, and the display updates instantly. Remove an `app()` call, and that app disappears from the device.

## Protocols

The transport layer is pluggable. `host`/`port` options default to HTTP, or you can pass a protocol explicitly.

### HTTP

```tsx
import { http, render } from "react-awtrix";

render(<MyApp />, {
  app: "demo",
  protocol: http({ host: "192.168.1.45", port: 80 }),
});
```

Direct HTTP to the Awtrix API. Simple, no broker needed. Does not support event subscriptions.

### MQTT

```tsx
import { mqtt, createRuntime } from "react-awtrix";

const runtime = createRuntime({
  protocol: mqtt({
    broker: "mqtt://broker.hivemq.com:1883",
    prefix: "awtrix_abcdef",
  }),
});
```

Communicates via MQTT topics. Supports event subscriptions (button presses, app changes, device stats). Connections are pooled and reference-counted when multiple protocol instances share a broker.

For local development, you can run an in-process MQTT broker -- see `examples/mqtt.tsx`.

## Events

Event subscriptions are available on runtimes using the MQTT protocol:

```tsx
runtime.on("button:left", ({ pressed }) => {
  console.log("Left button", pressed ? "pressed" : "released");
});

runtime.on("button:select", ({ pressed }) => {
  /* ... */
});
runtime.on("button:right", ({ pressed }) => {
  /* ... */
});
runtime.on("currentApp", ({ name }) => {
  /* ... */
});
runtime.on("stats", ({ value }) => {
  /* ... */
});
runtime.on("device", ({ online }) => {
  /* ... */
});
```

HTTP does not support events. Calling `runtime.on()` with an HTTP protocol throws.

## Examples

All examples read `AWTRIX_HOST` from the environment:

```bash
export AWTRIX_HOST=192.168.1.45
```

| Example  | Command                    | Description                                             |
| -------- | -------------------------- | ------------------------------------------------------- |
| Hello    | `bun run example:hello`    | Static text with background                             |
| Clock    | `bun run example:clock`    | Live clock with `useState` / `useEffect`                |
| Progress | `bun run example:progress` | Animated progress bar                                   |
| Complex  | `bun run example:complex`  | All drawing primitives, animated charts, bitmap spinner |
| Pomodoro | `bun run example:pomodoro` | Pomodoro timer with phase management                    |
| MQTT     | `bun run example:mqtt`     | MQTT transport with optional local broker               |
| Server   | `bun run example:server`   | Multi-app runtime with HMR (`bun --hot`)                |

## Development

```bash
bun install          # install dependencies
bun test             # run tests (58 tests)
bun run typecheck    # type check
bun run lint         # lint with oxlint
bun run format       # format with oxfmt
bun run knip         # detect unused code
bun run check        # all of the above
bun run build        # build with tsdown
```

## Architecture

```
JSX Components
    |
    v
react-reconciler (Concurrent Mode, React 19)
    |
    v
Instance Tree (AwtrixInstance nodes)
    |
    v
Serializer (tree -> Awtrix API payload + draw commands)
    |
    v
DeviceTransport (queue, coalescing, rate limiting)
    |
    v
Protocol (HTTP or MQTT) -> Awtrix 3 device
```

The reconciler maintains a virtual tree of display elements. On every React commit, the tree is serialized into an [Awtrix custom app payload](https://blueforcer.github.io/awtrix3/#/api?id=custom-apps-and-notifications) containing draw commands (`dp`, `dl`, `dr`, `df`, `dc`, `dt`, `db`). The transport layer coalesces rapid updates (latest-write-wins per app name) and pushes them to the device over the configured protocol.

## License

MIT
