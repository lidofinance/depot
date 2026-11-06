import Mocha from "mocha";
import { randomUUID } from "node:crypto";

/** Each run imports the suites anew: a cached ESM module would not register its tests a second time */
export async function loadMochaFilesFresh(mocha: Mocha): Promise<void> {
  // Mocha supports esmDecorator, but its type declarations omit the options argument.
  const loadFilesAsync: (options: { esmDecorator: (url: URL) => URL }) => Promise<void> =
    mocha.loadFilesAsync.bind(mocha);
  await loadFilesAsync({
    esmDecorator: (url) => {
      url.searchParams.set("run", randomUUID());
      return url;
    },
  });
}
