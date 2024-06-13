import { lazyObject } from "hardhat/plugins";
import { EnvironmentExtender } from "hardhat/types";

import "./runtime-type-extensions";
import { create } from "./named-keystores";
import { NamedKeystoresStorage } from "./named-keystores-storage";

export const environmentExtender: EnvironmentExtender = async (hre) => {
  const namedKeystoresStorage = await NamedKeystoresStorage.create(hre.config.keystores.path);
  hre.keystores = lazyObject(() => create(namedKeystoresStorage));
};
