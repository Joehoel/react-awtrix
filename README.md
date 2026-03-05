# react-awtrix

Control an Awtrix 3 display with React JSX.

## Install

```bash
bun install
```

## Basic usage

```tsx
import { render } from "react-awtrix";

render(
  <app icon="87" duration={15}>
    <awtrix-rect x={0} y={0} width={32} height={8} color="#000011" filled />
    <awtrix-text x={1} y={1} color="#FFFFFF">Hello JSX</awtrix-text>
  </app>,
  { host: "192.168.1.45", app: "jsx_demo" },
);
```

Supported JSX elements: `app`, `pixel`, `awtrix-line`, `awtrix-rect`, `awtrix-circle`, `awtrix-text`, `awtrix-bitmap`.

## Examples

```bash
bun run example:hello
bun run example:clock
bun run example:progress
```
