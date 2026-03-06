import { useEffect, useState } from "react";
import { AwtrixApp, AwtrixPixel, AwtrixRect, AwtrixText, render } from "../src/index.ts";

const host = process.env.AWTRIX_HOST;
if (host === undefined) {
  throw new Error(
    "Missing AWTRIX_HOST. Example: AWTRIX_HOST=192.168.1.45 bun run examples/pomodoro.tsx",
  );
}

type Phase = "focus" | "break";

interface PomodoroState {
  phase: Phase;
  remainingSeconds: number;
  cycle: number;
}

const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

function formatDuration(secondsTotal: number): string {
  const minutes = Math.floor(secondsTotal / 60);
  const seconds = secondsTotal % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getPhaseSeconds(phase: Phase): number {
  return phase === "focus" ? FOCUS_SECONDS : BREAK_SECONDS;
}

function PomodoroApp() {
  const [state, setState] = useState<PomodoroState>({
    phase: "focus",
    remainingSeconds: FOCUS_SECONDS,
    cycle: 1,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setState((current) => {
        if (current.remainingSeconds > 1) {
          return {
            ...current,
            remainingSeconds: current.remainingSeconds - 1,
          };
        }

        if (current.phase === "focus") {
          return {
            ...current,
            phase: "break",
            remainingSeconds: BREAK_SECONDS,
          };
        }

        return {
          phase: "focus",
          remainingSeconds: FOCUS_SECONDS,
          cycle: current.cycle + 1,
        };
      });
    }, 1_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const phaseTotal = getPhaseSeconds(state.phase);
  const elapsed = phaseTotal - state.remainingSeconds;
  const progress = Math.round((elapsed / phaseTotal) * 100);

  const cycleDigit = state.cycle % 10;
  const phaseLabel = state.phase === "focus" ? "F" : "B";
  const phaseColor = state.phase === "focus" ? "#2ECC71" : "#3BA7FF";
  const line = `${phaseLabel}${cycleDigit} ${formatDuration(state.remainingSeconds)}`;

  return (
    <AwtrixApp
      icon="66"
      duration={100}
      background="#071019"
      center={false}
      noScroll
      progress={progress}
      progressC={phaseColor}
      progressBC="#223140"
    >
      <AwtrixRect x={0} y={0} width={32} height={8} color="#071019" filled />
      <AwtrixPixel x={31} y={0} color={phaseColor} />
      <AwtrixText x={0} y={1} color="#FFFFFF" maxWidth={32} charWidth={4}>
        {line}
      </AwtrixText>
    </AwtrixApp>
  );
}

const handle = render(<PomodoroApp />, {
  host,
  app: "jsx_pomodoro",
  debug: true,
});

process.on("SIGINT", async () => {
  await handle.unmount();
  process.exit(0);
});
