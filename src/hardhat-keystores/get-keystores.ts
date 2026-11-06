import path from "path";

import { create, NamedKeystores } from "./named-keystores";
import { NamedKeystoresStorage } from "./named-keystores-storage";

const keystoresByPath = new Map<string, NamedKeystores>();

type HreWithConfig = { config: { paths: { root: string } } };

export function getKeystores(hre: HreWithConfig): NamedKeystores {
  const keystorePath = path.join(hre.config.paths.root, ".keystores");

  const cached = keystoresByPath.get(keystorePath);
  if (cached) {
    return cached;
  }

  const instance = create(NamedKeystoresStorage.create(keystorePath));
  keystoresByPath.set(keystorePath, instance);

  return instance;
}
