import deepEql from "deep-eql"; // same as chai using already
import { describe, it } from "mocha";
import { JsonRpcProvider } from "ethers";
import type { JsonRpcPayload, JsonRpcResult } from "ethers";

import { assert } from "../common/assert";
import omnibuses from "../omnibuses/omnibuses";
import checks from "../omnibuses/checks";
import { adopt } from "./testing";
import * as mocks from "./testing.mock.json";

const omnibus = omnibuses.create({
  network: "mainnet",
  description: "test_tiny_omnibus",
  items: ({ blueprints }) => [
    blueprints.tokens.transferLDO({
      title: "Transfer 10,000 LDO to Lucky Wallet",
      to: "0x0000000000000000000000000000000000000777", // Random Address
      amount: 10_000n * 10n ** 18n,
    }),
  ],
});

const { events } = checks[omnibus.network];

class MockProvider extends JsonRpcProvider {
  snapshot: Record<number, { payload: JsonRpcPayload; response: JsonRpcResult; used: number }> = {};
  private rpcUrl: string = "";
  private blockNumber: string = ""; // use for mocking blockNumber requests in random order
  setSnapshot(snapshot: any) {
    this.snapshot = JSON.parse(JSON.stringify(snapshot));
  }
  /** if you set rpc url (for example "http://localhost:8545/") than provider will make request and save it to snapshot prop  */
  saveRequestsFormThisRpc(url: string) {
    this.rpcUrl = url;
  }
  async makeLocalQuery(payload: JsonRpcPayload): Promise<JsonRpcResult> {
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const json = await res.json();
    console.log(json.result);
    this.snapshot[payload.id] = { payload, response: json, used: 0 };
    return json;
  }

  private findClosestMockByPayload(payload: JsonRpcPayload, doNotCount = false): JsonRpcResult | null {
    const { id } = payload;
    // TODO: add ignoring blockNumber and chainId requests to use direct get instead of find with offset
    const iterator = [id, id - 1, id + 1, id - 2, id + 2]; // offset 2 form id

    for (const index of iterator) {
      if (!this.snapshot[index]) {
        continue;
      }
      const mock = this.snapshot[index];
      if (mock.payload.method !== payload.method || !deepEql(mock.payload.params, payload.params)) {
        continue;
      }
      if (!doNotCount) {
        mock.used = (mock.used || 0) + 1;
      }
      return { id, result: mock.response.result };
    }
    return null;
  }

  mockQuery(payload: JsonRpcPayload): JsonRpcResult {
    // eth_blockNumber requested randomly
    if (this.snapshot[payload.id].payload.method === "eth_blockNumber") {
      this.blockNumber = this.snapshot[payload.id].response.result;
    }

    const mock = this.findClosestMockByPayload(payload);
    if (mock) {
      return mock;
    }

    if (payload.method !== "eth_blockNumber") {
      throw new Error(`Request ${payload.method} with ${payload.id} not found in the mock`);
    }
    return { id: payload.id, result: this.blockNumber };
  }

  async sendOne(payload: JsonRpcPayload): Promise<JsonRpcResult> {
    return this.rpcUrl ? this.makeLocalQuery(payload) : Promise.resolve(this.mockQuery(payload)) ;
  }

  async _send(payload: JsonRpcPayload | Array<JsonRpcPayload>): Promise<Array<JsonRpcResult>> {
    if (Array.isArray(payload)) {
      return Promise.all(payload.map((item) => this.sendOne(item)));
    }
    return [await this.sendOne(payload)];
  }
}

describe("testing-tools", () => {
  it("adopt", async () => {
    const provider = new MockProvider();
    provider.setSnapshot(mocks.adopt);
    const overrides = { gasLimit: 30_000_000 };
    const result = await adopt(provider, omnibus.script, omnibus.summary, overrides);

    const unUsedMockIds = Object.values(provider.snapshot)
      .filter((item) => !item.used && !["eth_blockNumber", "eth_chainId"].includes(item.payload.method))
      .map((item) => item.payload.id);
    assert.equal(unUsedMockIds.length, 0, `Mock never get ids: ${unUsedMockIds.join(", ")}`);

    const multiUsedMockIds = Object.values(provider.snapshot)
      .filter((item) => item.used > 1 && !["eth_blockNumber", "eth_chainId"].includes(item.payload.method))
      .map((item) => item.payload.id);
    assert.equal(multiUsedMockIds.length, 0, `Mock never get ids: ${multiUsedMockIds.join(", ")}`);

    // @ts-ignore
    events.checkOmnibusEvents(omnibus.items, result.enactReceipt);
  });
});
