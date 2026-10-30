export const CREATOR = "0x1D0f1d0f1d0F1d0F1d0F1d0F1d0f1D0f1D0F1d0F";
export const CREATOR_ETH_BALANCE = 10n * 10n ** 18n; // 10 ETH
export const CREATOR_LDO_BALANCE = 10n ** 18n; // 1 LDO
export const VOTE_DURATION = 5 * 24 * 60 * 60;
export const DEFAULT_GAS_LIMIT = 5_000_000;

export const LDO_WHALES_BY_NETWORK_NAME = {
  mainnet: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
  holesky: "0xc807d4036B400dE8f6cD2aDbd8d9cf9a3a01CC30",
  hoodi: "0x0534aA41907c9631fae990960bCC72d75fA7cfeD",
} as const;

export const LDO_VOTERS_BY_NETWORK_NAME = {
  mainnet: [LDO_WHALES_BY_NETWORK_NAME.mainnet, "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c"],
  holesky: [LDO_WHALES_BY_NETWORK_NAME.holesky],
  hoodi: [LDO_WHALES_BY_NETWORK_NAME.hoodi],
} as const;
