// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RWAAgentRegistry
/// @notice On-chain anchor + lightweight reputation layer for AI-generated RWA
///         analyses on OKX X Layer. Full analysis JSON is stored off-chain; this
///         contract records the compact scores plus keccak256(fullJson) so anyone
///         can verify integrity by re-hashing the payload.
/// @dev No funds are ever held. All writes are user-signed. Minimal attack surface.
contract RWAAgentRegistry {
    enum Recommendation {
        NONE,
        BUY,
        HOLD,
        SELL,
        AVOID
    }

    struct Agent {
        string metadataURI; // e.g. ipfs://... describing the agent/model
        uint64 registeredAt;
        uint64 analysisCount;
        bool active;
    }

    struct Analysis {
        address agent;
        bytes32 contentHash; // keccak256 of the full JSON payload (off-chain)
        uint64 timestamp;
        uint8 riskScore; // 0-100
        uint8 liquidityScore; // 0-100
        uint8 yieldPotential; // 0-100
        int8 sentimentScore; // -100..100
        uint8 confidence; // 0-100
        Recommendation recommendation;
        string assetSymbol;
    }

    address public owner;

    mapping(address => Agent) public agents;
    mapping(bytes32 => Analysis) public analyses; // analysisId => Analysis
    mapping(bytes32 => uint256) public endorsements;
    mapping(bytes32 => uint256) public disputes;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    event AgentRegistered(address indexed agent, string metadataURI);
    event AgentDeactivated(address indexed agent);
    event AnalysisLogged(
        bytes32 indexed analysisId,
        address indexed agent,
        string assetSymbol,
        Recommendation recommendation,
        uint8 confidence,
        bytes32 contentHash
    );
    event AnalysisVoted(bytes32 indexed analysisId, address indexed voter, bool endorse);

    error NotOwner();
    error NotActiveAgent();
    error AnalysisExists();
    error UnknownAnalysis();
    error AlreadyVoted();
    error InvalidScore();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Register (or update) the caller as an analyst agent.
    function registerAgent(string calldata metadataURI) external {
        Agent storage a = agents[msg.sender];
        a.metadataURI = metadataURI;
        a.active = true;
        if (a.registeredAt == 0) a.registeredAt = uint64(block.timestamp);
        emit AgentRegistered(msg.sender, metadataURI);
    }

    /// @notice Owner can deactivate a misbehaving agent.
    function deactivateAgent(address agent) external onlyOwner {
        agents[agent].active = false;
        emit AgentDeactivated(agent);
    }

    /// @notice Anchor an analysis on-chain. `analysisId` should be unique
    ///         (e.g. keccak256 of agent + timestamp + symbol) and MUST NOT collide.
    function logAnalysis(
        bytes32 analysisId,
        string calldata assetSymbol,
        uint8 riskScore,
        uint8 liquidityScore,
        uint8 yieldPotential,
        int8 sentimentScore,
        uint8 confidence,
        Recommendation recommendation,
        bytes32 contentHash
    ) external {
        if (!agents[msg.sender].active) revert NotActiveAgent();
        if (analyses[analysisId].timestamp != 0) revert AnalysisExists();
        if (riskScore > 100 || liquidityScore > 100 || yieldPotential > 100 || confidence > 100) {
            revert InvalidScore();
        }
        if (sentimentScore < -100 || sentimentScore > 100) revert InvalidScore();

        analyses[analysisId] = Analysis({
            agent: msg.sender,
            contentHash: contentHash,
            timestamp: uint64(block.timestamp),
            riskScore: riskScore,
            liquidityScore: liquidityScore,
            yieldPotential: yieldPotential,
            sentimentScore: sentimentScore,
            confidence: confidence,
            recommendation: recommendation,
            assetSymbol: assetSymbol
        });
        agents[msg.sender].analysisCount += 1;

        emit AnalysisLogged(analysisId, msg.sender, assetSymbol, recommendation, confidence, contentHash);
    }

    /// @notice One endorse/dispute vote per address per analysis.
    function voteAnalysis(bytes32 analysisId, bool endorse) external {
        if (analyses[analysisId].timestamp == 0) revert UnknownAnalysis();
        if (hasVoted[analysisId][msg.sender]) revert AlreadyVoted();
        hasVoted[analysisId][msg.sender] = true;
        if (endorse) endorsements[analysisId] += 1;
        else disputes[analysisId] += 1;
        emit AnalysisVoted(analysisId, msg.sender, endorse);
    }

    function getAnalysis(bytes32 analysisId) external view returns (Analysis memory) {
        return analyses[analysisId];
    }

    function reputation(bytes32 analysisId) external view returns (uint256 up, uint256 down) {
        return (endorsements[analysisId], disputes[analysisId]);
    }
}
