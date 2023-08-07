import prompts from "prompts";

class OperationAbortedError extends Error {
  constructor() {
    super("Operation was aborted by the user");
  }
}

class PasswordConfirmationMismatchError extends Error {
  constructor() {
    super("Password confirmation does not mismatch the password. Aborting...");
  }
}

interface SelectChoice<T = unknown> {
  value: T;
  title: string;
}

const DEFAULT_PROMPTS_OPTIONS = {
  onCancel() {
    throw new OperationAbortedError();
  },
};

export async function select<T = unknown>(message: string, choices: SelectChoice<T>[]) {
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

interface PasswordOptions {
  confirmation?: boolean; // true by default
}

export async function password(message: string, options: PasswordOptions) {
  const password = await secret(message ?? "Enter the password:", {
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

interface SecretOptions {
  invisible?: boolean; // false by default
}

export async function secret(message: string, options?: SecretOptions) {
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

async function confirm(message?: string) {
  const { isConfirmed } = await prompts(
    {
      type: "confirm",
      name: "isConfirmed",
      message: message ?? "Confirm?",
    },
    DEFAULT_PROMPTS_OPTIONS,
  );
  return isConfirmed;
}

export default {
  secret,
  select,
  confirm,
  password,
};
