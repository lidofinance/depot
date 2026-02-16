export async function runHardhatTask(
  hre: unknown,
  taskName: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const maybeHre = hre as any;

  if (maybeHre?.tasks?.getTask) {
    return maybeHre.tasks.getTask(taskName).run(args);
  }

  if (typeof maybeHre?.run === "function") {
    return maybeHre.run(taskName, args);
  }

  throw new Error(`Hardhat task runner is not available on HRE`);
}

