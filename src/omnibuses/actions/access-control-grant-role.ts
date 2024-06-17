import { id } from "ethers";
import { AccessControl, AccessControl__factory } from "../../../typechain-types";
import { FormattedEvmCall, call, event, forward } from "../../votes";
import contracts, { NamedContract } from "../../contracts";
import { OmnibusItem, OmnibusHookCtx } from "../omnibus-item";
import { Address } from "../../common/types";

interface AccessControlGrantRoleInput {
  role: string;
  on: Address | NamedContract;
  to: Address | NamedContract;
  revoked?: boolean;
}

export class AccessControlGrantRole extends OmnibusItem<AccessControlGrantRoleInput> {
  get title(): string {
    const { role } = this.input;

    return `Grant "${role}" on ${this.onAddress} to ${this.toAddress}`;
  }
  get call(): FormattedEvmCall {
    const { role, to } = this.input;
    return forward(this.contracts.agent, [call(this.accessControl.grantRole, [id(role), to])]);
  }

  private get accessControl(): AccessControl {
    return AccessControl__factory.connect(contracts.address(this.input.on));
  }

  private get toAddress() {
    return contracts.address(this.input.to);
  }

  private get onAddress() {
    return contracts.address(this.input.on);
  }

  get events() {
    const { role, to } = this.input;
    return [event(this.accessControl, "RoleGranted", { args: [id(role), to, undefined] })];
  }

  async before({ assert, provider }: OmnibusHookCtx): Promise<void> {
    const { role, to } = this.input;
    const hasRole = await this.accessControl.connect(provider).hasRole(id(role), to);
    assert.isFalse(hasRole, `Role "${role}" already granted to ${this.toAddress} on contract ${this.onAddress}`);
  }

  async after({ it, assert, provider }: OmnibusHookCtx): Promise<void> {
    const { role, to, revoked = false } = this.input;
    if (revoked) return;

    it(`Role "${role}" was successfully granted`, async () => {
      const hasPermission = await this.accessControl.connect(provider).hasRole(id(role), to);
      assert.isTrue(hasPermission, "Invalid state after role granting");
    });
  }
}
