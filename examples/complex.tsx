import { useEffect, useMemo, useState } from "react";
import {
  AwtrixApp,
  AwtrixBitmap,
  AwtrixCircle,
  AwtrixLine,
  AwtrixPixel,
  AwtrixRect,
  AwtrixText,
  render,
} from "../src/index.ts";

const host = process.env.AWTRIX_HOST;
if (host === undefined) {
  throw new Error(
    "Missing AWTRIX_HOST. Example: AWTRIX_HOST=192.168.1.45 bun run examples/complex.tsx",
  );
}

function nextSeriesFrame(current: number[], tick: number): number[] {
  const wave = Math.sin(tick / 2.2);
  const nextHeight = Math.max(1, Math.min(6, Math.round(((wave + 1) / 2) * 5) + 1));
  return [...current.slice(1), nextHeight];
}

function spinnerBitmap(tick: number): number[] {
  const white = 0xffffff;

  const frame = tick % 4;
  if (frame === 0) {
    return [white, 0, 0, white];
  }
  if (frame === 1) {
    return [0, white, white, 0];
  }
  if (frame === 2) {
    return [0, white, white, 0];
  }

  return [white, 0, 0, white];
}

function ComplexApp() {
  const [tick, setTick] = useState(0);
  const [series, setSeries] = useState([2, 3, 4, 3, 2, 4, 5, 3, 2, 1]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => {
        const nextTick = value + 1;
        setSeries((current) => nextSeriesFrame(current, nextTick));
        return nextTick;
      });
    }, 320);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const progress = (tick * 7) % 101;
  const alert = tick % 14 >= 10;
  const spinner = useMemo(() => spinnerBitmap(tick), [tick]);
  const statusText = alert ? "ALERT" : "NOMINAL";
  const accent = alert ? "#FF4136" : "#2ECC71";

  return (
    <AwtrixApp
      duration={8}
      background="#06080F"
      overlay={alert ? "storm" : "rain"}
      progress={progress}
      progressC={accent}
      progressBC="#1F2933"
      noScroll
      center={false}
    >
      <AwtrixRect x={0} y={0} width={32} height={8} color="#06080F" filled />
      <AwtrixLine x1={0} y1={7} x2={31} y2={7} color="#1F2933" />

      {series.map((height, barIndex) => (
        <AwtrixRect
          // oxlint-disable-next-line react/no-array-index-key -- position-dependent bars where index is the identity
          key={`bar-x${barIndex * 2}`}
          x={barIndex * 2}
          y={6 - height}
          width={1}
          height={height}
          color={barIndex % 2 === 0 ? "#3BAA6F" : "#2F8F5B"}
          filled
        />
      ))}

      <AwtrixCircle x={29} y={1} radius={1} color={accent} filled />
      <AwtrixBitmap x={24} y={0} width={2} height={2} data={spinner} />
      <AwtrixPixel x={(tick * 2) % 32} y={6} color={accent} />

      <AwtrixText x={0} y={0} color="#FFFFFF" maxWidth={20} charWidth={4}>
        {`CPU ${progress}%`}
      </AwtrixText>

      <AwtrixText x={0} y={3} color="#7FDBFF" maxWidth={20} charWidth={4}>
        {statusText}
      </AwtrixText>
    </AwtrixApp>
  );
}

const handle = render(<ComplexApp />, {
  host,
  app: "jsx_complex",
  debug: true,
});

process.on("SIGINT", async () => {
  await handle.unmount();
  process.exit(0);
});
