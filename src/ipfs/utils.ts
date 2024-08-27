import { PinataSDK } from "pinata";

export function getPinata(token: string) {
  return new PinataSDK({ pinataJwt: token });
}
