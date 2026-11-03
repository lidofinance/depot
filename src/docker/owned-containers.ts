import type { Container } from "dockerode";

const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 } as const;

/** Containers created by this process: only these may be stopped on a shutdown signal */
export class OwnedContainers {
  readonly #containers = new Map<string, Container>();
  #pendingCreates = 0;
  #wakeStopper: (() => void) | undefined;

  /** Call before `docker.run`; the returned callback marks the create as finished and is safe to call twice */
  beginCreate(): () => void {
    this.#pendingCreates += 1;
    let settled = false;
    return () => {
      if (settled) {
        return;
      }
      settled = true;
      this.#pendingCreates -= 1;
      this.#wake();
    };
  }

  track(container: Container): void {
    this.#containers.set(container.id, container);
    this.#wake();
  }

  untrack(container: Container): void {
    this.#containers.delete(container.id);
  }

  // a create in flight reports its container only later, so wait for it instead of exiting with it running
  async stopAll(): Promise<void> {
    while (this.#containers.size > 0 || this.#pendingCreates > 0) {
      if (this.#containers.size === 0) {
        await new Promise<void>((resolve) => {
          this.#wakeStopper = resolve;
        });
        continue;
      }
      const batch = [...this.#containers.values()];
      this.#containers.clear();
      await Promise.all(batch.map(stopOrRemove));
    }
  }

  #wake(): void {
    const resolve = this.#wakeStopper;
    this.#wakeStopper = undefined;
    resolve?.();
  }
}

// a container that never started cannot be stopped and AutoRemove skips it
async function stopOrRemove(container: Container): Promise<void> {
  try {
    await container.stop();
  } catch {
    await container.remove({ force: true }).catch((error: unknown) => {
      console.error(`Failed to stop container ${container.id}: ${String(error)}`);
    });
  }
}

const registry = new OwnedContainers();
let handlersInstalled = false;
let shuttingDown = false;

// handlers go in before the first create, so a signal during it still stops the container
export function beginCreate(): () => void {
  installSignalHandlers();
  return registry.beginCreate();
}

export function track(container: Container): void {
  registry.track(container);
}

export function untrack(container: Container): void {
  registry.untrack(container);
}

function installSignalHandlers(): void {
  if (handlersInstalled) {
    return;
  }
  handlersInstalled = true;
  for (const [signal, exitCode] of Object.entries(SIGNAL_EXIT_CODES)) {
    process.on(signal, () => {
      if (shuttingDown) {
        process.exit(exitCode);
      }
      shuttingDown = true;
      console.log(`\n${signal}: stopping containers started by this run, repeat to exit immediately`);
      void registry.stopAll().finally(() => process.exit(exitCode));
    });
  }
}
