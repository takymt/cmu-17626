#!/usr/bin/env bash
set -euo pipefail

assignment=${1:?Usage: scripts/zip_artifacts.sh ASSIGNMENT}
cd "$assignment/artifacts"

temporary="$(mktemp -d)"
trap 'rm -r "$temporary"' EXIT

zip -r -D "$temporary/submission.zip" . \
    -x '*.pyc' '*.pyo' '__pycache__/*' '*/__pycache__/*' \
    '.DS_Store' '*/.DS_Store' '._*' '*/._*' '.gitkeep' '*/.gitkeep'
mv "$temporary/submission.zip" ../submission.zip
