#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") [--header] <search-string> [file ...]" >&2
  exit 1
fi

mode="anywhere"
if [[ ${1-} == "--header" ]]; then
  mode="header"
  shift
fi

q="$1"
shift

awk -v q="$q" -v header_only="$([[ "$mode" == "header" ]] && echo 1 || echo 0)" '
  function flush() {
    if (block != "" && has_match) {
      printf "%s", block
    }
    block = ""
    has_match = 0
  }

  /^Received event/ {
    # New event starts
    flush()
    block = $0 ORS
    if (index($0, q)) {
      has_match = 1
    }
    next
  }

  # Lines inside an event
  {
    block = block $0 ORS
    if (!header_only && index($0, q)) {
      has_match = 1
    }
  }

  END {
    # Check the last event in the file
    flush()
  }
' "$@"


