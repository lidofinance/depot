import lidoV2 from "./lido-v2";

const LidoProtocolVersionized = {
  v2: lidoV2,
};

export type LidoVersion = keyof LidoProtocol;
export type LidoProtocol = typeof LidoProtocolVersionized;

export default LidoProtocolVersionized;
