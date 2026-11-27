# VM setup · drmanagement (GCP project replanner-513407, asia-south2-b)

You work only from **Cloud Shell** (the >_ icon at the top of the Google Cloud console). Paste each block as one piece. Every block is safe to run twice.

What needs fixing on the VM as it is now:
- Boot disk is 10 GB: Docker, node_modules and Playwright fill it within the first stage. Grow it to 50 GB (online, no restart).
- External IP 34.131.108.75 is ephemeral: it changes if the VM ever stops. Promote it to static (no restart).
- No network tag and no SSH rule: add tag `drmanagement` and allow SSH only through Google's IAP range.
- No inbound web ports are needed: the edge only makes outbound connections to Vercel and Neon.

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
echo "Static IP: $(gcloud compute addresses describe drm-ip --region=$REGION --format='get(address)')  Disk: $(gcloud compute disks describe $DISK --zone=$ZONE --format='get(sizeGb)') GB"
echo "Done. Next: gcloud compute ssh drmanagement --zone=asia-south2-b --tunnel-through-iap"
)
```

Success looks like: `Static IP: 34.131.108.75  Disk: 50 GB`.

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

## Getting the build kit onto the VM

Easiest: push the kit to the repo from your laptop (or ask Claude to push it to Ergplan/drmanagement), then the bootstrap's clone already has it. Or in Cloud Shell: upload the zip (⋮ → Upload), then `gcloud compute scp drm-build-kit.zip drmanagement:/work/ --zone=asia-south2-b --tunnel-through-iap` and on the VM `cd /work/drmanagement && unzip -o ../drm-build-kit.zip && git add -A && git commit -m "Build kit" && git push`.
