import { BigNumberish } from "ethers";

import lido from "../../src/lido";

import { LocalProvider, StaticProvider } from "../../src/providers";
import { SendProvider } from "../../src/providers/types";
import providers from "../../src/providers/providers-service";
import { UnsupportedNetworkError } from "../../src/common/errors";

const AUTOPILOT = "0x1D0f1d0f1d0F1d0F1d0F1d0F1d0f1D0f1D0F1d0F";
const AUTOPILOT_ETH_BALANCE = 10n * 10n ** 18n; // 10 ETH
const AUTOPILOT_LDO_BALANCE = 10n ** 18n; // 1 LDO

const LDO_WHALES: Record<NetworkName, Address> = {
  mainnet: "0x820fb25352BB0c5E03E07AFc1d86252fFD2F0A18",
  goerli: "0x319d5370715D24A1225817009BB23e676aE741D3",
  sepolia: "",
};

type Provider = LocalProvider<StaticProvider<SendProvider>>;

async function unlockLdoWhale<T extends Provider>(provider: T) {
  const { name: networkName } = await provider.getNetwork();
  if (!providers.supports(networkName)) {
    throw new UnsupportedNetworkError(networkName);
  }
  const ldoWhaleAddress = LDO_WHALES[networkName];
  const ldoWhale = await provider.unlock(ldoWhaleAddress);
  const ldoWhaleBalanceBefore = await provider.getBalance(ldoWhaleAddress);
  await provider.setBalance(ldoWhaleAddress, 100n * 10n ** 18n);
  return [ldoWhale, ldoWhaleBalanceBefore] as const;
}

async function lockLdoWhale(provider: LocalProvider, balance: bigint) {
  const { name: networkName } = await provider.getNetwork();
  if (!providers.supports(networkName)) {
    throw new UnsupportedNetworkError(networkName);
  }
  const ldoWhaleAddress = LDO_WHALES[networkName];
  await provider.setBalance(ldoWhaleAddress, balance);
}

export async function prepareAutopilot<T extends Provider>(provider: T) {
  const autopilot = await provider.unlock(AUTOPILOT);

  await provider.setBalance(AUTOPILOT, AUTOPILOT_ETH_BALANCE);
  const { contracts } = await lido.v2(provider);
  const ldoBalance = await contracts.ldo.balanceOf(autopilot.address);
  if (ldoBalance === 0n) {
    const [ldoWhale, ldoWhaleBalanceBefore] = await unlockLdoWhale(provider);
    await contracts.ldo.connect(ldoWhale).transfer(autopilot.address, AUTOPILOT_LDO_BALANCE);
    await lockLdoWhale(provider, ldoWhaleBalanceBefore);
  }
  return autopilot;
}

export async function startVote<T extends Provider>(provider: T, evmScript: string) {
  const autopilot = await prepareAutopilot(provider);
  const { contracts } = await lido.v2(provider);
  const tx = await contracts.tokenManager.connect(autopilot).forward(evmScript);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error("Invalid confirmations value");
  }

  const startVoteLog = receipt.logs.find(
    (log) => log.topics[0] === contracts.voting.interface.getEvent("StartVote").topicHash,
  );
  if (!startVoteLog) {
    throw new Error("StartVote log not found");
  }

  const startVoteEvent = contracts.voting.interface.parseLog({
    data: startVoteLog?.data,
    topics: [...startVoteLog?.topics],
  })!;

  const voteId: number = startVoteEvent.args[0];

  return [voteId, receipt] as const;
}

export async function passVote<T extends Provider>(provider: T, voteId: BigNumberish) {
  const [ldoWhale, ldoWhaleBalanceBefore] = await unlockLdoWhale(provider);

  const { contracts } = await lido.v2(provider);

  await contracts.voting.connect(ldoWhale).vote(voteId, true, false);

  await provider.increaseTime(5 * 24 * 60 * 60);

  const tx = await contracts.voting.connect(ldoWhale).executeVote(voteId, {
    gasLimit: 5_000_000,
  });

  await lockLdoWhale(provider, ldoWhaleBalanceBefore);

  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("transaction wait failed");
  }
  return receipt;
}
