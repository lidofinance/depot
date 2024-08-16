import { flatten } from "lodash";
import lido, { LidoEthContracts } from "../src/lido";
import { NetworkName } from "../src/networks";
import votes, { call, event, EventCheck, EvmCall, EvmScriptParser, forward } from "../src/votes";
import { ContractTransactionReceipt, Log, TransactionReceipt } from "ethers";
import { RpcProvider } from "../src/providers";
import { HexStrPrefixed } from "../src/common/bytes";

interface OmnibusAction {
  title: string;
  evmCall: EvmCall;
  expectedEvents: EventCheck[];
}

interface OmnibusInput<N extends NetworkName> {
  network: N;
  actions(contracts: LidoEthContracts<N>): (OmnibusAction | OmnibusAction[])[];
}

export class Omnibus<N extends NetworkName> {
  public readonly input: OmnibusInput<N>;

  constructor(input: OmnibusInput<N>) {
    this.input = input;
  }

  get network() {
    return this.input.network;
  }

  getActions(): OmnibusAction[] {
    return flatten(this.input.actions(this.getContracts()));
  }

  getEVMCalls(): EvmCall[] {
    return this.getActions().map((action) => action.evmCall);
  }

  getEvmScript(): HexStrPrefixed {
    return EvmScriptParser.encode(this.getEVMCalls());
  }

  getDescription(): string {
    return "";
  }

  getExpectedEvents(): EventCheck[][] {
    return this.getActions().map((action) => action.expectedEvents);
  }

  async adopt(provider: RpcProvider): Promise<{ voteId: bigint; enactReceipt: ContractTransactionReceipt }> {
    return votes.adopt(provider, this.getEvmScript(), this.getDescription());
  }

  private getContracts(): LidoEthContracts<N> {
    return lido.eth[this.input.network]() as LidoEthContracts<N>;
  }
}

const actions = {
  stakingModule: {
    addNodeOperators(contracts: LidoEthContracts, input: unknown): OmnibusAction[] {
      // TODO: implement
      return [];
    },
    updateStakingModule(contracts: LidoEthContracts, input: unknown): OmnibusAction {
      // TODO: implement
    },
  },
  treasury: {
    makePayment(contracts: LidoEthContracts, input: unknown): OmnibusAction {
      // TODO: implement
    },
  },
  easyTrack: {
    addPaymentEvmScriptFactories(contracts: LidoEthContracts, input: unknown): OmnibusAction[] {
      return [];
      // TODO: implement
    },
  },
  stakingRouter: {},
};

export const newNodeOperators = [
  {
    name: "A41",
    rewardAddress: "0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7",
  },
  {
    name: "Develp GmbH",
    rewardAddress: "0x0a6a0b60fFeF196113b3530781df6e747DdC565e",
  },
  {
    name: "Ebunker",
    rewardAddress: "0x2A2245d1f47430b9f60adCFC63D158021E80A728",
  },
  {
    name: "Gateway.fm AS",
    rewardAddress: "0x78CEE97C23560279909c0215e084dB293F036774",
  },
  {
    name: "Numic",
    rewardAddress: "0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC",
  },
  {
    name: "ParaFi Technologies LLC",
    rewardAddress: "0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7",
  },
  {
    name: "RockawayX Infra",
    rewardAddress: "0xcA6817DAb36850D58375A10c78703CE49d41D25a",
  },
] as const;

export default new Omnibus({
  network: "mainnet",
  actions: (contracts) => [
    actions.treasury.makePayment(contracts, {
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      token: contracts.ldo,
      amount: 180_000n * 10n ** 18n,
      recipient: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
    }),
    actions.stakingModule.updateStakingModule(contracts, {
      title: "Raise Simple DVT target share from 0.5% to 4%", // Title is always required
      stakingModule: "SimpleDVT",
      targetShare: 400,
      treasuryFee: 800,
      stakingModuleFee: 200,
    }),
    // actions for oftenly created actions may be reused
    actions.easyTrack.addPaymentEvmScriptFactories(contracts, {
      name: "reWARDS stETH",
      token: contracts.stETH,
      registry: "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A",
      trustedCaller: "0x87D93d9B2C672bf9c9642d853a8682546a5012B5",
      factories: {
        topUp: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
        addRecipient: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
        removeRecipient: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
      },
    }),
    // actions may return the list of actions
    actions.stakingModule.addNodeOperators(contracts, {
      module: "Curated",
      operators: newNodeOperators,
    }),
    // Custom event may be manually created in place
    {
      title: "Custom action if needed",
      evmCall: forward(contracts.agent, [call(contracts.curatedStakingModule.deactivateNodeOperator, [1])]),
      expectedEvents: [
        event(contracts.callsScript, "LogScriptCall", { emitter: contracts.agent }),
        event(contracts.curatedStakingModule, "NodeOperatorActiveSet", { args: [1, false] }),
      ],
    },
  ],
});
