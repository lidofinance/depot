export function runHardhatTask(
  hre: unknown,
  taskName: string | string[],
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const maybeHre = hre as Record<string, unknown>;
  const tasks = maybeHre.tasks as Record<string, unknown> | undefined;

  if (tasks?.getTask) {
    return (tasks.getTask as (name: string | string[]) => { run: (args: Record<string, unknown>) => Promise<unknown> })(
      taskName,
    ).run(args);
  }

  throw new Error(`Hardhat task runner is not available on HRE`);
}
