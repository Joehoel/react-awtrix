import { useEffect, useState } from "react";
import { App, Rect, Text, render } from "../src/index.ts";

const host = process.env.AWTRIX_HOST;
if (host === undefined) {
  throw new Error(
    "Missing AWTRIX_HOST. Example: AWTRIX_HOST=192.168.1.45 bun run examples/clock.tsx",
  );
}

function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function ClockApp() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <App icon="66" duration={10} background="#000814" center>
      <Rect x={0} y={0} width={32} height={8} color="#000814" filled />
      <Text x={0} y={1} color="#7FDBFF">
        {formatClock(time)}
      </Text>
    </App>
  );
}

const handle = render(<ClockApp />, {
  host,
  app: "jsx_clock",
  debug: true,
});

process.on("SIGINT", async () => {
  await handle.unmount();
  process.exit(0);
});
