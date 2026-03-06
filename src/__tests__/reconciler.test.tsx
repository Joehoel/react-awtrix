import { afterEach, describe, expect, test } from "bun:test";
import { useEffect, useMemo, useState } from "react";
import {
  AwtrixApp,
  AwtrixBitmap,
  AwtrixCircle,
  AwtrixLine,
  AwtrixPixel,
  AwtrixRect,
  AwtrixText,
} from "../components.tsx";
import { createRenderTestContext, type RenderTestContext } from "../test/render-test.ts";

describe("reconciler integration", () => {
  let context: RenderTestContext | undefined;

  afterEach(async () => {
    if (context !== undefined) {
      await context.teardown();
      context = undefined;
    }
  });

  test("renders initial tree and pushes payload", async () => {
    context = createRenderTestContext({ app: "initial-render", debounce: 0, timeoutMs: 1500 });

    context.renderApp(
      <AwtrixApp>
        <AwtrixPixel x={2} y={3} color="#00FF00" />
      </AwtrixApp>,
    );

    const payload = await context.waitForAppPayload();
    expect(payload.draw).toEqual([{ dp: [2, 3, "#00FF00"] }]);
  });

  test("pushes updated payload after state change", async () => {
    context = createRenderTestContext({ app: "state-update", debounce: 0, timeoutMs: 2000 });

    function DelayedUpdate() {
      const [x, setX] = useState(0);

      useEffect(() => {
        const timer = setTimeout(() => {
          setX(6);
        }, 25);

        return () => {
          clearTimeout(timer);
        };
      }, []);

      return (
        <AwtrixApp>
          <AwtrixPixel x={x} y={0} color="red" />
        </AwtrixApp>
      );
    }

    context.renderApp(<DelayedUpdate />);

    await context.device.waitForCustomRequestCount(2, 2000);
    const payload = await context.waitForAppPayload();

    expect(payload.draw).toEqual([{ dp: [6, 0, "red"] }]);
  });

  test("unmount deletes app from device", async () => {
    context = createRenderTestContext({ app: "unmount-app", debounce: 0, timeoutMs: 1500 });

    const handle = context.renderApp(
      <AwtrixApp>
        <AwtrixText x={0} y={7} color="#FFFFFF">
          Mounted
        </AwtrixText>
      </AwtrixApp>,
    );

    await context.waitForAppPayload();

    await handle.unmount();
    await context.waitForAppDeletion();

    const requests = context.device.getCustomRequests();
    expect(requests.at(-1)).toEqual({
      name: "unmount-app",
      deleted: true,
    });
  });

  test("debounce coalesces rapid commits into one flush", async () => {
    context = createRenderTestContext({ app: "debounce-app", debounce: 40, timeoutMs: 2500 });

    function RapidUpdates() {
      const [value, setValue] = useState(0);

      useEffect(() => {
        const timerA = setTimeout(() => setValue(1), 0);
        const timerB = setTimeout(() => setValue(2), 5);
        const timerC = setTimeout(() => setValue(3), 10);

        return () => {
          clearTimeout(timerA);
          clearTimeout(timerB);
          clearTimeout(timerC);
        };
      }, []);

      return (
        <AwtrixApp>
          <AwtrixText x={0} y={7} color="#FFFFFF">
            {value}
          </AwtrixText>
        </AwtrixApp>
      );
    }

    context.renderApp(<RapidUpdates />);

    await context.device.waitForCustomRequestCount(1, 2000);
    await Bun.sleep(120);

    expect(context.device.getCustomRequestCount()).toBe(1);

    const payload = await context.waitForAppPayload();
    expect(payload.draw).toEqual([{ dt: [0, 7, "3", "#FFFFFF"] }]);
  });

  test("flushes each periodic tick when debounce is disabled", async () => {
    context = createRenderTestContext({ app: "periodic-ticks", debounce: 0, timeoutMs: 2500 });

    function TickClock() {
      const [tick, setTick] = useState(0);

      useEffect(() => {
        const first = setTimeout(() => setTick(1), 20);
        const second = setTimeout(() => setTick(2), 40);

        return () => {
          clearTimeout(first);
          clearTimeout(second);
        };
      }, []);

      return (
        <AwtrixApp>
          <AwtrixText x={0} y={7} color="#FFFFFF">
            {`00:00:0${tick}`}
          </AwtrixText>
        </AwtrixApp>
      );
    }

    context.renderApp(<TickClock />);

    await context.device.waitForCustomRequestCount(3, 2000);

    const requestCount = context.device
      .getCustomRequests()
      .filter((request) => !request.deleted).length;
    expect(requestCount).toBeGreaterThanOrEqual(3);

    const payload = await context.waitForAppPayload();
    expect(payload.draw).toEqual([{ dt: [0, 7, "00:00:02", "#FFFFFF"] }]);
  });

  test("renders a complex component with nested dynamic shapes", async () => {
    context = createRenderTestContext({ app: "complex-component", debounce: 0, timeoutMs: 3000 });

    function ComplexScene() {
      const [frame, setFrame] = useState(0);
      const [mode, setMode] = useState<"boot" | "live">("boot");

      const bars = useMemo(() => {
        return [0, 1, 2, 3, 4].map((index) => ((frame + index * 2) % 5) + 1);
      }, [frame]);

      useEffect(() => {
        const first = setTimeout(() => setFrame(1), 10);
        const second = setTimeout(() => setMode("live"), 20);
        const third = setTimeout(() => setFrame(2), 30);

        return () => {
          clearTimeout(first);
          clearTimeout(second);
          clearTimeout(third);
        };
      }, []);

      const pulseColor = frame % 2 === 0 ? "#00FFFF" : "#FF00FF";
      const iconData = frame % 2 === 0 ? [0, 16777215, 16777215, 0] : [16777215, 0, 0, 16777215];
      const headline = mode === "boot" ? "BOOT" : `LIVE-${frame}`;

      return (
        <AwtrixApp duration={8} background="#020611" overlay="rain">
          <AwtrixRect x={0} y={0} width={32} height={8} color="#020611" filled />
          <AwtrixLine x1={0} y1={0} x2={31} y2={0} color="#1E90FF" />
          <AwtrixCircle x={23} y={3} radius={2} color="#FFAA00" filled={mode === "live"} />

          {bars.map((height, barIndex) => (
            <AwtrixRect
              // oxlint-disable-next-line react/no-array-index-key -- position-dependent bars where index is the identity
              key={`bar-x${barIndex * 2}`}
              x={barIndex * 2}
              y={7 - height}
              width={1}
              height={height}
              color={barIndex % 2 === 0 ? "#2ECC71" : "#27AE60"}
              filled
            />
          ))}

          <AwtrixPixel x={(frame * 3) % 32} y={7} color={pulseColor} />
          <AwtrixBitmap x={26} y={0} width={2} height={2} data={iconData} />
          <AwtrixText x={10} y={0} color="#FFFFFF" maxWidth={20} charWidth={4}>
            {headline}
          </AwtrixText>
        </AwtrixApp>
      );
    }

    context.renderApp(<ComplexScene />);

    await context.device.waitForCustomRequestCount(4, 2000);

    const payload = await context.waitForAppPayload();
    expect(payload).toEqual({
      duration: 8,
      background: "#020611",
      overlay: "rain",
      draw: [
        { df: [0, 0, 32, 8, "#020611"] },
        { dl: [0, 0, 31, 0, "#1E90FF"] },
        { dfc: [23, 3, 2, "#FFAA00"] },
        { df: [0, 4, 1, 3, "#2ECC71"] },
        { df: [2, 2, 1, 5, "#27AE60"] },
        { df: [4, 5, 1, 2, "#2ECC71"] },
        { df: [6, 3, 1, 4, "#27AE60"] },
        { df: [8, 6, 1, 1, "#2ECC71"] },
        { dp: [6, 7, "#00FFFF"] },
        { db: [26, 0, 2, 2, [0, 16777215, 16777215, 0]] },
        { dt: [10, 0, "LIVE-", "#FFFFFF"] },
      ],
    });
  });
});
