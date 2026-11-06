// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC20VotingPower {
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

contract MockVoting {
    struct Vote {
        bool open;
        bool executed;
        uint64 startDate;
        uint64 snapshotBlock;
        address creator;
        string metadata;
        uint256 yea;
        uint256 nay;
        uint256 votingPower;
    }

    uint64 public constant PCT_BASE = 10 ** 18;
    uint64 public constant supportRequiredPct = 50 * 10 ** 16;
    uint64 public constant minAcceptQuorumPct = 5 * 10 ** 16;

    IERC20VotingPower public immutable token;
    uint256 public votesLength;
    uint64 public voteTime;
    mapping(uint256 => Vote) internal _votes;
    mapping(uint256 => mapping(address => bool)) internal _hasVoted;

    event StartVote(uint256 indexed voteId, address indexed creator, string metadata);
    event CastVote(uint256 indexed voteId, address indexed voter, bool doesSupport, uint256 stake);
    event ExecuteVote(uint256 indexed voteId);

    constructor(uint64 _voteTime, address _token) {
        voteTime = _voteTime;
        token = IERC20VotingPower(_token);
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
            open: true,
            executed: false,
            startDate: uint64(block.timestamp),
            snapshotBlock: uint64(block.number),
            creator: msg.sender,
            metadata: _metadata,
            yea: 0,
            nay: 0,
            votingPower: token.totalSupply()
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
            bytes memory script,
            uint8 phase
        )
    {
        Vote storage storedVote = _votes[_voteId];
        open = storedVote.open;
        executed = storedVote.executed;
        startDate = storedVote.startDate;
        snapshotBlock = storedVote.snapshotBlock;
        supportRequired = supportRequiredPct;
        minAcceptQuorum = minAcceptQuorumPct;
        yea = storedVote.yea;
        nay = storedVote.nay;
        votingPower = storedVote.votingPower;
        script = "";
        phase = _votePhase(storedVote);
    }

    function getVotePhase(uint256 _voteId) external view returns (uint8) {
        return _votePhase(_votes[_voteId]);
    }

    function _votePhase(Vote storage storedVote) private view returns (uint8) {
        return block.timestamp >= storedVote.startDate + voteTime ? 2 : 0;
    }

    function canVote(uint256 _voteId, address _voter) external view returns (bool) {
        return _canVote(_voteId, _voter);
    }

    function vote(
        uint256 _voteId,
        bool _supports,
        bool /* _executesIfDecided */
    ) external {
        require(_canVote(_voteId, msg.sender), "cannot vote");
        Vote storage storedVote = _votes[_voteId];
        uint256 stake = token.balanceOf(msg.sender);
        _hasVoted[_voteId][msg.sender] = true;
        if (_supports) {
            storedVote.yea += stake;
        } else {
            storedVote.nay += stake;
        }
        emit CastVote(_voteId, msg.sender, _supports, stake);
    }

    function canExecute(uint256 _voteId) external view returns (bool) {
        Vote storage storedVote = _votes[_voteId];
        uint256 totalVotes = storedVote.yea + storedVote.nay;
        return storedVote.open && !storedVote.executed && block.timestamp >= storedVote.startDate + voteTime
            && storedVote.yea * PCT_BASE > storedVote.votingPower * minAcceptQuorumPct
            && storedVote.yea * PCT_BASE > totalVotes * supportRequiredPct;
    }

    function executeVote(uint256 _voteId) external {
        require(_votes[_voteId].open, "vote not open");
        _votes[_voteId].open = false;
        _votes[_voteId].executed = true;
        emit ExecuteVote(_voteId);
    }

    function _canVote(uint256 _voteId, address _voter) private view returns (bool) {
        Vote storage storedVote = _votes[_voteId];
        return storedVote.open && !storedVote.executed && block.timestamp < storedVote.startDate + voteTime
            && !_hasVoted[_voteId][_voter] && token.balanceOf(_voter) > 0;
    }
}
