import { BaseContract, id } from "ethers";
import contracts from "../../contracts";
import { AccessControl, AccessControl__factory } from "../../../typechain-types";
import { forward, call, event } from "../../votes";
import { OmnibusItem, OmnibusHookCtx } from "../omnibus-item";

interface AccessControlRevokeRoleInput {
  on: Address | BaseContract;
  from: Address | BaseContract;
  role: string;
}

export class AccessControlRevokeRole extends OmnibusItem<AccessControlRevokeRoleInput> {
  get call() {
    const { role, from } = this.input;
    return forward(this.contracts.agent, [call(this.accessControl.revokeRole, [id(role), from])]);
  }
  public get title(): string {
    return `Revoke "${this.input.role}" on ${this.onAddress} from ${this.fromAddress}`;
  }

  get events() {
    return [
      event(this.accessControl, "RoleRevoked", {
        args: [id(this.input.role), this.input.from, undefined],
      }),
    ];
  }

  async after({ it, assert, provider }: OmnibusHookCtx): Promise<void> {
    const { role, from } = this.input;

    it(`Role "${role}" was successfully revoked from account ${this.fromAddress} on contract ${this.onAddress}`, async () => {
      const hasPermission = await this.accessControl.connect(provider).hasRole(id(role), from);
      assert.isFalse(hasPermission, "Invalid state after role revoking");
    });
  }

  private get fromAddress(): string {
    return contracts.address(this.input.from);
  }

  private get onAddress(): string {
    return contracts.address(this.input.on);
  }

  private get accessControl(): AccessControl {
    return AccessControl__factory.connect(contracts.address(this.input.on));
  }
}
