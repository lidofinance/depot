import { task } from "hardhat/config";

type TaskBuilder = ReturnType<typeof task>;

/** `task()` that also collects the builder, so the config can register every task of a module */
export function createTaskRegistry() {
  const builders: TaskBuilder[] = [];
  const defineTask = (...args: Parameters<typeof task>) => {
    const builder = task(...args);
    builders.push(builder);
    return builder;
  };
  return { builders, defineTask };
}

/** Hardhat 3 takes task actions as lazily imported modules */
export function lazy<Action>(action: Action) {
  return () => Promise.resolve({ default: action });
}
