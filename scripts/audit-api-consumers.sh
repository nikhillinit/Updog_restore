#!/usr/bin/env bash
# scripts/audit-api-consumers.sh
set -euo pipefail
echo "=== Stage API Consumer Audit ($(date -Iseconds)) ==="

echo -e "\n[1] Code references:"
git grep -nE "/api/(monte-carlo/simulate|portfolio/strategies|funds/.*/companies|deprecations)"       -- :^node_modules :^dist :^build || true

echo -e "\n[2] Access logs (last 7 days): top IPs + UA fragments"
zgrep -E "monte-carlo|portfolio/strategies|/funds/.*/companies" /var/log/nginx/*access*.gz       | awk '{print $1 " " $12}' | sed 's/\"//g'       | awk '{ips[$1]++; uas[$2]++} END {print "IPs:"; for(i in ips) print ips[i], i; print "\nUAs:"; for(u in uas) print uas[u], u}'       | sort -rn | head -50 || true

echo -e "\n[3] Manually classify the above IPs/UAs as internal vs external (VPC ranges, office egress)."
