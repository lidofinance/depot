export type HexStrNonPrefixed = string;
export type HexStrPrefixed = `0x${HexStrNonPrefixed}`;
export type HexStr = HexStrPrefixed | HexStrNonPrefixed;

/**
 * @param bytes - bytes sequence represented as string (might be prefixed with 0x or not)
 * @returns normalized (all characters are in lower case and prefixed with 0x) version of the bytes
 */
function normalize<T extends HexStr>(bytes: T): HexStrPrefixed {
  return prefix0x(bytes.toLowerCase() as T);
}

/**
 * @param bytes - bytes sequence represented as string (might be prefixed with 0x or not)
 * @returns the prefixed version of the `bytes` string. If it was prefixed already returns the same value
 */
function prefix0x<T extends HexStr>(bytes: T): HexStrPrefixed {
  return is0xPrefixed(bytes) ? bytes : (("0x" + bytes) as HexStrPrefixed);
}

function strip0x(bytes: HexStr): HexStrNonPrefixed {
  return bytes.startsWith("0x") ? bytes.slice(2) : bytes;
}

function join(...bytes: HexStr[]): HexStrPrefixed {
  return prefix0x(bytes.reduce((res, b) => res + strip0x(b), ""));
}

function slice(bytes: HexStr, startIndex?: number, endIndex?: number): HexStrPrefixed {
  return prefix0x(
    strip0x(bytes).slice(
      startIndex ? 2 * startIndex : startIndex,
      endIndex ? 2 * endIndex : endIndex,
    ),
  );
}

function toBigInt(bytes: HexStr) {
  return BigInt(prefix0x(bytes));
}

function toInt(bytes: HexStr) {
  const asBigInt = toBigInt(bytes);
  if (asBigInt > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `Int overflow: ${asBigInt} > Number.MAX_SAFE_INTEGER. Use cast to BigInt instead`,
    );
  }
  return Number(asBigInt);
}

function length(bytes: HexStr) {
  const stripped = strip0x(bytes);
  if (stripped.length % 2 !== 0) {
    throw new Error(`Invalid bytes length. ${stripped.length} % 2 !== 0`);
  }
  return stripped.length / 2;
}

function encode<T extends number | bigint>(value: T) {
  return prefix0x(value.toString(16));
}

function padStart(bytes: HexStr, bytesLength: number, fill: HexStr = "00") {
  return strip0x(bytes).padStart(bytesLength * 2, fill);
}

function isEqual(bytes1: HexStr, bytes2: HexStr): boolean {
  return strip0x(bytes1).toLowerCase() === strip0x(bytes2).toLowerCase();
}

function isValid(bytes: unknown): bytes is HexStr {
  if (typeof bytes !== "string") return false;
  const stripped = strip0x(bytes);
  return stripped.length % 2 === 0 && /^[a-fA-f0-9]+$/.test(strip0x(bytes));
}

function is0xPrefixed(bytes: HexStr): bytes is HexStrPrefixed {
  return bytes.startsWith("0x");
}

export default {
  join,
  slice,
  encode,
  strip0x,
  prefix0x,
  toInt,
  toBigInt,
  length,
  padStart,
  isEqual,
  isValid,
  normalize,
};
