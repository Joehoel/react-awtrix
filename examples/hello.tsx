import { App, Rect, Text, render } from "../src/index.ts";

const host = process.env.AWTRIX_HOST;
if (host === undefined) {
  throw new Error(
    "Missing AWTRIX_HOST. Example: AWTRIX_HOST=192.168.1.45 bun run examples/hello.tsx",
  );
}

render(
  <App icon="87" duration={20} background="#001126" center>
    <Rect x={0} y={0} width={32} height={8} color="#001126" filled />
    <Text x={1} y={1} color="#FFFFFF" maxWidth={30}>
      Hello
    </Text>
  </App>,
  {
    host,
    app: "jsx_hello",
    debug: true,
  },
);
