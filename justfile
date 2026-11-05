set positional-arguments

# List available tasks.
default:
    @just --list

# Check Python lint rules and import order.
lint *files=".":
    ruff check "$@"

# Sort Python imports and format code.
fmt:
    ruff check --select I --fix .
    ruff format .

# Check Python formatting without changing files.
fmt-check *files=".":
    ruff format --check "$@"

typecheck:
    mypy --exclude-gitignore .

# Check <assignment>'s per-transcript goal models against the requirements.
check-goals assignment="hw2":
    python scripts/check_goal_models.py "$1"/artifacts/goal_model_[A-Z]*.py

# Run all Python checks without changing files.
check: lint fmt-check typecheck check-goals

# Lint the specified shell scripts.
lint-scripts +files:
    shellcheck "$@"

# Format the specified Nix files.
fmt-nix +files:
    nixfmt "$@"

# Check formatting of the specified Nix files.
fmt-check-nix +files:
    nixfmt --check "$@"

# Package <assignment>/artifacts/ as <assignment>/submission.zip.
zip assignment:
    bash scripts/zip_artifacts.sh "$1"
