// RPC providers keep access tokens in the userinfo, path and query; scheme, host and port stay visible
const URL_PATTERN = /\b((?:https?|wss?):\/\/)(?:[^\s/@]+@)?([^\s/?#"'`<>()[\]{}]+)([^\s"'`<>()[\]{}]*)/gi;

export function redactUrls(text: string): string {
  return text.replace(URL_PATTERN, (_match, scheme: string, host: string, tail: string) =>
    tail === "" || tail === "/" ? `${scheme}${host}${tail}` : `${scheme}${host}/***`,
  );
}

function redactValue(value: unknown, visited: Set<object>): unknown {
  if (typeof value === "string") {
    return redactUrls(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, visited));
  }
  if (value instanceof Error) {
    redactErrorInPlace(value, visited);
  }
  return value;
}

function redactErrorInPlace(error: Error, visited: Set<object>): void {
  if (visited.has(error)) {
    return;
  }
  visited.add(error);
  // `message` and `stack` are non-enumerable; viem also keeps the URL in `details`, `metaMessages`, `url` and `cause`
  for (const key of new Set([...Object.getOwnPropertyNames(error), "message", "stack", "cause"])) {
    const value: unknown = Reflect.get(error, key);
    const redacted = redactValue(value, visited);
    if (redacted !== value) {
      Reflect.set(error, key, redacted);
    }
  }
}

export function redactError<ErrorT extends Error>(error: ErrorT): ErrorT {
  redactErrorInPlace(error, new Set());
  return error;
}
