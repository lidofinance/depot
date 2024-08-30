import { expect } from "chai";
import { AddNodeOperators } from "./add-node-operators";
import { randomAddress } from "hardhat/internal/hardhat-network/provider/utils/random";
import { HexStrPrefixed } from "../../common/bytes";

describe("AddNodeOperators", () => {
  let addNodeOperators: any;

  beforeEach(() => {
    addNodeOperators = AddNodeOperators({} as any, {
      operators: [
        { name: "Operator 1", rewardAddress: randomAddress().toString() as HexStrPrefixed },
        { name: "Operator 2", rewardAddress: randomAddress().toString() as HexStrPrefixed },
        { name: "Operator 3", rewardAddress: randomAddress().toString() as HexStrPrefixed },
      ],
    });
  });

  it("should return the correct title", () => {
    expect(addNodeOperators.title).to.equal("Add 3 node operators:\n - Operator 1\n - Operator 2\n - Operator 3");
  });
});
