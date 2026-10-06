import { createSpinner } from "nanospinner";

export function createTimedSpinner(text: string) {
  const spinner = createSpinner(text).start();
  const startTime = Date.now();

  const timer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    spinner.update({ text: `${text} ${elapsed}s` });
  }, 1000);

  return {
    succeed: (message: string) => {
      clearInterval(timer);
      const total = Math.floor((Date.now() - startTime) / 1000);
      spinner.success({ text: `${message} (${total}s)` });
    },
    error: (message: string) => {
      clearInterval(timer);
      spinner.error({ text: message });
    },
    stop: () => {
      clearInterval(timer);
      spinner.stop();
    },
  };
}
