import type { Container } from "dockerode";

const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 } as const;

// only containers created by this process may be stopped on a shutdown signal
const containers = new Map<string, Container>();
let handlersInstalled = false;
let shuttingDown = false;

export function track(container: Container): void {
  containers.set(container.id, container);
  installSignalHandlers();
}

export function untrack(container: Container): void {
  containers.delete(container.id);
}

// loops because a create already in flight can register a container while earlier ones are stopping
async function stopAll(): Promise<void> {
  while (containers.size > 0) {
    const batch = [...containers.values()];
    containers.clear();
    await Promise.all(batch.map(stopOrRemove));
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
      void stopAll().finally(() => process.exit(exitCode));
    });
  }
}
