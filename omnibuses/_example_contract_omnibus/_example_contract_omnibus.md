# Omnibus "Example Contract Omnibus"

## Omnibus Description

<!-- OMNIBUS_DESCRIPTION -->

### Aragon Vote

1. Capture the Agent's LDO balance before execution.
2. Add the rewards stETH top-up EVM script factory.
3. Add the rewards stETH add-recipient EVM script factory.
4. Add the rewards stETH remove-recipient EVM script factory.
5. Transfer 110,000 LDO to the Argo Technology Consulting Ltd. (ATC) multisig.
6. Remove the rewards LDO top-up EVM script factory.
7. Remove the rewards LDO add-recipient EVM script factory.
8. Remove the rewards LDO remove-recipient EVM script factory.
9. Transfer 180,000 LDO to the Pool Maintenance Labs Ltd. (PML) multisig.
10. Validate the Agent's LDO balance after execution.
11. Submit the Dual Governance proposal below.

### Dual Governance Proposal

Pause deposits to the Curated Module (module 1), deposit 100 wei into stETH through Agent, and add seven node operators to the Curated Module.

<!-- OMNIBUS_DESCRIPTION -->

<!-- DG_PROPOSAL_DESCRIPTIONS -->

### Item 11

```text
11. Submit proposal to Dual Governance with the following calls:
  11.1. Forward call via Agent to pause deposits to the Curated Module
  11.2. Execute call via Agent to deposit 100 wei into stETH
  11.3. Forward 7 calls via Aragon Agent to add new Node Operators to the Curated Module
    11.3.1. Add node operator "A41" with the reward address 0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7 to Curated module
    11.3.2. Add node operator "Develp GmbH" with the reward address 0x0a6a0b60fFeF196113b3530781df6e747DdC565e to Curated module
    11.3.3. Add node operator "Ebunker" with the reward address 0x2A2245d1f47430b9f60adCFC63D158021E80A728 to Curated module
    11.3.4. Add node operator "Gateway.fm AS" with the reward address 0x78CEE97C23560279909c0215e084dB293F036774 to Curated module
    11.3.5. Add node operator "Numic" with the reward address 0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC to Curated module
    11.3.6. Add node operator "ParaFi Technologies LLC" with the reward address 0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7 to Curated module
    11.3.7. Add node operator "RockawayX Infra" with the reward address 0xcA6817DAb36850D58375A10c78703CE49d41D25a to Curated module
```

<!-- DG_PROPOSAL_DESCRIPTIONS -->
