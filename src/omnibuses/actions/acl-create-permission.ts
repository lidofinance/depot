import { id } from "ethers";
import { Address } from "../../common/types";
import { NamedContract } from "../../contracts";
import { OmnibusAction, OmnibusTestContext, TitledEventChecks, TitledEvmCall } from "../omnibus";
import { call } from "../../votes";

interface AclCreatePermissionInput {
  app: NamedContract;
  role: string;
  entity: Address | NamedContract;
  manager: Address | NamedContract;
}

export class AclCreatePermission extends OmnibusAction<AclCreatePermissionInput> {
  calls(): TitledEvmCall[] {
    const { acl } = this.contracts;
    const { entity, app, role, manager } = this.input;
    return [["Create permission", call(acl.createPermission, [entity, app, id(role), manager])]];
  }
  events(): TitledEventChecks[] {
    throw new Error("Method not implemented.");
  }
  test(ctx: OmnibusTestContext): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
