import { render } from "../index.ts";

const host = process.env.AWTRIX_HOST;
if (host === undefined) {
  throw new Error("Missing AWTRIX_HOST. Example: AWTRIX_HOST=192.168.1.45 bun run examples/hello.tsx");
}

render(
  <app icon="87" duration={20} background="#001126" center>
    <awtrix-rect x={0} y={0} width={32} height={8} color="#001126" filled />
    <awtrix-text x={6} y={1} color="#FFFFFF">
      Hello JSX
    </awtrix-text>
    <pixel x={29} y={1} color="#FF9D00" />
    <pixel x={30} y={2} color="#FF9D00" />
  </app>,
  {
    host,
    app: "jsx_hello",
    debug: true,
  },
);
