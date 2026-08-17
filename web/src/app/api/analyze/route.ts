// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RWARecommendationLogger {
    event RecommendationAnchored(
        address indexed user,
        string summary,
        string symbols,
        uint8 riskScore,
        uint8 confidence,
        uint256 timestamp
    );

    struct Rec {
        address user;
        string summary;
        string symbols;
        uint8 riskScore;
        uint8 confidence;
        uint256 timestamp;
    }

    Rec[] public recommendations;
    mapping(address => uint256[]) public userRecs;

    function anchor(
        string calldata summary,
        string calldata symbols,
        uint8 riskScore,
        uint8 confidence
    ) external {
        recommendations.push(Rec({
            user: msg.sender,
            summary: summary,
            symbols: symbols,
            riskScore: riskScore,
            confidence: confidence,
            timestamp: block.timestamp
        }));
        userRecs[msg.sender].push(recommendations.length - 1);

        emit RecommendationAnchored(
            msg.sender,
            summary,
            symbols,
            riskScore,
            confidence,
            block.timestamp
        );
    }

    function getUserCount(address user) external view returns (uint256) {
        return userRecs[user].length;
    }
}