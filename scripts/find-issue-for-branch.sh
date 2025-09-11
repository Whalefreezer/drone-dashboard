#!/usr/bin/env bash
set -euo pipefail

# Temporary helper: try to find a GitHub issue related to a branch.
# Heuristics:
# 1) If branch contains an issue number like "feat/123-something" or "feat/#123-...",
#    use that number directly.
# 2) Otherwise, search open issues by the branch's short name (after the last '/'),
#    falling back to closed issues if nothing open is found.
#
# Repo: Whalefreezer/drone-dashboard (per repo rules)
# Note: Requires GitHub CLI `gh` to be authenticated.

OWNER="Whalefreezer"
REPO="drone-dashboard"

usage() {
	printf "Usage: %s [--branch <name>] [--json]\n" "$(basename "$0")"
	printf "Without --branch, uses current git branch. Prints best match.\n"
}

BRANCH=""
OUTPUT_JSON=false
while [[ ${1-} ]]; do
	case "$1" in
		--branch)
			BRANCH="${2-}"
			shift 2 ;;
		--json)
			OUTPUT_JSON=true
			shift ;;
		-h|--help)
			usage; exit 0 ;;
		*)
			# Allow positional branch name as convenience
			if [[ -z "${BRANCH}" ]]; then BRANCH="$1"; shift; else break; fi ;;
	esac
done

if [[ -z "${BRANCH}" ]]; then
	BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi

if [[ -z "${BRANCH}" ]]; then
	echo "Error: could not determine branch (pass --branch)." >&2
	exit 2
fi

# Extract candidate issue number from the branch name, e.g., feat/123-foo or feat/#123-foo
extract_issue_number() {
	echo -n "${1}" | sed -E 's|.*/||' | sed -E 's|^#?([0-9]+).*$|\1|' | awk 'NR==1 && $0 ~ /^[0-9]+$/ {print; exit}'
}

SHORT_NAME="${BRANCH##*/}"
ISSUE_NUM="$(extract_issue_number "${BRANCH}")"

repo_flag=("--repo" "${OWNER}/${REPO}")

# Attempt direct view by number first
if [[ -n "${ISSUE_NUM}" ]]; then
	if gh issue view "${ISSUE_NUM}" "${repo_flag[@]}" --json number,title,state,url >/dev/null 2>&1; then
		if $OUTPUT_JSON; then
			gh issue view "${ISSUE_NUM}" "${repo_flag[@]}" --json number,title,state,url
		else
			gh issue view "${ISSUE_NUM}" "${repo_flag[@]}" --json number,title,state,url \
				--jq '. as $i | "#\(.number) [\(.state)] \(.title)\n\(.url)"'
		fi
		exit 0
	fi
fi

# Build a search query from the short branch name: dashes/underscores -> spaces
QUERY_TEXT="$(echo -n "${SHORT_NAME}" | sed -E 's/[-_]+/ /g')"

# Prefer open issues; if none, check closed. Using `gh issue list` for simplicity.
# (Repo rule note: uppercase OPEN/CLOSED is required for gh api GraphQL; `gh issue list` is safe here.)

OPEN_BEST_JSON="$(gh issue list "${repo_flag[@]}" --limit 10 --state open \
    --search "in:title ${QUERY_TEXT}" --json number,title,state,url --jq '.[0] // empty' || true)"
if [[ -n "${OPEN_BEST_JSON}" ]]; then
    if $OUTPUT_JSON; then
        printf '%s\n' "${OPEN_BEST_JSON}"
    else
        gh issue list "${repo_flag[@]}" --limit 10 --state open \
            --search "in:title ${QUERY_TEXT}" --json number,title,state,url \
            --jq '.[0] | "#\(.number) [\(.state|ascii_upcase)] \(.title)\n\(.url)"'
    fi
    exit 0
fi

CLOSED_BEST_JSON="$(gh issue list "${repo_flag[@]}" --limit 10 --state closed \
    --search "in:title ${QUERY_TEXT}" --json number,title,state,url --jq '.[0] // empty' || true)"
if [[ -n "${CLOSED_BEST_JSON}" ]]; then
    if $OUTPUT_JSON; then
        printf '%s\n' "${CLOSED_BEST_JSON}"
    else
        gh issue list "${repo_flag[@]}" --limit 10 --state closed \
            --search "in:title ${QUERY_TEXT}" --json number,title,state,url \
            --jq '.[0] | "#\(.number) [\(.state|ascii_upcase)] \(.title)\n\(.url)"'
    fi
    exit 0
fi

echo "No related issue found for branch '${BRANCH}'." >&2
echo "Tried number: '${ISSUE_NUM:-none}', query: '${QUERY_TEXT}'." >&2
exit 1
