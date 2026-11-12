# Agent, Dual Governance and Kernel helper example

1. Submit a proposal to upgrade the fixture Kernel app
   1. Forward one call to ACL, temporarily granting Agent `APP_MANAGER_ROLE` on Kernel.
   2. Forward one script containing two calls: update the fixture app's base to implementation V2, then revoke that permission through ACL.
