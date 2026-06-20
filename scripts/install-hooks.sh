#!/bin/bash
#
# Install the AtomCanvas git hooks into .git/hooks/.
#
# Run once after cloning:
#
#   scripts/install-hooks.sh
#
# This is safe to re-run — it overwrites any previously installed copy of the
# hook. The hook template lives at scripts/hooks/pre-commit and is tracked in
# version control so it stays in sync with CI.
#
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
HOOKS_SRC="$REPO_ROOT/scripts/hooks"
HOOKS_DEST="$REPO_ROOT/.git/hooks"

echo "Installing AtomCanvas git hooks from $HOOKS_SRC -> $HOOKS_DEST"

install_hook() {
    local name="$1"
    local src="$HOOKS_SRC/$name"
    local dest="$HOOKS_DEST/$name"
    if [ ! -f "$src" ]; then
        echo "  [skip] $name — template not found at $src"
        return
    fi
    cp "$src" "$dest"
    chmod +x "$dest"
    echo "  [installed] $name"
}

install_hook pre-commit

echo ""
echo "Done. The pre-commit hook will now run eslint + tsc -b on staged .ts/.tsx"
echo "files before each commit. To skip it once: git commit --no-verify"
echo ""
echo "For the full gate (lint + tsc + vitest + build + pytest), run:"
echo "  scripts/check.sh"
