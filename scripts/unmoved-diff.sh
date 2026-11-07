#!/usr/bin/env bash
# Prints the diff without lines git detects as moved, ignoring indentation changes.
# What remains is the code a pure-move refactor actually changed.
# Usage: scripts/unmoved-diff.sh [git diff args], e.g. HEAD, main...HEAD or abc123~1 abc123
set -euo pipefail
git -c color.diff.oldMoved='bold magenta' -c color.diff.newMoved='bold cyan' \
  diff --color=always --color-moved=plain --color-moved-ws=allow-indentation-change "$@" |
  grep -v $'^\e\\[1;3[56]m[-+]' |
  sed -E $'s/\e\\[[0-9;]*m//g'
