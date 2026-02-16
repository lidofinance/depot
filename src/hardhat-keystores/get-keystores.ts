import path from "path";

import { create, NamedKeystores } from "./named-keystores";
import { NamedKeystoresStorage } from "./named-keystores-storage";

const keystoresByPath = new Map<string, NamedKeystores>();

type HreWithConfig = {
  config: {
    paths: { root: string };
    keystores?: { path?: string };
  };
};

function resolveKeystorePath(hre: HreWithConfig): string {
  const configuredPath = (hre.config as { keystores?: { path?: string } }).keystores?.path;

  if (!configuredPath) {
    return path.join(hre.config.paths.root, "keystores");
  }

  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return path.normalize(path.join(hre.config.paths.root, configuredPath));
}

export function getKeystores(hre: HreWithConfig): NamedKeystores {
  const keystorePath = resolveKeystorePath(hre);

  const cached = keystoresByPath.get(keystorePath);
  if (cached) {
    return cached;
  }

  const instance = create(NamedKeystoresStorage.create(keystorePath));
  keystoresByPath.set(keystorePath, instance);

  return instance;
}
