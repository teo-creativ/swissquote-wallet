#!/usr/bin/env bash
# CDC E.4 S-1/S-4: look for secrets in tracked files and in git history. Exit 1 if found.
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PATTERN='(0x)?[0-9a-fA-F]{64}|service_role|PRIVATE_KEY=[^ ]|-----BEGIN|NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE|PRIVATE)'
EXCL=(':!public/**' ':!**/public/**' ':!*.svg' ':!*.png' ':!*.md' ':!scripts/check-secrets.sh' ':!package-lock.json' ':!**/package-lock.json' ':!CDC*.md' ':!**/.env.example' ':!.env.example' ':!docs/**' ':!**/sql/**' ':!sql/**')
found=0
if git rev-parse --git-dir >/dev/null 2>&1; then
  git grep -InE "$PATTERN" -- . "${EXCL[@]}" && found=1
  git log -p --all -G"$PATTERN" --pretty=format:'%h %s' -- . "${EXCL[@]}" | grep -E "^\+.*($PATTERN)" && found=1
else
  grep -rnE "$PATTERN" --exclude-dir=node_modules --exclude-dir=.next --exclude=package-lock.json --exclude=.env.example . && found=1
fi
[ $found -eq 1 ] && { echo "SECRET-LIKE CONTENT FOUND"; exit 1; } || echo "check-secrets: clean"
