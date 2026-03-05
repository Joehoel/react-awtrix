import type { AwtrixPayload, AwtrixProtocol } from "./types.ts";

interface PendingWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface PushOperation {
  kind: "push";
  payload: AwtrixPayload;
}

interface DeleteOperation {
  kind: "delete";
}

type TransportOperation = PushOperation | DeleteOperation;

interface PendingEntry {
  operation: TransportOperation;
  waiters: PendingWaiter[];
}

export type TransportClient = Pick<AwtrixProtocol, "pushApp" | "deleteApp">;

export interface DeviceTransportOptions {
  client: TransportClient;
  minIntervalMs?: number;
}

function createDisposedError(): Error {
  return new Error("[react-awtrix] DeviceTransport is disposed.");
}

export class DeviceTransport {
  private readonly minIntervalMs: number;
  private readonly client: TransportClient;

  private readonly pending = new Map<string, PendingEntry>();
  private draining = false;
  private drainScheduled = false;
  private disposed = false;
  private lastSendAt: number | undefined;

  constructor(options: DeviceTransportOptions) {
    this.client = options.client;
    this.minIntervalMs = options.minIntervalMs ?? 0;
  }

  enqueuePush(appName: string, payload: AwtrixPayload): Promise<void> {
    return this.enqueue(appName, { kind: "push", payload });
  }

  enqueueDelete(appName: string): Promise<void> {
    return this.enqueue(appName, { kind: "delete" });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    const disposeError = createDisposedError();

    for (const entry of this.pending.values()) {
      for (const waiter of entry.waiters) {
        waiter.reject(disposeError);
      }
    }

    this.pending.clear();
  }

  private enqueue(appName: string, operation: TransportOperation): Promise<void> {
    if (this.disposed) {
      return Promise.reject(createDisposedError());
    }

    return new Promise((resolve, reject) => {
      const existingEntry = this.pending.get(appName);

      if (existingEntry === undefined) {
        this.pending.set(appName, {
          operation,
          waiters: [{ resolve, reject }],
        });
      } else {
        existingEntry.operation = operation;
        existingEntry.waiters.push({ resolve, reject });
      }

      this.ensureDrain();
    });
  }

  private ensureDrain(): void {
    if (this.draining || this.drainScheduled || this.disposed) {
      return;
    }

    this.drainScheduled = true;

    queueMicrotask(() => {
      this.drainScheduled = false;

      if (this.draining || this.disposed) {
        return;
      }

      this.draining = true;
      void this.drainLoop();
    });
  }

  private async drainLoop(): Promise<void> {
    while (!this.disposed) {
      const iteratorResult = this.pending.entries().next();
      if (iteratorResult.done) {
        break;
      }

      const [appName, entry] = iteratorResult.value;
      this.pending.delete(appName);

      try {
        await this.waitForMinInterval();

        if (entry.operation.kind === "push") {
          await this.client.pushApp(appName, entry.operation.payload);
        } else {
          await this.client.deleteApp(appName);
        }

        this.lastSendAt = Date.now();

        for (const waiter of entry.waiters) {
          waiter.resolve();
        }
      } catch (error) {
        for (const waiter of entry.waiters) {
          waiter.reject(error);
        }
      }
    }

    this.draining = false;

    if (!this.disposed && this.pending.size > 0) {
      this.ensureDrain();
    }
  }

  private async waitForMinInterval(): Promise<void> {
    if (this.lastSendAt === undefined || this.minIntervalMs <= 0) {
      return;
    }

    const elapsed = Date.now() - this.lastSendAt;
    const remainingDelay = this.minIntervalMs - elapsed;

    if (remainingDelay > 0) {
      await Bun.sleep(remainingDelay);
    }
  }
}
