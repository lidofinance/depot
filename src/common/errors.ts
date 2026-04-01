export abstract class KnownError extends Error {
  protected constructor(message: string) {
    super(message)
  }
}

export const isKnownError = (error: unknown): error is KnownError => {
  return error?.constructor?.prototype instanceof KnownError
}
