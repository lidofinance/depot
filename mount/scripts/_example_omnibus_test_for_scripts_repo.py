from utils.config import contracts


def test_transfer_for_lucky_wallet():
    assert 10_000 * 10**18 == contracts.ldo_token.balanceOf('0x0000000000000000000000000000000000000777')

