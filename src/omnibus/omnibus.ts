import lido, { LidoProtocol, LidoVersion } from "../lido";

import actions from "./actions";
import { ContractCall, OmnibusContext } from "./types";
import evmScriptParser from "./evm-script-parser";

interface ContractCallFactory<T extends LidoVersion> {
  (ctx: OmnibusContext<T>): ContractCall;
}

interface OmnibusActionsBuilder<T extends LidoVersion> {
  (ctx: OmnibusContext<T>): [string, ContractCallFactory<T>][];
}

interface OmnibusPlan<T extends LidoVersion> {
  version?: T;
  launch: string;
  network: NetworkName;
  payload: OmnibusActionsBuilder<T>;
}

export interface ParsedOmnibusCall {
  title: string;
  call: ContractCall;
}

export class Omnibus<T extends LidoVersion = LidoVersion> {
  public readonly launchDate: Date;
  private readonly plan: OmnibusPlan<T>;
  private readonly context: OmnibusContext<T>;

  constructor(plan: OmnibusPlan<T>) {
    this.launchDate = new Date(plan.launch.replace("_", "-"));

    if (Number.isNaN(this.launchDate.getTime())) {
      throw new Error("Invalid launch date format");
    }

    this.plan = plan;
    const { addresses, contracts, proxies, implementations } = lido[plan.version || "v2"](
      plan.network,
    );

    this.context = {
      proxies,
      actions,
      addresses,
      contracts,
      implementations,
      parser: evmScriptParser,
    };
  }

  get version(): LidoVersion {
    return this.plan.version || "v2";
  }

  get titles() {
    const items = this.plan.payload(this.context);
    return items.map((i) => i[0]);
  }

  get network() {
    return this.plan.network;
  }

  parse(): ParsedOmnibusCall[] {
    const { titles, evmScript } = this.rawEVMScript();
    const { calls } = evmScriptParser.parse(evmScript);

    const res = [];
    for (let i = 0; i < calls.length; ++i) {
      res.push({
        title: titles[i],
        call: calls[i],
      });
    }
    return res;
  }

  prepareEVMScript() {
    const { evmScript } = this.rawEVMScript();

    return evmScriptParser.serialize({
      calls: [
        {
          address: this.context.addresses.voting,
          calldata: this.context.contracts.voting.interface.encodeFunctionData(
            "newVote(bytes,string,bool,bool)",
            [evmScript, "TODO: Add a description", false, false],
          ),
        },
      ],
    });
  }

  private rawEVMScript() {
    const items = this.plan.payload(this.context);
    const calls = [];
    const titles = [];
    for (const [title, action] of items) {
      titles.push(title);
      calls.push(action(this.context));
    }
    return {
      titles,
      evmScript: evmScriptParser.serialize({ calls }),
    };
  }
}
