-- Enable pg_stat_statements extension for query performance monitoring
-- This requires superuser privileges or proper permissions

-- Check if extension is available
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pg_stat_statements'
    ) THEN
        -- Try to create the extension
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
            RAISE NOTICE 'pg_stat_statements extension created successfully';
        EXCEPTION
            WHEN insufficient_privilege THEN
                RAISE NOTICE 'Insufficient privileges to create pg_stat_statements extension. Please ask your DBA to run: CREATE EXTENSION pg_stat_statements;';
            WHEN OTHERS THEN
                RAISE NOTICE 'Failed to create pg_stat_statements extension: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'pg_stat_statements extension already exists';
    END IF;
END
$$;

-- Create index on pg_stat_statements if it exists and we have access
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pg_stat_statements'
    ) THEN
        -- Reset statistics (optional, remove if you want to keep historical data)
        -- SELECT pg_stat_statements_reset();
        RAISE NOTICE 'pg_stat_statements is ready for use';
    END IF;
END
$$;

-- Grant permissions if needed (adjust role name)
-- GRANT SELECT ON pg_stat_statements TO your_app_role;