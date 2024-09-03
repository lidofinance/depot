import { RpcProvider } from "../../providers";
import providers from "../../providers/providers";
import votes, { FormattedEvmCall } from "../../votes";
import bytes from "../../common/bytes";
import { Omnibus } from "../omnibus";
import { TxTrace } from "../../traces/tx-traces";

export interface SimulationGroup {
  call: FormattedEvmCall;
  trace: TxTrace;
  title: string;
}

export const simulateOmnibus = async (
  omnibus: Omnibus,
  provider: RpcProvider,
): Promise<[gasUsed: bigint, SimulationGroup[]]> => {
  const snapshotRestorer = await providers.cheats(provider).snapshot();

  const { enactReceipt } = await votes.adopt(provider, omnibus.script, omnibus.summary, {
    gasLimit: 30_000_000,
  });

  const voteTrace = await votes.trace(enactReceipt);

  const res: SimulationGroup[] = [];

  const { calls, actions } = omnibus;

  let voteCallIndices: number[] = [];
  for (let i = 0; i < omnibus.calls.length; ++i) {
    const { address: contract, calldata } = calls[i];
    const startIndex = voteTrace.calls.findIndex(
      (opCode) =>
        (opCode.type === "CALL" || opCode.type === "DELEGATECALL") &&
        bytes.isEqual(opCode.address, contract) &&
        bytes.isEqual(opCode.input, calldata),
    );
    voteCallIndices.push(startIndex);
  }

  for (let ind = 0; ind < voteCallIndices.length; ++ind) {
    const traceStartInd = voteCallIndices[ind];
    const traceEndInd = voteCallIndices[ind + 1];
    const traceSlice = voteTrace.slice(traceStartInd, traceEndInd);
    res.push({
      title: actions[ind].title,
      trace: traceSlice,
      call: calls[ind],
    });
  }
  await snapshotRestorer.restore();

  return [enactReceipt.gasUsed, res];
};
