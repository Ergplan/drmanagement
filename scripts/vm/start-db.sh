#!/usr/bin/env bash
# Starts PostgreSQL 17 on the VM for globe.joulewise.tech. Safe to run again.
# Creates .env.db with random passwords (never leaves the VM), a TLS certificate for the VM's static IP,
# then prints the two values to paste into Vercel: DATABASE_URL and PG_CA_CERT.
set -euo pipefail
cd "$(dirname "$0")/../.."
IP=$(curl -fs -H Metadata-Flavor:Google http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
[ -n "$IP" ] || { echo "Could not read the VM's external IP from the metadata server."; exit 1; }

if [ ! -f .env.db ]; then
  umask 077
  printf 'POSTGRES_USER=drm_admin\nPOSTGRES_PASSWORD=%s\nAPP_PASSWORD=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > .env.db
  echo "Created .env.db (passwords stay on this VM)."
fi

if [ ! -f /data/pg-certs/server.crt ]; then
  sudo mkdir -p /data/pg-certs
  sudo openssl req -x509 -newkey rsa:3072 -nodes -days 1095 \
    -keyout /data/pg-certs/server.key -out /data/pg-certs/server.crt \
    -subj "/CN=$IP" -addext "subjectAltName=IP:$IP" >/dev/null 2>&1
  sudo chown 999:999 /data/pg-certs/server.key /data/pg-certs/server.crt   # postgres user inside the image
  sudo chmod 600 /data/pg-certs/server.key
  sudo chmod 644 /data/pg-certs/server.crt
  echo "Created a TLS certificate for $IP (valid 3 years)."
fi
# The umask above would leave these 700 root; the postgres user (uid 999) must be able to enter them.
sudo chmod 755 /data /data/pg-certs

docker compose -f docker-compose.db.yml up -d
echo -n "Waiting for Postgres"; for _ in $(seq 1 30); do
  if docker compose -f docker-compose.db.yml exec -T db pg_isready -q -d drm; then echo " ready."; break; fi; echo -n "."; sleep 2
done

APP_PASSWORD=$(grep '^APP_PASSWORD=' .env.db | cut -d= -f2)
echo
echo "Add these two in Vercel → drmanagement → Settings → Environment Variables (all environments, type Sensitive):"
echo
echo "DATABASE_URL=postgres://drm_app:${APP_PASSWORD}@${IP}:5432/drm?sslmode=verify-full"
echo
echo "PG_CA_CERT=$(sudo base64 -w0 /data/pg-certs/server.crt)"
echo
echo "Then redeploy (Deployments → ⋯ → Redeploy). Test from the VM: psql \"postgres://drm_app:...@${IP}:5432/drm?sslmode=require\""
