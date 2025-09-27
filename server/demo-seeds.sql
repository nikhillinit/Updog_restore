-- Enhanced demo seed data scenarios for MVP presentation
-- Creates compelling fund examples that showcase different strategies

-- Clear existing demo data first
DELETE FROM fund_models WHERE id LIKE 'demo-%';

-- Demo Fund 1: Early-Stage SaaS Fund (Conservative Growth)
INSERT INTO fund_models (id, name, currency, waterfall, model_version, version, state, created_at, updated_at) VALUES
(
    'demo-saas-001',
    'SaaS Ventures I',
    'USD',
    'american',
    1,
    1,
    '{
        "foundation": {
            "startDate": "2024-01-01",
            "termMonths": 120
        },
        "capital": {
            "totalCommitment": 15000000
        },
        "fees": {
            "managementFee": 0.02,
            "carryPercentage": 0.20
        },
        "investmentStrategy": {
            "allocations": [
                {"id": "preseed", "category": "Pre-Seed", "percentage": 25},
                {"id": "seed", "category": "Seed", "percentage": 40},
                {"id": "series_a", "category": "Series A", "percentage": 30},
                {"id": "series_b", "category": "Series B+", "percentage": 5}
            ],
            "stages": [
                {"id": "preseed", "name": "Pre-Seed", "graduationRate": 20, "exitRate": 5},
                {"id": "seed", "name": "Seed", "graduationRate": 35, "exitRate": 10},
                {"id": "series_a", "name": "Series A", "graduationRate": 50, "exitRate": 25},
                {"id": "series_b", "name": "Series B+", "graduationRate": 0, "exitRate": 65}
            ]
        },
        "followOnRules": [
            {
                "from": "preseed",
                "to": "seed",
                "mode": "maintain_ownership",
                "participationPct": 80,
                "targetOwnershipPct": 12,
                "nextRoundSize": 5000000
            },
            {
                "from": "seed",
                "to": "series_a",
                "mode": "fixed_check",
                "participationPct": 60,
                "fixedAmount": 750000
            }
        ],
        "marketAssumptions": {
            "avgExitMultiple": 8.5,
            "avgTimeToExit": 6.5,
            "reserveRatio": 0.35
        }
    }',
    NOW(),
    NOW()
);

-- Demo Fund 2: Climate Pre-Seed Fund (High Risk/Reward)
INSERT INTO fund_models (id, name, currency, waterfall, model_version, version, state, created_at, updated_at) VALUES
(
    'demo-climate-002',
    'Climate Innovation Fund',
    'USD',
    'american',
    1,
    1,
    '{
        "foundation": {
            "startDate": "2024-06-01",
            "termMonths": 144
        },
        "capital": {
            "totalCommitment": 20000000
        },
        "fees": {
            "managementFee": 0.025,
            "carryPercentage": 0.25
        },
        "investmentStrategy": {
            "allocations": [
                {"id": "preseed", "category": "Pre-Seed", "percentage": 60},
                {"id": "seed", "category": "Seed", "percentage": 30},
                {"id": "series_a", "category": "Series A", "percentage": 10}
            ],
            "stages": [
                {"id": "preseed", "name": "Pre-Seed", "graduationRate": 15, "exitRate": 3},
                {"id": "seed", "name": "Seed", "graduationRate": 25, "exitRate": 8},
                {"id": "series_a", "name": "Series A", "graduationRate": 0, "exitRate": 45}
            ]
        },
        "followOnRules": [
            {
                "from": "preseed",
                "to": "seed",
                "mode": "maintain_ownership",
                "participationPct": 70,
                "targetOwnershipPct": 15,
                "nextRoundSize": 3000000
            }
        ],
        "marketAssumptions": {
            "avgExitMultiple": 12.0,
            "avgTimeToExit": 8.0,
            "reserveRatio": 0.25
        }
    }',
    NOW(),
    NOW()
);

-- Demo Fund 3: Growth Equity Fund (Later Stage)
INSERT INTO fund_models (id, name, currency, waterfall, model_version, version, state, created_at, updated_at) VALUES
(
    'demo-growth-003',
    'Growth Capital Partners II',
    'USD',
    'american',
    1,
    1,
    '{
        "foundation": {
            "startDate": "2024-03-01",
            "termMonths": 96
        },
        "capital": {
            "totalCommitment": 50000000
        },
        "fees": {
            "managementFee": 0.02,
            "carryPercentage": 0.20
        },
        "investmentStrategy": {
            "allocations": [
                {"id": "series_a", "category": "Series A", "percentage": 20},
                {"id": "series_b", "category": "Series B", "percentage": 50},
                {"id": "series_c", "category": "Series C+", "percentage": 30}
            ],
            "stages": [
                {"id": "series_a", "name": "Series A", "graduationRate": 60, "exitRate": 15},
                {"id": "series_b", "name": "Series B", "graduationRate": 45, "exitRate": 35},
                {"id": "series_c", "name": "Series C+", "graduationRate": 0, "exitRate": 80}
            ]
        },
        "followOnRules": [
            {
                "from": "series_a",
                "to": "series_b",
                "mode": "fixed_check",
                "participationPct": 80,
                "fixedAmount": 2000000
            },
            {
                "from": "series_b",
                "to": "series_c",
                "mode": "maintain_ownership",
                "participationPct": 60,
                "targetOwnershipPct": 8,
                "nextRoundSize": 25000000
            }
        ],
        "marketAssumptions": {
            "avgExitMultiple": 4.5,
            "avgTimeToExit": 4.0,
            "reserveRatio": 0.45
        }
    }',
    NOW(),
    NOW()
);

-- Demo Fund 4: "What-If" Scenario (SaaS with Different Strategy)
INSERT INTO fund_models (id, name, currency, waterfall, model_version, version, state, created_at, updated_at) VALUES
(
    'demo-whatif-004',
    'SaaS Ventures I (Alt Strategy)',
    'USD',
    'american',
    1,
    1,
    '{
        "foundation": {
            "startDate": "2024-01-01",
            "termMonths": 120
        },
        "capital": {
            "totalCommitment": 15000000
        },
        "fees": {
            "managementFee": 0.02,
            "carryPercentage": 0.20
        },
        "investmentStrategy": {
            "allocations": [
                {"id": "preseed", "category": "Pre-Seed", "percentage": 20},
                {"id": "seed", "category": "Seed", "percentage": 45},
                {"id": "series_a", "category": "Series A", "percentage": 30},
                {"id": "series_b", "category": "Series B+", "percentage": 5}
            ],
            "stages": [
                {"id": "preseed", "name": "Pre-Seed", "graduationRate": 25, "exitRate": 5},
                {"id": "seed", "name": "Seed", "graduationRate": 40, "exitRate": 10},
                {"id": "series_a", "name": "Series A", "graduationRate": 55, "exitRate": 20},
                {"id": "series_b", "name": "Series B+", "graduationRate": 0, "exitRate": 70}
            ]
        },
        "followOnRules": [
            {
                "from": "preseed",
                "to": "seed",
                "mode": "fixed_check",
                "participationPct": 85,
                "fixedAmount": 400000
            },
            {
                "from": "seed",
                "to": "series_a",
                "mode": "maintain_ownership",
                "participationPct": 70,
                "targetOwnershipPct": 10,
                "nextRoundSize": 12000000
            }
        ],
        "marketAssumptions": {
            "avgExitMultiple": 9.2,
            "avgTimeToExit": 6.0,
            "reserveRatio": 0.40
        }
    }',
    NOW(),
    NOW()
);

-- Demo Fund 5: Evergreen Fund Example
INSERT INTO fund_models (id, name, currency, waterfall, model_version, version, state, created_at, updated_at) VALUES
(
    'demo-evergreen-005',
    'Perpetual Ventures',
    'USD',
    'american',
    1,
    1,
    '{
        "foundation": {
            "startDate": "2024-09-01",
            "termMonths": null
        },
        "capital": {
            "totalCommitment": 25000000
        },
        "fees": {
            "managementFee": 0.022,
            "carryPercentage": 0.22
        },
        "investmentStrategy": {
            "allocations": [
                {"id": "preseed", "category": "Pre-Seed", "percentage": 35},
                {"id": "seed", "category": "Seed", "percentage": 35},
                {"id": "series_a", "category": "Series A", "percentage": 25},
                {"id": "series_b", "category": "Series B+", "percentage": 5}
            ],
            "stages": [
                {"id": "preseed", "name": "Pre-Seed", "graduationRate": 18, "exitRate": 7},
                {"id": "seed", "name": "Seed", "graduationRate": 32, "exitRate": 13},
                {"id": "series_a", "name": "Series A", "graduationRate": 48, "exitRate": 27},
                {"id": "series_b", "name": "Series B+", "graduationRate": 0, "exitRate": 62}
            ]
        },
        "followOnRules": [
            {
                "from": "preseed",
                "to": "seed",
                "mode": "maintain_ownership",
                "participationPct": 75,
                "targetOwnershipPct": 14,
                "nextRoundSize": 4500000
            },
            {
                "from": "seed",
                "to": "series_a",
                "mode": "maintain_ownership",
                "participationPct": 65,
                "targetOwnershipPct": 9,
                "nextRoundSize": 15000000
            }
        ],
        "marketAssumptions": {
            "avgExitMultiple": 7.8,
            "avgTimeToExit": 7.2,
            "reserveRatio": 0.38,
            "isEvergreen": true
        }
    }',
    NOW(),
    NOW()
);