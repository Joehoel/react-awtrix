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

## Examples

```bash
bun run example:hello
bun run example:clock
bun run example:progress
bun run example:complex
bun run example:pomodoro
```
