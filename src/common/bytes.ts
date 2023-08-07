export type BytesStringPrefixed = string;
export type BytesStringNonPrefixed = string;
export type BytesString = BytesStringPrefixed | BytesStringNonPrefixed;

function prefix0x(bytes: BytesString): BytesStringPrefixed {
  return bytes.startsWith("0x") ? bytes : "0x" + bytes;
}

function strip0x(bytes: BytesString): BytesStringNonPrefixed {
  return bytes.startsWith("0x") ? bytes.slice(2) : bytes;
}

function join(...bytes: BytesString[]): BytesStringPrefixed {
  return prefix0x(bytes.reduce((res, b) => res + strip0x(b), ""));
}

function slice(bytes: BytesString, startIndex?: number, endIndex?: number): BytesStringPrefixed {
  return prefix0x(
    strip0x(bytes).slice(
      startIndex ? 2 * startIndex : startIndex,
      endIndex ? 2 * endIndex : endIndex,
    ),
  );
}

function toBigInt(bytes: BytesString) {
  return BigInt(prefix0x(bytes));
}

function toInt(bytes: BytesString) {
  const asBigInt = toBigInt(bytes);
  if (asBigInt > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `Int overflow: ${asBigInt} > ${Number.MAX_SAFE_INTEGER}. Use cast to BigInt instead`,
    );
  }
  return Number(asBigInt);
}

function length(bytes: BytesString) {
  const stripped = strip0x(bytes);
  if (stripped.length % 2 !== 0) {
    throw new Error(`Invalid bytes length. ${stripped.length} % 2 !== 0`);
  }
  return stripped.length / 2;
}

function encode<T extends number | bigint>(value: T) {
  return prefix0x(value.toString(16));
}

function padStart(bytes: BytesString, bytesLength: number, fill: BytesString = "00") {
  return strip0x(bytes).padStart(bytesLength * 2, fill);
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
};
