import { HardhatPluginError } from "hardhat/plugins";

/** Expected failure: Hardhat prints a plugin error as one line without a stack trace */
export class KnownError extends HardhatPluginError {
  constructor(message: string, cause?: Error) {
    super("depot", message, cause);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
