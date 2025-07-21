-- Initial schema migration for POVC Fund Model
-- Generated: 2025-01-19

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funds (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    size DECIMAL(15,2) NOT NULL,
    deployed_capital DECIMAL(15,2) DEFAULT 0,
    management_fee DECIMAL(5,4) NOT NULL,
    carry_percentage DECIMAL(5,4) NOT NULL,
    vintage_year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_companies (
    id SERIAL PRIMARY KEY,
    fund_id INTEGER REFERENCES funds(id),
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    stage TEXT NOT NULL,
    investment_amount DECIMAL(15,2) NOT NULL,
    current_valuation DECIMAL(15,2),
    founded_year INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investments (
    id SERIAL PRIMARY KEY,
    fund_id INTEGER REFERENCES funds(id),
    company_id INTEGER REFERENCES portfolio_companies(id),
    investment_date TIMESTAMP NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    round TEXT NOT NULL,
    ownership_percentage DECIMAL(5,4),
    valuation_at_investment DECIMAL(15,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fund_metrics (
    id SERIAL PRIMARY KEY,
    fund_id INTEGER REFERENCES funds(id),
    metric_date DATE NOT NULL,
    total_value DECIMAL(15,2) NOT NULL,
    irr DECIMAL(5,4),
    multiple DECIMAL(5,4),
    dpi DECIMAL(5,4),
    tvpi DECIMAL(5,4),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    fund_id INTEGER REFERENCES funds(id),
    company_id INTEGER REFERENCES portfolio_companies(id),
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    activity_date DATE NOT NULL,
    amount DECIMAL(15,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_portfolio_companies_fund_id ON portfolio_companies(fund_id);
CREATE INDEX IF NOT EXISTS idx_investments_fund_id ON investments(fund_id);
CREATE INDEX IF NOT EXISTS idx_investments_company_id ON investments(company_id);
CREATE INDEX IF NOT EXISTS idx_fund_metrics_fund_id ON fund_metrics(fund_id);
CREATE INDEX IF NOT EXISTS idx_activities_fund_id ON activities(fund_id);
CREATE INDEX IF NOT EXISTS idx_activities_company_id ON activities(company_id);