export abstract class KnownError extends Error {
  protected constructor(message: string) {
    super(message);
  }
}
