# Permissions and node operators example

1. Renew the Consensys key permission and update its operator settings
   - Through Aragon Agent `0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c`, revoke then restore `MANAGE_SIGNING_KEYS` for `0xF45C77EadD434612fCD93db978B3E36B0D58eC99` on NodeOperatorsRegistry `0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5`, with the constraint `arg0 EQ 21`.
   - Rename operator 21 to `Consensys (Depot test)`.
   - Set its reward address to Aragon Agent `0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c`.
   - Through StakingRouter `0xFdDf38947aFB03C621C71b06C9C70bce73f12999`, set module 1, operator 21 to soft target limit mode 1, count 0.
   - Deactivate operator 21.
