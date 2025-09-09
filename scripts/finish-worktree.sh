#!/usr/bin/env bash
set -euo pipefail

# finish-worktree.sh
# Usage: scripts/finish-worktree.sh <branch-or-name|worktree-path> [base-branch]
# - <branch-or-name>: either a full branch like "feat/my-thing" or the short name "my-thing".
# - <worktree-path>: path to a worktree directory (e.g., ".trees/my-thing" or "./.trees/linked-branches/")
# - [base-branch]: branch to merge into (default: main)
#
# Behavior:
# 1) Resolve the worktree path for the branch.
# 2) Abort if the worktree has uncommitted/untracked changes.
# 3) Checkout base in the main repo and fast-forward merge the branch.
# 4) Remove the worktree and delete the feature branch (only if merged).

if [[ ${1:-} == "" ]]; then
  echo "Usage: $0 <branch-or-name> [base-branch]" >&2
  exit 2
fi

INPUT=$1
BASE_BRANCH=${2:-main}

# Determine repo root
ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "${ROOT_DIR}" ]]; then
  echo "Error: not inside a git repository" >&2
  exit 1
fi

WORKTREE_PATH=""
BRANCH=""
NAME=""

# If INPUT is a directory, treat it as a worktree path
if [[ -d "$INPUT" ]]; then
  # Resolve to absolute path
  WORKTREE_PATH=$(cd "$INPUT" && pwd -P)
  # Determine branch from the worktree
  BRANCH=$(git -C "$WORKTREE_PATH" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
  if [[ -z "$BRANCH" ]]; then
    # Fallback: read from porcelain list
    BRANCH=$(git worktree list --porcelain | awk -v wt="$WORKTREE_PATH" '
      $1=="worktree" && $2==wt {found=1}
      found && $1=="branch" {gsub("refs/heads/","",$2); print $2; exit}
    ')
  fi
  if [[ -z "$BRANCH" ]]; then
    echo "Error: could not determine branch for worktree '$WORKTREE_PATH'." >&2
    exit 1
  fi
  NAME="${BRANCH#feat/}"
else
  # Normalize branch and name from string input
  if [[ "$INPUT" == refs/heads/* ]]; then
    BRANCH="${INPUT#refs/heads/}"
  elif [[ "$INPUT" == */* ]]; then
    BRANCH="$INPUT"
  else
    BRANCH="feat/$INPUT"
  fi
  NAME="${BRANCH#feat/}"

  # Locate worktree path for the branch via porcelain output
  REF="refs/heads/${BRANCH}"
  WORKTREE_PATH=$(git worktree list --porcelain \
    | awk -v ref="$REF" '
        $1=="worktree" {wt=$2}
        $1=="branch" && $2==ref {print wt; exit}
      ')

  # Fallback to conventional path if not discovered
  if [[ -z "${WORKTREE_PATH}" ]]; then
    CANDIDATE="${ROOT_DIR}/.trees/${NAME}"
    if [[ -d "$CANDIDATE" ]]; then
      WORKTREE_PATH="$CANDIDATE"
    fi
  fi

  if [[ -z "${WORKTREE_PATH}" ]]; then
    echo "Error: could not find worktree for branch '${BRANCH}'." >&2
    echo "Hint: pass the worktree path directly or ensure it exists under '.trees/${NAME}'." >&2
    exit 1
  fi
fi

# Ensure the worktree path looks like a git worktree
if [[ ! -d "${WORKTREE_PATH}/.git" && ! -f "${WORKTREE_PATH}/.git" ]]; then
  echo "Error: '${WORKTREE_PATH}' is not a valid git worktree." >&2
  exit 1
fi

# Check for outstanding changes in the worktree
if [[ -n "$(git -C "${WORKTREE_PATH}" status --porcelain)" ]]; then
  echo "Refusing to proceed: worktree has uncommitted or untracked changes:" >&2
  git -C "${WORKTREE_PATH}" status --short >&2 || true
  exit 1
fi

# Ensure the base branch exists locally
if ! git -C "${ROOT_DIR}" show-ref --verify --quiet "refs/heads/${BASE_BRANCH}"; then
  echo "Error: base branch '${BASE_BRANCH}' not found locally." >&2
  exit 1
fi

echo "Checking out base branch '${BASE_BRANCH}' in repo root…"
git -C "${ROOT_DIR}" checkout "${BASE_BRANCH}"

echo "Merging '${BRANCH}' into '${BASE_BRANCH}' with --ff-only…"
git -C "${ROOT_DIR}" merge --ff-only "${BRANCH}"

echo "Removing worktree '${WORKTREE_PATH}'…"
git -C "${ROOT_DIR}" worktree remove "${WORKTREE_PATH}"

echo "Deleting merged branch '${BRANCH}'…"
git -C "${ROOT_DIR}" branch -d "${BRANCH}"

echo "Done: ${BRANCH} fast-forward merged into ${BASE_BRANCH}, worktree removed, branch deleted."
