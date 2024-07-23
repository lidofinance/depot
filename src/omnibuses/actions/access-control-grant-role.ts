import { id } from "ethers";
import { AccessControl, AccessControl__factory } from "../../../typechain-types";
import { FormattedEvmCall, call, event, forward } from "../../votes";
import contracts, { NamedContract } from "../../contracts";
import { OmnibusAction, OmnibusHookCtx } from "../omnibus-action";
import { Address } from "../../common/types";
import { OmnibusActionInput } from "../omnibus-action-meta";

interface AccessControlGrantRoleInput extends OmnibusActionInput {
  role: string;
  on: Address | NamedContract;
  to: Address | NamedContract;
  revoked?: boolean;
}

export class AccessControlGrantRole extends OmnibusAction<AccessControlGrantRoleInput> {
  private get accessControl(): AccessControl {
    return AccessControl__factory.connect(contracts.address(this.input.on));
  }

  private get toAddress() {
    return contracts.address(this.input.to);
  }

  private get onAddress() {
    return contracts.address(this.input.on);
  }

  getEVMCall(): FormattedEvmCall {
    const { role, to } = this.input;
    return forward(this.contracts.agent, [call(this.accessControl.grantRole, [id(role), to])]);
  }

  getExpectedEvents() {
    const { role, to } = this.input;
    return [event(this.accessControl, "RoleGranted", { args: [id(role), to, undefined] })];
  }

  async before({ assert, provider }: OmnibusHookCtx): Promise<void> {
    const { role, to } = this.input;
    const hasRole = await this.accessControl.connect(provider).hasRole(id(role), to);
    assert.equal(hasRole, false, `Role "${role}" already granted to ${this.toAddress} on contract ${this.onAddress}`);
  }

  async after({ it, assert, provider }: OmnibusHookCtx): Promise<void> {
    const { role, to, revoked = false } = this.input;
    if (revoked) return;

    it(`Role "${role}" was successfully granted`, async () => {
      const hasPermission = await this.accessControl.connect(provider).hasRole(id(role), to);
      assert.equal(hasPermission, true, "Invalid state after role granting");
    });
  }
}
