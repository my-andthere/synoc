#!/usr/bin/env bash
# ============================================================
# SYNOC — start MySQL + the public gateway.
#
#   ./start.sh          start MySQL (if needed) and the gateway on :8000
#   ./start.sh demo     also reseed demo tickets
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'

echo "→ ensuring MySQL is running"

# `mysqladmin ping` without credentials fails for non-root users (socket
# permissions), so probe the TCP endpoint with the app credentials instead.
mysql_up() {
  mysqladmin ping --protocol=TCP -h127.0.0.1 \
    -u"${DB_USER:-synoc}" -p"${DB_PASSWORD:-synoc_password}" >/dev/null 2>&1
}

if ! mysql_up; then
  if ! pgrep -x mysqld >/dev/null 2>&1; then
    echo "  starting mysqld…"
    sudo -n mkdir -p /var/run/mysqld 2>/dev/null || true
    sudo -n chown mysql:mysql /var/run/mysqld 2>/dev/null || true
    sudo -n service mysql start >/dev/null 2>&1 || \
      sudo -n mysqld_safe --user=mysql >/tmp/mysqld_safe.log 2>&1 &
  fi
  for _ in $(seq 1 40); do
    mysql_up && break
    sleep 1
  done
fi

if mysql_up; then
  echo "${GREEN}✓${RESET} MySQL is up"
else
  echo "${RED}✗${RESET} MySQL is not reachable — check /var/log/mysql/error.log"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "→ installing dependencies"
  npm install --silent
fi

if [ "${1:-}" = "demo" ]; then
  echo "→ seeding demo tickets"
  node db/seed-demo.js 24
fi

echo "→ starting public gateway on port ${PORT:-8000}"
exec node src/gateway.js
