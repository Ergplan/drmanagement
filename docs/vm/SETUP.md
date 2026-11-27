# VM setup · drmanagement (GCP project replanner-513407, asia-south2-b)

You work only from **Cloud Shell** (the >_ icon at the top of the Google Cloud console). Paste each block as one piece. Every block is safe to run twice.

What needs fixing on the VM as it is now:
- Boot disk is 10 GB: Docker, node_modules and Playwright fill it within the first stage. Grow it to 50 GB (online, no restart).
- External IP 34.131.108.75 is ephemeral: it changes if the VM ever stops. Promote it to static (no restart).
- No network tag and no SSH rule: add tag `drmanagement` and allow SSH only through Google's IAP range.
- Postgres runs on this VM (not Neon), so Vercel must reach port 5432. The rule below opens 5432 to the internet for this VM only; the database accepts TLS connections only (verified certificate for the static IP) with a strong SCRAM password, and the app uses a non-superuser role. The edge itself needs no inbound ports.

## Step 1 · Cloud Shell: fix up the VM (no downtime)

```bash
(
set -e
gcloud config set project replanner-513407 >/dev/null
PROJECT=replanner-513407; REGION=asia-south2; ZONE=asia-south2-b; VM=drmanagement
gcloud services enable compute.googleapis.com iap.googleapis.com >/dev/null
IP=$(gcloud compute instances describe "$VM" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
[ -n "$IP" ] || { echo "$VM has no external IP. Is it running in $ZONE?"; exit 1; }; echo "VM IP: $IP"
gcloud compute addresses describe drm-ip --region="$REGION" >/dev/null 2>&1 || gcloud compute addresses create drm-ip --region="$REGION" --addresses="$IP"
DISK=$(gcloud compute instances describe "$VM" --zone="$ZONE" --format='get(disks[0].source)' | xargs basename)
if [ "$(gcloud compute disks describe "$DISK" --zone="$ZONE" --format='get(sizeGb)')" -lt 50 ]; then
  gcloud compute disks resize "$DISK" --zone="$ZONE" --size=50GB --quiet
fi
gcloud compute instances add-tags "$VM" --zone="$ZONE" --tags=drmanagement
gcloud compute firewall-rules describe drm-allow-iap-ssh >/dev/null 2>&1 || gcloud compute firewall-rules create drm-allow-iap-ssh \
  --network=default --priority=800 --direction=INGRESS --action=allow --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 --target-tags=drmanagement
gcloud compute firewall-rules describe drm-deny-other-ssh >/dev/null 2>&1 || gcloud compute firewall-rules create drm-deny-other-ssh \
  --network=default --priority=900 --direction=INGRESS --action=deny --rules=tcp:22 \
  --source-ranges=0.0.0.0/0 --target-tags=drmanagement
gcloud compute firewall-rules describe drm-allow-postgres >/dev/null 2>&1 || gcloud compute firewall-rules create drm-allow-postgres \
  --network=default --priority=1000 --direction=INGRESS --action=allow --rules=tcp:5432 \
  --source-ranges=0.0.0.0/0 --target-tags=drmanagement
echo "Static IP: $(gcloud compute addresses describe drm-ip --region=$REGION --format='get(address)')  Disk: $(gcloud compute disks describe $DISK --zone=$ZONE --format='get(sizeGb)') GB"
echo "Done. Next: gcloud compute ssh drmanagement --zone=asia-south2-b --tunnel-through-iap"
)
```

Success looks like: `Static IP: 34.131.108.75  Disk: 50 GB`.

Why 5432 is open to everyone: Vercel functions do not come from fixed addresses (fixed IPs are a paid Vercel add-on). If you enable Vercel Static IPs later, narrow `drm-allow-postgres` to those addresses.

Optional, later: the VM runs as the default compute service account with default scopes. That is acceptable for a build box. Changing it needs a stop; not required for this build.

## Step 2 · Cloud Shell: connect

```bash
gcloud compute ssh drmanagement --zone=asia-south2-b --tunnel-through-iap
```

## Step 3 · On the VM: bootstrap (one paste)

It pauses twice for sign-ins: GitHub prints a code to enter at github.com/login/device; gcloud prints a URL to open on your laptop and a code to paste back here. "Failed to open a web browser" is expected.

```bash
(
set -e
REPO=Ergplan/drmanagement
sudo apt-get update -y && sudo apt-get install -y git curl wget ca-certificates gnupg build-essential jq tmux unzip cloud-guest-utils sqlite3
ROOT=$(findmnt -n -o SOURCE /); sudo growpart /dev/$(lsblk -no pkname "$ROOT") "${ROOT##*[a-z]}" || true; sudo resize2fs "$ROOT"; df -h / | tail -1
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm vercel @openai/codex chokidar-cli
sudo mkdir -p -m 755 /etc/apt/keyrings
wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
sudo apt-get update -y && sudo apt-get install -y gh
command -v gcloud >/dev/null || sudo apt-get install -y google-cloud-cli
curl -fsSL https://claude.ai/install.sh | bash
grep -q '.local/bin' ~/.bashrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
gh auth status >/dev/null 2>&1 || gh auth login --hostname github.com --git-protocol https --web
gcloud auth login --no-launch-browser
sudo mkdir -p /work && sudo chown -R $USER:$USER /work
cd /work && { [ -d drmanagement ] || gh repo clone "$REPO"; }
echo "Done. Node $(node -v). Now run these one at a time: newgrp docker   then   tmux new -s build"
)
```

## Step 4 · On the VM: check, then start Claude Code

```bash
newgrp docker
```
```bash
tmux new -s build
```
```bash
docker run --rm hello-world | head -2; node -v; pnpm -v; vercel --version; claude --version; df -h / | tail -1; echo "API key: [$ANTHROPIC_API_KEY]"
```

Expect "Hello from Docker!", Node 24, versions for pnpm, vercel and claude, a ~50 GB disk, and `API key: []` (so Claude Code uses your subscription, not API billing).

Unzip the build kit into the repo, commit it, then start:

```bash
cd /work/drmanagement && claude
```

Inside Claude Code: `/login` (your Max plan), `/status` to confirm, then:

```
Run Stage 0 of docs/MASTER-PROMPT.md
```

Coming back later from any browser: Cloud Shell → Step 2 line → `tmux attach -t build`. Ctrl+B then D detaches without stopping the agent; Ctrl+B then C opens a second window (for `nano .env`, or the parallel Street View track).

## Step 5 · On the VM: start the database and the edge

```bash
cd /work/drmanagement && git pull && bash scripts/vm/start-db.sh
```

It creates the passwords and TLS certificate on the VM, starts PostgreSQL 17, and prints `DATABASE_URL` and `PG_CA_CERT`. Copy those two into Vercel (Settings → Environment Variables, all environments, type Sensitive). They are printed only in your VM terminal; do not paste them into a chat.

Then load the schema, the site's reference data, the demo users and 35 days of simulated history (takes about a minute; it asks for the demo password you set in Vercel):

```bash
cd /work/drmanagement && bash scripts/vm/init-data.sh
```

Then the edge:

```bash
cd /work/drmanagement && cp -n .env.example .env && nano .env
```

Set `CLOUD_URL=https://globe.joulewise.tech`, `DEVICE_ID=edge-globe-lko-01` and `DEVICE_SECRET` (the same value as `EDGE_DEVICE_SECRET` in Vercel). Save with Ctrl+O, Enter, Ctrl+X. Then:

```bash
docker compose -f docker-compose.edge.yml up -d --build && docker compose -f docker-compose.edge.yml logs -f edge
```

Expect `edge 0.3.0 · edge-globe-lko-01 → https://globe.joulewise.tech · drivers sim` and no `uplink failed` lines. Ctrl+C stops following the log; the edge keeps running. The stack has two containers: `edge` (drivers, control loop, uplink) and `pdf` (headless Chromium that prints report PDFs; it has no open port).

In Vercel also set `CRON_SECRET` (any long random value, type Sensitive) so the daily settlement and report job can run.

## Starting, stopping and checking the VM

The VM is running now. Both stacks restart by themselves when the VM boots (`restart: unless-stopped`, Docker starts at boot).

From Cloud Shell:

```bash
gcloud compute instances start drmanagement --zone=asia-south2-b      # start (keeps the static IP)
gcloud compute instances stop drmanagement --zone=asia-south2-b       # stop (site goes offline: no database)
gcloud compute instances describe drmanagement --zone=asia-south2-b --format='get(status)'
```

On the VM:

```bash
cd /work/drmanagement
docker compose -f docker-compose.db.yml ps            # database health
docker compose -f docker-compose.edge.yml ps          # edge health
docker compose -f docker-compose.edge.yml logs --tail 20 edge
```

Do not stop the VM while the site is in use: the database lives on it. Daily disk snapshots (schedule `default-schedule-1`) already cover the disk; Stage 8 adds a nightly database backup to Cloud Storage.

## Getting the build kit onto the VM

Easiest: push the kit to the repo from your laptop (or ask Claude to push it to Ergplan/drmanagement), then the bootstrap's clone already has it. Or in Cloud Shell: upload the zip (⋮ → Upload), then `gcloud compute scp drm-build-kit.zip drmanagement:/work/ --zone=asia-south2-b --tunnel-through-iap` and on the VM `cd /work/drmanagement && unzip -o ../drm-build-kit.zip && git add -A && git commit -m "Build kit" && git push`.

## Backups (Cloud Shell, once)

```bash
( set -e
P=$(gcloud config get-value project); B="${P}-drm-backups"
gcloud storage buckets describe gs://$B >/dev/null 2>&1 || gcloud storage buckets create gs://$B --location=asia-south2 --uniform-bucket-level-access
printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}' > /tmp/lc.json && gcloud storage buckets update gs://$B --lifecycle-file=/tmp/lc.json
SA=$(gcloud compute instances describe drmanagement --zone asia-south2-b --format='value(serviceAccounts[0].email)')
gcloud storage buckets add-iam-policy-binding gs://$B --member="serviceAccount:$SA" --role=roles/storage.objectAdmin >/dev/null
echo "Bucket gs://$B ready (30-day retention); VM account $SA can write to it." )
```

Then on the VM follow docs/RUNBOOK.md "Backups and restore". If the VM was created with a narrow access scope, `gcloud storage cp` fails with 403: stop the VM, edit "Cloud API access scopes" to allow Storage read/write, start it again.

## Uptime check (Cloud Shell, once)

```bash
gcloud monitoring uptime create drm-health --resource-type=uptime-url --resource-labels=host=globe.joulewise.tech --path=/api/health --period=5
```

Add an email notification channel to the check in Cloud Console → Monitoring → Uptime checks.

## Reboot test

```bash
sudo reboot
# reconnect after ~1 minute, then:
cd /work/drmanagement && docker compose -f docker-compose.edge.yml logs --since 3m edge | tail -5
```

Expect the edge start line and no `uplink failed` lines within 2 minutes of boot.
