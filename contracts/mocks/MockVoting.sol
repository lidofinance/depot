// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

contract MockVoting {
    struct Vote {
        bool open;
        bool executed;
        uint64 startDate;
        address creator;
        string metadata;
    }

    uint256 public votesLength;
    uint64 public voteTime;
    mapping(uint256 => Vote) internal _votes;

    event StartVote(uint256 indexed voteId, address indexed creator, string metadata);
    event CastVote(uint256 indexed voteId, address indexed voter, bool doesSupport);
    event ExecuteVote(uint256 indexed voteId);

    constructor(uint64 _voteTime) {
        voteTime = _voteTime;
    }

    function newVote(
        bytes calldata,
        /* _executionScript */
        string calldata _metadata,
        bool,
        /* _castVote */
        bool /* _executesIfDecided */
    ) external returns (uint256 voteId) {
        voteId = votesLength++;
        _votes[voteId] = Vote({
            open: true, executed: false, startDate: uint64(block.timestamp), creator: msg.sender, metadata: _metadata
        });
        emit StartVote(voteId, msg.sender, _metadata);
    }

    function getVote(uint256 _voteId)
        external
        view
        returns (
            bool open,
            bool executed,
            uint64 startDate,
            uint64 snapshotBlock,
            uint64 supportRequired,
            uint64 minAcceptQuorum,
            uint256 yea,
            uint256 nay,
            uint256 votingPower,
            bytes memory script
        )
    {
        Vote storage v = _votes[_voteId];
        open = v.open;
        executed = v.executed;
        startDate = v.startDate;
    }

    function canVote(
        uint256 _voteId,
        address /* _voter */
    ) external view returns (bool) {
        return _votes[_voteId].open && !_votes[_voteId].executed;
    }

    function vote(
        uint256 _voteId,
        bool _supports,
        bool /* _executesIfDecided */
    ) external {
        require(_votes[_voteId].open, "vote not open");
        emit CastVote(_voteId, msg.sender, _supports);
    }

    function executeVote(uint256 _voteId) external {
        require(_votes[_voteId].open, "vote not open");
        _votes[_voteId].open = false;
        _votes[_voteId].executed = true;
        emit ExecuteVote(_voteId);
    }
}
