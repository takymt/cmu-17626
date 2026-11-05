#!/usr/bin/env bash
set -euo pipefail

conventional_subject() {
  grep -qE '^((build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9-]+\))?!?: .+|Merge .+|(fixup|squash)! .+)$'
}

main() {
  local message_file="${1:?usage: commit-msg MESSAGE_FILE}"
  head -1 "$message_file" | conventional_subject || {
    echo "Commit subject must follow Conventional Commits, e.g. 'feat(hw2): add goal model'" >&2
    exit 1
  }
}

main "$@"
