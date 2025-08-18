WITH usage_stats AS (
  SELECT user_id,
         AVG(daily_cost) AS avg_cost,
         STDDEV(daily_cost) AS stddev_cost,
         MAX(daily_cost) AS max_cost,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY daily_cost) AS p95_cost
  FROM usage_history
  WHERE date > NOW() - INTERVAL '90 days'
    AND date NOT IN (SELECT date FROM platform_incidents)
  GROUP BY user_id
)
SELECT user_id,
       CASE WHEN max_cost > avg_cost + (3 * stddev_cost) THEN p95_cost
            ELSE avg_cost * 1.5 END AS initial_limit
FROM usage_stats;
