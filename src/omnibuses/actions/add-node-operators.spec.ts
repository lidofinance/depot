import { expect } from "chai";
import { AddNodeOperators } from "./add-node-operators";
import { randomAddress } from "hardhat/internal/hardhat-network/provider/utils/random";
import { HexStrPrefixed } from "../../common/bytes";
import sinon from "sinon";
import * as voteScripts from "../../votes/vote-script";
import * as voteEvents from "../../votes/events";

describe("AddNodeOperators", () => {
  let addNodeOperators: any;

  beforeEach(() => {
    sinon.stub(voteScripts, "call");
    sinon.stub(voteEvents, "event");
    addNodeOperators = AddNodeOperators({ curatedStakingModule: sinon.stub() } as any, {
      operators: [
        { name: "Operator 1", rewardAddress: randomAddress().toString() as HexStrPrefixed },
        { name: "Operator 2", rewardAddress: randomAddress().toString() as HexStrPrefixed },
        { name: "Operator 3", rewardAddress: randomAddress().toString() as HexStrPrefixed },
      ],
    });
  });

  after(() => {
    sinon.restore();
  });

  it("should return the correct title", () => {
    expect(addNodeOperators.title).to.equal("Add 3 node operators:\n - Operator 1\n - Operator 2\n - Operator 3");
  });
});
