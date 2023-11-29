import path from "path";
import { lazyObject } from "hardhat/plugins";
import { extendConfig, extendEnvironment } from "hardhat/config";
import { HardhatConfig, HardhatUserConfig } from "hardhat/types";

// This import is needed to let the TypeScript compiler know that it should include your type
// extensions in your npm package's types file.
import "./tasks";
import "./type-extensions";
import { NamedKeystoreService, NamedKeystoreStorage } from "./keystores";

extendConfig((config: HardhatConfig, userConfig: Readonly<HardhatUserConfig>) => {
  // We apply our default config here. Any other kind of config resolution
  // or normalization should be placed here.
  //
  // `config` is the resolved config, which will be used during runtime and
  // you should modify.
  // `userConfig` is the config as provided by the user. You should not modify
  // it.
  //
  // If you extended the `HardhatConfig` type, you need to make sure that
  // executing this function ensures that the `config` object is in a valid
  // state for its type, including its extensions. For example, you may
  // need to apply a default value, like in this example.
  const keystorePath = userConfig.keystore.path;

  if (keystorePath === undefined) {
    config.keystore.path = path.join(config.paths.root, "keystores");
  } else {
    if (path.isAbsolute(keystorePath)) {
      config.keystore.path = keystorePath;
    } else {
      // We resolve relative paths starting from the project's root.
      // Please keep this convention to avoid confusion.
      config.keystore.path = path.normalize(path.join(config.paths.root, keystorePath));
    }
  }
});

extendEnvironment((hre) => {
  // We add a field to the Hardhat Runtime Environment here.
  // We use lazyObject to avoid initializing things until they are actually
  // needed.
  hre.keystore = lazyObject(
    () => new NamedKeystoreService(NamedKeystoreStorage.create(hre.config.keystore.path))
  );
});
