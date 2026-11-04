import type { HexStrPrefixed } from "./bytes";

export type Address = HexStrPrefixed;
export type PrivateKey = HexStrPrefixed;
export type ChainId = bigint | number | string;
