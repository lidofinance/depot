import { Omnibus } from "../src/omnibuses/omnibus";
import { AccessControlGrantRole } from "../src/omnibuses/actions/access-control-grant-role";
import { AddNodeOperators } from "../src/omnibuses/actions/add-node-operators";
import { UpdateTargetValidatorsLimit } from "../src/omnibuses/actions/update-target-validators-limit";

export default new Omnibus({
  network: "mainnet",
  voteId: 165,
  launching: { date: "Oct-03-2023 05:46:59 PM UTC", blockNumber: 18271583 },
  // execution: { date: "Oct-06-2023 06:51:23 PM UTC", blockNumber: 18293362 },
  actions: ({ agent, stakingRouter }) => [
    new AddNodeOperators({
      operators: [
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
      ],
    }),

    new AccessControlGrantRole({
      role: "STAKING_MODULE_MANAGE_ROLE",
      on: stakingRouter,
      to: agent,
    }),

    new UpdateTargetValidatorsLimit({
      stakingModuleId: 1,
      nodeOperator: { name: "Jump Crypto", id: 1 },
      targetValidatorsCount: 0,
      isTargetLimitActive: true,
    }),
  ],
});
