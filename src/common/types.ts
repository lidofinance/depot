export type Address = `0x${string}`;
export type ChainId = bigint | number | string;

export interface Stringable {
  toString(...args: any[]): string;
}
