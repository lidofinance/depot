import { HardhatPluginError } from "hardhat/plugins";
import { NewTaskDefinition } from "hardhat/types/tasks";
import { BaseError, ContractFunctionExecutionError, ContractFunctionRevertedError, ExecutionRevertedError } from "viem";

import { KnownError } from "../common/errors";
import { redactError, redactUrls } from "../common/redact";

function isRevertError(error: unknown): error is ContractFunctionRevertedError | ExecutionRevertedError {
  return error instanceof ContractFunctionRevertedError || error instanceof ExecutionRevertedError;
}

// viem wraps in-process EDR reverts as unknown RPC errors, not as ExecutionRevertedError
function isEdrRevertError(error: unknown): error is BaseError {
  return error instanceof BaseError && /^VM Exception while processing transaction: reverted/.test(error.details);
}

function isContractFunctionError(error: unknown): error is ContractFunctionExecutionError {
  return error instanceof ContractFunctionExecutionError;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
  if (!(error instanceof BaseError)) {
    return error;
  }
  const revertError = error.walk(isRevertError);
  if (isRevertError(revertError)) {
    return new KnownError(oneLine([revertError.shortMessage, ...(revertError.metaMessages ?? [])].join(" ")), error);
  }
  const edrRevertError = error.walk(isEdrRevertError);
  if (isEdrRevertError(edrRevertError)) {
    const contractError = error.walk(isContractFunctionError);
    const prefix = isContractFunctionError(contractError) ? `${contractError.functionName}: ` : "";
    return new KnownError(oneLine(`${prefix}${edrRevertError.details}`), error);
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
