import prompts from 'prompts'

export interface SelectChoice {
  value: string
  title: string
}

export interface SecretOptions {
  invisible?: boolean // false by default
}

export interface PasswordOptions {
  confirmation?: boolean // true by default
}

class OperationAbortedError extends Error {
  constructor() {
    super('Operation was aborted by the user')
  }
}

class PasswordConfirmationMismatchError extends Error {
  constructor() {
    super('Password confirmation does not mismatch the password. Aborting...')
  }
}

const DEFAULT_PROMPTS_OPTIONS = {
  onCancel() {
    throw new OperationAbortedError()
  },
}

async function confirmOrAbort(message?: string, autoConfirm = false) {
  if (autoConfirm) {
    return
  }

  const { isConfirmed } = await prompts({
    type: 'toggle',
    name: 'isConfirmed',
    message: message ?? 'Confirm?',
    active: 'yes',
    inactive: 'no',
  })
  if (!isConfirmed) {
    throw new OperationAbortedError()
  }
}

async function confirm(message?: string) {
  const { isConfirmed } = await prompts({
    type: 'toggle',
    name: 'isConfirmed',
    message: message ?? 'Confirm?',
    active: 'yes',
    inactive: 'no',
  })
  return isConfirmed
}

async function select(message: string, choices: SelectChoice[]) {
  const { value } = await prompts(
    {
      name: 'value',
      type: 'select',
      message,
      choices,
    },
    DEFAULT_PROMPTS_OPTIONS,
  )
  return value
}

async function secret(message: string, options?: SecretOptions): Promise<string> {
  const { value } = await prompts(
    {
      name: 'value',
      message,
      type: options?.invisible === true ? 'invisible' : 'password',
    },
    DEFAULT_PROMPTS_OPTIONS,
  )
  return value
}

async function password(message: string, options: PasswordOptions): Promise<string> {
  const password = await secret(message ?? 'Enter the password:', {
    invisible: true,
  })

  if (options.confirmation ?? true) {
    const confirmation = await secret('Confirm the password:', {
      invisible: true,
    })
    if (password !== confirmation) {
      throw new PasswordConfirmationMismatchError()
    }
  }

  return password
}

async function sigint() {
  console.log('Press CTRL + C to exit')
  const sigintPromise = new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2147483646)
    process.on('SIGINT', () => {
      clearTimeout(timeout)
      resolve()
    })
  })

  await sigintPromise
}

export default {
  secret,
  select,
  confirm,
  confirmOrAbort,
  password,
  sigint,
}
