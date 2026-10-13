#!/bin/bash
# ============================================================================
# ARGONAUT OS · scripts/claude-start.sh — Paket 361 (13.10.2026)
# Schnellstart fuer Claude im Cloud-Container (NICHT auf Martins Rechner).
# Ersetzt die 15-20 Minuten Handarbeit am Anfang jedes Chats:
#   1. npm ci (Pakete)
#   2. Pruef-Postgres 16 auf Port 5499 (Socket /var/tmp/pg) starten
#   3. Vorlage-Datenbank „vorlage" mit Supabase-Platzhaltern (scripts/pruef-pg/stub.sql),
#      p353_name und den SQL-Dateien der letzten Pakete
#   4. out/ fuer die Tests bauen
# Aufruf (im Hintergrund, waehrend der Startprompt gelesen wird):
#   bash scripts/claude-start.sh > /tmp/claude-start.log 2>&1 &
# Danach je Pruefung:  createdb -h /var/tmp/pg -p 5499 -U postgres -T vorlage <name>
# Prueflaeufe vorhandener Pakete: scripts/pruef-pg/pruefung-p3NN.sh <db>
# ============================================================================
set -u
cd "$(dirname "$0")/.."
WURZEL=$(pwd)
PGBIN=/usr/lib/postgresql/16/bin
P="psql -h /var/tmp/pg -p 5499 -U postgres -q -v ON_ERROR_STOP=1"

echo "[1/4] npm ci"
npm ci --no-audit --no-fund >/dev/null 2>&1 && echo "  ok" || echo "  npm ci FEHLER"

echo "[2/4] Pruef-Postgres"
if [ -x "$PGBIN/initdb" ]; then
  if [ ! -d /var/tmp/pg/data ]; then
    mkdir -p /var/tmp/pg && chown postgres /var/tmp/pg
    su postgres -c "$PGBIN/initdb -D /var/tmp/pg/data -A trust >/dev/null"
  fi
  su postgres -c "$PGBIN/pg_ctl -D /var/tmp/pg/data -o '-p 5499 -k /var/tmp/pg' -l /var/tmp/pg/log start" >/dev/null 2>&1 || true
  sleep 2
  for r in anon authenticated; do $P -d postgres -c "create role $r nologin" >/dev/null 2>&1 || true; done
  $P -d postgres -c "create role service_role nologin bypassrls" >/dev/null 2>&1 || true
  echo "  ok"
else
  echo "  Postgres 16 fehlt (apt-get install postgresql-16)"
fi

echo "[3/4] Vorlage-Datenbank"
su postgres -c "dropdb -h /var/tmp/pg -p 5499 --if-exists vorlage; createdb -h /var/tmp/pg -p 5499 vorlage" 2>/dev/null
$P -d vorlage -f scripts/pruef-pg/stub.sql >/dev/null 2>&1 && echo "  Platzhalter ok" || echo "  Platzhalter FEHLER"
sed -n '/create or replace function public.p353_name/,/^\$\$;/p' supabase-sql/p353-*.sql > /tmp/p353name.sql
$P -d vorlage -f /tmp/p353name.sql >/dev/null 2>&1 && echo "  p353_name ok"
for f in supabase-sql/p358-*.sql supabase-sql/p359-*.sql supabase-sql/p360-*.sql supabase-sql/p362-*.sql; do
  [ -f "$f" ] && { $P -d vorlage -f "$f" >/dev/null 2>&1 && echo "  $(basename $f) ok" || echo "  $(basename $f) FEHLER"; }
done

echo "[4/4] Tests vorbereiten (out/)"
node scripts/tests-bauen.cjs >/dev/null 2>&1 && echo "  ok" || echo "  FEHLER"
echo "FERTIG $(date +%H:%M:%S)"
