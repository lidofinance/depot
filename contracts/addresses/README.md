# Address registry

One library per network contains shared Depot infrastructure addresses:

- `MainnetAddresses.sol` for Ethereum mainnet.
- `HoodiAddresses.sol` for Hoodi.

Use the same constant name for the same contract role across networks. Each library includes
only the addresses needed on that network; the exported constant sets can differ.

## Shared and vote-scoped addresses

These libraries provide named addresses for shared infrastructure code and tests. For example,
`MainnetAddresses.VOTING` identifies the mainnet Aragon Voting contract.

Vote contracts declare their addresses locally, including addresses also listed here. Keep
vote-specific deployments and historical targets alongside the vote so its description and
payload can be reviewed together.

## Verifying addresses

Check additions against the official deployment documentation for the relevant network:

- [Ethereum mainnet](https://docs.lido.fi/deployed-contracts/)
- [Hoodi](https://docs.lido.fi/deployed-contracts/hoodi/)

The mainnet `CALLS_SCRIPT` constant links to its verified contract source directly.
Confirm the contract's role as well as its address; compilation alone cannot verify either.
