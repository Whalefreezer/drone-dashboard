#!/usr/bin/env bash
set -euo pipefail

# new-worktree.sh NAME
# Creates a git worktree at ./tree/NAME checked out to branch feat/NAME
# and copies any existing .env files from the repo into the worktree.

if [[ ${1-} == "" || ${1-} == "-h" || ${1-} == "--help" ]]; then
	printf "Usage: %s <name>\n" "$(basename "$0")"
	printf "Creates ./tree/<name> worktree on branch feat/<name> and copies .env files.\n"
	exit 1
fi

NAME="$1"
BRANCH="feat/${NAME}"
DEST="./tree/${NAME}"

# Ensure we're inside a git repo and operate from its root
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
	echo "Error: not inside a git repository."
	exit 2
fi
cd "${REPO_ROOT}"

# Ensure ./tree exists and is writable
if [[ ! -d "./tree" ]]; then
	if ! mkdir -p ./tree 2>/dev/null; then
		echo "Error: cannot create ./tree directory."
		exit 3
	fi
fi
if [[ ! -w "./tree" ]]; then
	echo "Error: ./tree is not writable."
	exit 4
fi

# Prevent accidental reuse of an existing path
if [[ -e "${DEST}" ]]; then
	echo "Error: destination path already exists: ${DEST}"
	exit 5
fi

# Create worktree with or without new branch (depending on existence)
if git rev-parse --verify --quiet "refs/heads/${BRANCH}" >/dev/null; then
	echo "Branch ${BRANCH} exists; adding worktree at ${DEST}"
	git worktree add "${DEST}" "${BRANCH}"
else
	echo "Creating branch ${BRANCH} and worktree at ${DEST}"
	git worktree add -b "${BRANCH}" "${DEST}"
fi

# Copy .env files (e.g., .env, .env.local, .env.dev) while preserving paths.
# Intentionally skip .env.example.
echo "Copying .env files into worktree (if any exist)..."
while IFS= read -r -d '' FILE; do
	REL="${FILE#./}"
	mkdir -p "${DEST}/$(dirname "${REL}")"
	# Do not overwrite if a file already exists in the worktree
	cp -n "${FILE}" "${DEST}/${REL}"
done < <(find . -type f \( -name '.env' -o -name '.env.*' \) \
	-not -name '.env.example' -not -path './.git/*' -print0)

echo "Done. Worktree ready at: ${DEST}"
echo "Next: cd ${DEST}"

