export abstract class KnownError extends Error {
  protected constructor(message: string) {
    super(message);
  }
}

export const isKnownError = (error: any): error is KnownError => {
  return error?.constructor?.prototype instanceof KnownError;
};
