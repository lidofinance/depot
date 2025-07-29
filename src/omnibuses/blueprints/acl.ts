import { Address } from "abitype";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { OmniScriptCtx } from "../tools/create-omnibus";
import { HexStrPrefixed } from "../../common/bytes";

interface GrantPermissionInput {
  title: string;
  entity: Address;
  app: Address;
  role: HexStrPrefixed;
}

function grantPermission(ctx: OmniScriptCtx, input: GrantPermissionInput): OmnibusDirectCall {
  const {
    contracts: { acl },
    call,
  } = ctx;
  return call(acl, "grantPermission", [input.entity, input.app, input.role], {
    title: input.title,
    events: [],
  });
}

export default {
  grantPermission,
};
