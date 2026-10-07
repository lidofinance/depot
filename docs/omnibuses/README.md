# Omnibus Documentation

Use this documentation as the primary guide for writing and maintaining omnibuses in this repository.

- Writing guide: [WRITING_OMNIBUS.md](./WRITING_OMNIBUS.md)
- Template source: [../../omnibuses/\_omnibus_template/\_omnibus_template.ts](../../omnibuses/_omnibus_template/_omnibus_template.ts)
- Regular example source: [../../omnibuses/\_example_regular_omnibus/\_example_regular_omnibus.ts](../../omnibuses/_example_regular_omnibus/_example_regular_omnibus.ts)
- Contract-based example source: [../../omnibuses/\_example_contract_omnibus/\_example_contract_omnibus.ts](../../omnibuses/_example_contract_omnibus/_example_contract_omnibus.ts)

Runbook commands:

```bash
npm run omnibus:create
npm run omnibus:contract -- <omnibus_name> # optional for contract-based omnibuses
npm run omnibus:build -- <omnibus_name> # compile generated omnibus contract(s)
npm run omnibus:test -- <omnibus_name>
npm run omnibus:simulate -- <omnibus_name>
npm run omnibus:run -- <omnibus_name>
```

Contract-mode note:

- After successful generation/build, ensure the omnibus script has `deploy()` or explicit `deployment` mapping (see `_example_contract_omnibus.ts`), so runtime uses the contract.
