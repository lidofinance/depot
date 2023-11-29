import { BaseContract, id } from "ethers";
import contracts from "../../contracts";
import { AccessControl, AccessControl__factory } from "../../../typechain-types";
import { OmnibusAction, OmnibusTestContext, TitledEventChecks, TitledEvmCall } from "../omnibus";
import { NetworkName } from "../../networks";
import { forward, call, event } from "../../votes";

interface AccessControlRevokeRoleInput {
  on: Address | BaseContract;
  from: Address | BaseContract;
  role: string;
}

export class AccessControlRevokeRole extends OmnibusAction<AccessControlRevokeRoleInput> {
  private get fromAddress(): string {
    return contracts.address(this.input.from);
  }

  private get onAddress(): string {
    return contracts.address(this.input.on);
  }

  private get accessControl(): AccessControl {
    return AccessControl__factory.connect(contracts.address(this.input.on));
  }

  private get title(): string {
    return `Revoke "${this.input.role}" on ${this.onAddress} from ${this.fromAddress}`;
  }

  calls(): TitledEvmCall[] {
    const { role, from } = this.input;
    return [
      [
        this.title,
        forward(this.contracts.agent, [call(this.accessControl.revokeRole, [id(role), from])]),
      ],
    ];
  }
  events(): TitledEventChecks[] {
    return [
      [
        this.title,
        event(this.accessControl, "RoleRevoked", {
          args: [id(this.input.role), this.input.from, undefined],
        }),
      ],
    ];
  }
  async test({ it, assert, provider }: OmnibusTestContext): Promise<void> {
    const { role, from } = this.input;

    it(`Role "${role}" was successfully revoked from account ${this.fromAddress} on contract ${this.onAddress}`, async () => {
      const hasPermission = await this.accessControl.connect(provider).hasRole(id(role), from);
      assert.isFalse(hasPermission, "Invalid state after role revoking");
    });
  }
}
