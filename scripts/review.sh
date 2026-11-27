#!/usr/bin/env bash
# Independent review of a stage diff by a different model family (see CLAUDE.md).
set -eu
N="${1:?stage number}"
: "${REVIEW_MODEL:?set REVIEW_MODEL in .env}"
git diff "stage-$N-start"..HEAD > /tmp/stage.diff
codex exec -m "$REVIEW_MODEL" "$(cat docs/review/REVIEW-PROMPT.md)" < /tmp/stage.diff | tee "docs/stage-reports/stage-$N-review.txt"
