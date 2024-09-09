export interface Config {
  pinataToken?: string;
}

export const getConfigFromEnv = (): Config => {
  return {
    pinataToken: process.env.PINATA_TOKEN,
  };
};
