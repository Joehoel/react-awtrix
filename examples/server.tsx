import { useEffect, useState } from "react";
import { AwtrixApp, AwtrixPixel, AwtrixRect, AwtrixText, createRuntime } from "../src/index.ts";

const host = process.env.AWTRIX_HOST;
if (host === undefined) {
  throw new Error(
    "Missing AWTRIX_HOST. Example: AWTRIX_HOST=192.168.1.45 bun --hot examples/server.tsx",
  );
}

function formatClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function ClockApp() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <AwtrixApp icon="66" duration={10} background="#06141F" center>
      <AwtrixRect x={0} y={0} width={32} height={8} color="#06141F" filled />
      <AwtrixText x={0} y={1} color="#8FE3FF">
        {formatClock(now)}
      </AwtrixText>
    </AwtrixApp>
  );
}

function PulseApp() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => (value + 1) % 32);
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <AwtrixApp icon="87" duration={8} background="#110A1F" noScroll>
      <AwtrixRect x={0} y={0} width={32} height={8} color="#110A1F" filled />
      <AwtrixRect x={0} y={6} width={32} height={1} color="#2F2447" filled />
      <AwtrixRect x={0} y={6} width={tick + 1} height={1} color="#FF7B54" filled />
      <AwtrixPixel x={tick} y={5} color="#FFD166" />
      <AwtrixText x={0} y={0} color="#FFFFFF">
        PULSE!
      </AwtrixText>
    </AwtrixApp>
  );
}

function StatusApp() {
  return (
    <AwtrixApp icon="182" duration={12} background="#04180E" noScroll>
      <AwtrixRect x={0} y={0} width={32} height={8} color="#04180E" filled />
      <AwtrixText x={0} y={0} color="#9CFFB6">
        SERVER
      </AwtrixText>
      <AwtrixText x={0} y={4} color="#FFFFFF">
        MULTI APP
      </AwtrixText>
    </AwtrixApp>
  );
}

const runtime = createRuntime({
  host,
  debounce: 50,
  debug: true,
  hmr: true,
});

runtime.app("jsx_clock", <ClockApp />);
runtime.app("jsx_pulse", <PulseApp />);
runtime.app("jsx_status", <StatusApp />);

runtime.handleSignals();
