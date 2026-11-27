#!/usr/bin/env bash
# Reruns the fast checks on save and writes .watch/status.json (rule 4).
set -u
cd "$(dirname "$0")/.."
mkdir -p .watch
run() {
  local failed=()
  { pnpm -s biome check . || failed+=("biome"); } >.watch/log.txt 2>&1
  { pnpm -s -r --if-present typecheck || failed+=("typecheck"); } >>.watch/log.txt 2>&1
  { pnpm -s --filter @drm/domain --filter @drm/control --filter @drm/edge --if-present test || failed+=("tests"); } >>.watch/log.txt 2>&1
  local ok=true; [ ${#failed[@]} -eq 0 ] || ok=false
  printf '{"ok": %s, "failed": [%s], "at": "%s"}\n' "$ok" "$(printf '"%s",' "${failed[@]}" | sed 's/,$//')" "$(date -u +%FT%TZ)" > .watch/status.json
  cat .watch/status.json
}
run
[ "${1:-}" = "--once" ] && exit 0
npx -y chokidar-cli "apps/**/*.{ts,tsx,css}" "packages/**/*.ts" -i "**/node_modules/**" -i "**/.next/**" --debounce 800 -c "bash scripts/watch.sh --once"
