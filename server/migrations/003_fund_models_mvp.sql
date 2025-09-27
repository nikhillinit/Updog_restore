-- MVP Fund Models Table with Optimistic Locking
-- This supports the lean MVP approach with JSONB storage and version control

CREATE TABLE IF NOT EXISTS fund_models (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    waterfall VARCHAR(16) NOT NULL DEFAULT 'american',
    model_version INT NOT NULL DEFAULT 1,
    version INT NOT NULL DEFAULT 1, -- Optimistic locking
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS fund_models_name_idx ON fund_models (name);
CREATE INDEX IF NOT EXISTS fund_models_version_idx ON fund_models (id, version);

-- Insert demo seed data for MVP
INSERT INTO fund_models (id, name, currency, waterfall, model_version, version, state, created_at, updated_at) VALUES
(
    'demo-fund-001',
    'Early-Stage SaaS Fund',
    'USD',
    'american',
    1,
    1,
    '{
        "foundation": {"startDate": "2024-01-01", "termMonths": 120},
        "capital": {"totalCommitment": 15000000},
        "fees": {"managementFee": 0.02, "carryPercentage": 0.20},
        "investmentStrategy": {
            "allocations": [
                {"id": "preseed", "category": "Pre-Seed", "percentage": 25},
                {"id": "seed", "category": "Seed", "percentage": 40},
                {"id": "series_a", "category": "Series A", "percentage": 35}
            ],
            "stages": [
                {"id": "preseed", "name": "Pre-Seed", "graduationRate": 20, "exitRate": 5},
                {"id": "seed", "name": "Seed", "graduationRate": 35, "exitRate": 10},
                {"id": "series_a", "name": "Series A", "graduationRate": 0, "exitRate": 65}
            ]
        },
        "followOnRules": [
            {"from": "preseed", "to": "seed", "mode": "maintain_ownership", "participationPct": 80, "targetOwnershipPct": 12},
            {"from": "seed", "to": "series_a", "mode": "fixed_check", "participationPct": 60, "fixedAmount": 500000}
        ]
    }',
    NOW(),
    NOW()
),
(
    'demo-fund-002',
    'Climate Pre-Seed Fund',
    'USD',
    'american',
    1,
    1,
    '{
        "foundation": {"startDate": "2024-06-01", "termMonths": 144},
        "capital": {"totalCommitment": 20000000},
        "fees": {"managementFee": 0.025, "carryPercentage": 0.25},
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
            {"from": "preseed", "to": "seed", "mode": "maintain_ownership", "participationPct": 70, "targetOwnershipPct": 15}
        ]
    }',
    NOW(),
    NOW()
);