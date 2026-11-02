import { HardhatPluginError } from "hardhat/plugins";
import { NewTaskDefinition } from "hardhat/types/tasks";
import { BaseError, ContractFunctionRevertedError, ExecutionRevertedError } from "viem";

import { KnownError } from "../common/errors";
import { redactError, redactUrls } from "../common/redact";

function isRevertError(error: unknown): error is ContractFunctionRevertedError | ExecutionRevertedError {
  return error instanceof ContractFunctionRevertedError || error instanceof ExecutionRevertedError;
}

// Hardhat's own errors print a private `formattedMessage` that in-place redaction can't reach
function hasUnredactedFormattedMessage(error: Error): boolean {
  const formattedMessage: unknown = Reflect.get(error, "formattedMessage");
  return typeof formattedMessage === "string" && redactUrls(formattedMessage) !== formattedMessage;
}

/** Expected failures become one-line plugin errors, unexpected ones keep the stack; URLs are redacted in both */
export function toCliError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(redactUrls(String(error)));
  }
  redactError(error);

  if (HardhatPluginError.isHardhatPluginError(error)) {
    return error;
  }
  if (hasUnredactedFormattedMessage(error)) {
    return new KnownError(error.message, error);
  }
  const revertError = error instanceof BaseError ? error.walk(isRevertError) : null;
  if (isRevertError(revertError)) {
    const message = [revertError.shortMessage, ...(revertError.metaMessages ?? [])].join(" ");
    return new KnownError(message.replace(/\s+/g, " ").trim(), error);
  }
  return error;
}

export function withCliErrorBoundary(definition: NewTaskDefinition): NewTaskDefinition {
  return {
    ...definition,
    action: async () => {
      const { default: action } = await definition.action();
      return {
        default: async (taskArguments, hre) => {
          try {
            return await action(taskArguments, hre);
          } catch (error) {
            throw toCliError(error);
          }
        },
      };
    },
  };
}
