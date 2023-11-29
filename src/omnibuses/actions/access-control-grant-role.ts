import { id } from "ethers";
import { AccessControl, AccessControl__factory } from "../../../typechain-types";
import {
  OmnibusAction,
  OmnibusBeforeContext,
  OmnibusTestContext,
  TitledEventChecks,
  TitledEvmCall,
} from "../omnibus";
import { call, event, forward } from "../../votes";
import contracts, { NamedContract } from "../../contracts";

interface AccessControlGrantRoleInput {
  role: string;
  on: Address | NamedContract;
  to: Address | NamedContract;
  revoked?: boolean;
}

export class AccessControlGrantRole extends OmnibusAction<AccessControlGrantRoleInput> {
  private get accessControl(): AccessControl {
    return AccessControl__factory.connect(contracts.address(this.input.on));
  }

  private get toAddress(): string {
    return contracts.address(this.input.to);
  }

  private get onAddress(): string {
    return contracts.address(this.input.on);
  }

  calls(): TitledEvmCall[] {
    const { role, to } = this.input;

    return [
      [
        `Grant "${role}" on ${this.onAddress} to ${this.toAddress}`,
        forward(this.contracts.agent, [call(this.accessControl.grantRole, [id(role), to])]),
      ],
    ];
  }

  events(): TitledEventChecks[] {
    return [
      [
        `AccessControl(${this.onAddress}).grantRole()`,
        event(this.accessControl, "RoleGranted", {
          args: [id(this.input.role), this.input.to, undefined],
        }),
      ],
    ];
  }

  async before({ assert, provider }: OmnibusBeforeContext): Promise<void> {
    const { role, to } = this.input;
    const hasRole = await this.accessControl.connect(provider).hasRole(id(role), to);
    assert.isFalse(
      hasRole,
      `Role "${role}" already granted to ${this.toAddress} on contract ${this.onAddress}`,
    );
  }

  async test({ it, assert, provider }: OmnibusTestContext): Promise<void> {
    const { role, to, revoked = false } = this.input;
    if (revoked) return;

    it(`Role "${role}" was successfully granted`, async () => {
      const hasPermission = await this.accessControl.connect(provider).hasRole(id(role), to);
      assert.isTrue(hasPermission, "Invalid state after role granting");
    });
  }
}
