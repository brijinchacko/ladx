#!/usr/bin/env bash
#
# Put the Rust binaries the web app runs onto the server.
#
# This exists because forgetting it is silent. The web routes shell out to
# these, an older binary refuses the newer flags, and the failure surfaces as a
# feature that quietly does nothing rather than as an error: the standards
# lookup falls back to "no standards" by design, so a stale binary means
# generation carries on without anybody's rules and says nothing about it.
#
# So the rule is: any deploy that carries a change under packages/core must run
# this too. Source and binaries are versioned separately and nothing enforces
# that they match.
#
#     scripts/deploy-server-binaries.sh
#
set -euo pipefail

HOST="${LADX_HOST:-root@72.62.230.223}"
KEY="${LADX_SSH_KEY:-$HOME/.ssh/seekof_deploy}"
REMOTE="/var/www/ladx-ai/target/release"

echo "fetching the newest build from CI"
RUN=$(gh run list --workflow="Server binaries" --status success --limit 1 --json databaseId -q '.[0].databaseId')
[ -n "$RUN" ] || { echo "no successful build to take"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
gh run download "$RUN" -n server-binaries -D "$TMP"

echo "uploading"
ssh -i "$KEY" "$HOST" "mkdir -p $REMOTE"
scp -i "$KEY" "$TMP"/ladx-parser "$TMP"/ladx-siemens "$TMP"/ladx-validate "$HOST:$REMOTE/"
ssh -i "$KEY" "$HOST" "chmod +x $REMOTE/ladx-parser $REMOTE/ladx-siemens $REMOTE/ladx-validate"

# Not "did it copy" but "does it answer": a binary that lands and will not run,
# or one that runs and does not know the flag the app is about to pass it, is
# the failure this script exists to catch.
echo "checking what landed actually works"
ssh -i "$KEY" "$HOST" "
  set -e
  cd /var/www/ladx-ai
  ./target/release/ladx-parser 2>&1 | head -1
  ./target/release/ladx-siemens 2>&1 | head -1
  echo '{\"request\":\"add a motor\",\"memories\":[{\"id\":\"1\",\"scope\":\"company\",\"kind\":\"forbidden\",\"content\":\"Never use SET/RESET for a motor command.\",\"author\":\"check\",\"created_at\":\"2026-01-01T00:00:00Z\"}]}' > /tmp/ladx-check.json
  OUT=\$(./target/release/ladx-parser --standards /tmp/ladx-check.json)
  rm -f /tmp/ladx-check.json
  case \"\$OUT\" in
    *'must not be broken'*) echo '  standards retrieval: working' ;;
    *) echo '  standards retrieval: FAILED'; echo \"  got: \$OUT\"; exit 1 ;;
  esac
"
echo "done"
