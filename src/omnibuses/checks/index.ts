import { partial } from "lodash";
import { Contracts } from "../../contracts/contracts";
import LidoOnMainnet from "../../../configs/lido-on-mainnet";
import { checkLDOBalance } from "./token";
import { checkNodeOperator, checkNodeOperatorsCount, checkStakingModule } from "./staking-router";
import {
  checkAddRecipientFactory,
  checkFactoryExists,
  checkFactoryNotExists,
  checkRemoveRecipientFactory,
  checkTopUpFactory,
} from "./easy-track";
import { RpcProvider } from "../../providers";
import { checkOmnibusEvents } from "./omnibus-events";

// TODO: consider automatic gathering of checks from the checks folder
export const checks = (contracts: Contracts<typeof LidoOnMainnet>, provider: RpcProvider) => {
  return {
    balance: {
      checkLDOBalance: partial(checkLDOBalance, contracts),
    },
    easyTrack: {
      checkFactoryExists: partial(checkFactoryExists, contracts),
      checkFactoryNotExists: partial(checkFactoryNotExists, contracts),
      checkAddRecipientFactory: partial(checkAddRecipientFactory, contracts, provider),
      checkRemoveRecipientFactory: partial(checkRemoveRecipientFactory, contracts, provider),
      checkTopUpFactory: partial(checkTopUpFactory, contracts, provider),
    },
    stakingRouter: {
      checkNodeOperator: partial(checkNodeOperator, contracts),
      checkNodeOperatorsCount: partial(checkNodeOperatorsCount, contracts),
      checkStakingModule: partial(checkStakingModule, contracts),
    },
    checkActionEvents: partial(checkOmnibusEvents, contracts),
  };
};
