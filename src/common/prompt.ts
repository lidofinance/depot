import prompts from "prompts";

import { KnownError } from "./errors";

interface SelectChoice {
  value: string;
  title: string;
}

interface SecretOptions {
  invisible?: boolean; // false by default
}

interface PasswordOptions {
  confirmation?: boolean; // true by default
}

class OperationAbortedError extends KnownError {
  constructor() {
    super("Operation was aborted by the user");
  }
}

class PasswordConfirmationMismatchError extends KnownError {
  constructor() {
    super("Password confirmation does not match the password. Aborting...");
  }
}

const DEFAULT_PROMPTS_OPTIONS = {
  onCancel() {
    throw new OperationAbortedError();
  },
};

async function toggle(message: string) {
  const { isConfirmed } = await prompts({
    type: "toggle",
    name: "isConfirmed",
    message,
    active: "yes",
    inactive: "no",
  });
  return Boolean(isConfirmed);
}

async function confirmOrAbort(message?: string, autoConfirm = false) {
  if (autoConfirm) {
    return;
  }

  const isConfirmed = await toggle(message ?? "Confirm?");
  if (!isConfirmed) {
    throw new OperationAbortedError();
  }
}

/** A stray Enter must not send to a live network, so the user types the expected value */
async function confirmByTypingOrAbort(message: string, expected: string) {
  const answer = await text(`${message}\n  Type "${expected}" to confirm:`);
  if (answer.trim() !== expected) {
    throw new OperationAbortedError();
  }
}

async function confirm(message?: string) {
  return toggle(message ?? "Confirm?");
}

async function select(message: string, choices: SelectChoice[]) {
  const { value } = await prompts(
    {
      name: "value",
      type: "select",
      message,
      choices,
    },
    DEFAULT_PROMPTS_OPTIONS,
  );
  return value;
}

async function secret(message: string, options?: SecretOptions): Promise<string> {
  const { value } = await prompts(
    {
      name: "value",
      message,
      type: options?.invisible === true ? "invisible" : "password",
    },
    DEFAULT_PROMPTS_OPTIONS,
  );
  return value;
}

async function password(message: string, options: PasswordOptions): Promise<string> {
  const password = await secret(message, {
    invisible: true,
  });

  if (options.confirmation ?? true) {
    const confirmation = await secret("Confirm the password:", {
      invisible: true,
    });
    if (password !== confirmation) {
      throw new PasswordConfirmationMismatchError();
    }
  }

  return password;
}

async function text(message: string): Promise<string> {
  const { value } = await prompts({ name: "value", type: "text", message }, DEFAULT_PROMPTS_OPTIONS);
  return String(value ?? "");
}

export default {
  text,
  secret,
  select,
  confirm,
  confirmOrAbort,
  confirmByTypingOrAbort,
  password,
};
