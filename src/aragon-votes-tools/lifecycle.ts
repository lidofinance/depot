import { decodeEventLog, encodeEventTopics, encodeFunctionData } from "viem";
import { RpcClient, WriteContractOptions } from "../network";
import { EvmScriptParser } from "./evm-script-parser";
import { HexStrPrefixed } from "../common/bytes";
import { getLidoContracts } from "../contracts/contracts";
import { Voting_ABI } from "../../abi/Voting.abi";
import { createTimedSpinner } from "../common/spinner";

export async function startAragonVote(
  client: RpcClient,
  evmScript: HexStrPrefixed,
  description: string,
  txOptions: WriteContractOptions,
) {
  const networkName = client.getNetworkName();
  const { voting, tokenManager } = getLidoContracts(networkName);

  const startVoteScript = EvmScriptParser.encode([
    {
      address: voting.address,
      calldata: encodeFunctionData({
        abi: voting.abi,
        functionName: "newVote",
        args: [evmScript, description, false, false],
      }),
    },
  ]);

  const spinner = createTimedSpinner(`Sending tx to create the vote...`);
  const receipt = await client.write(tokenManager, "forward", [startVoteScript], txOptions);

  const [startVoteTopic] = encodeEventTopics({
    abi: Voting_ABI,
    eventName: "StartVote",
  });
  const startVoteLog = receipt.logs.find((log) => log.topics[0] === startVoteTopic);

  if (!startVoteLog) {
    spinner.error(`Transaction failed`);
    throw new Error("StartVote log not found");
  }

  const startVoteEvent = decodeEventLog({
    abi: Voting_ABI,
    eventName: "StartVote",
    topics: startVoteLog.topics,
    data: startVoteLog.data,
  });

  const voteId: bigint = startVoteEvent.args.voteId;
  spinner.succeed(`Vote with id ${voteId} successfully created`);

  return { voteId, receipt };
}

export async function executeAragonVote(client: RpcClient, voteId: bigint, txOptions: WriteContractOptions) {
  const { voting } = getLidoContracts(client.getNetworkName());
  return client.write(voting, "executeVote", [voteId], txOptions);
}
