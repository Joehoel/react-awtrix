import { useEffect, useState } from "react";
import { render } from "../index.ts";

const host = process.env.AWTRIX_HOST;
if (host === undefined) {
  throw new Error("Missing AWTRIX_HOST. Example: AWTRIX_HOST=192.168.1.45 bun run examples/progress.tsx");
}

function ProgressApp() {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setValue((current) => (current >= 100 ? 0 : current + 5));
    }, 400);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <app
      icon="1736"
      duration={8}
      background="#040A10"
      progress={value}
      progressC="#2ECC71"
      progressBC="#1A1F26"
    >
      <awtrix-rect x={0} y={0} width={32} height={8} color="#040A10" filled />
      <awtrix-text x={2} y={1} color="#FFFFFF">
        {value}%
      </awtrix-text>
    </app>
  );
}

const handle = render(<ProgressApp />, {
  host,
  app: "jsx_progress",
  debug: true,
});

process.on("SIGINT", async () => {
  await handle.unmount();
  process.exit(0);
});
