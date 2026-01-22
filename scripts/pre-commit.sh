#!/usr/bin/env bash

# --- English check function (from check-english.sh) ---
umlaut_pattern='[äöüÄÖÜß]'
german_words='und|der|die|das|nicht|bitte|änderung|anderung|änderungen|anderungen|übersetz|ubersetz|deutsch|deutsche|ich|wir|sie|dass|text|ä|ö|ü|ß'

# --- Detect FULL mode early (before any skip logic) ---
# FULL mode is active when any of these is true:
#   1) PRECOMMIT_FULL env var is set
#   2) .precommit-full file exists
#   3) Script is invoked directly via scripts path
FULL_MODE=0
if [ -n "${PRECOMMIT_FULL:-}" ]; then
  FULL_MODE=1
elif [ -f ".precommit-full" ]; then
  FULL_MODE=1
else
  case "$0" in
    *"/scripts/pre-commit.sh")
      FULL_MODE=1
      ;;
  esac
fi

# --- Simple skip toggle via file or env ---
SKIP_FILE=".skip-precommit"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
SKIP_FLAG=0

# Skip entirely via environment variable (ignored in FULL mode)
if [ "$FULL_MODE" -ne 1 ] && [ -n "${SKIP_PRECOMMIT:-}" ]; then
  echo "[pre-commit] Skipping via SKIP_PRECOMMIT on branch '$BRANCH'." >&2
  exit 0
fi

# Skip via repo file toggle (ignored in FULL mode)
if [ "$FULL_MODE" -ne 1 ] && [ -f "$SKIP_FILE" ]; then
  echo "[pre-commit] Skipping due to $SKIP_FILE file." >&2
  SKIP_FLAG=1
fi

# --- Branch-based skip configuration ---
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Skip entirely via environment variable (ignored in FULL mode)
if [ "$FULL_MODE" -ne 1 ] && [ -n "${SKIP_PRECOMMIT:-}" ]; then
  echo "[pre-commit] Skipping via SKIP_PRECOMMIT on branch '$BRANCH'." >&2
  exit 0
fi

# Skip via repo file toggle (ignored in FULL mode)
if [ "$FULL_MODE" -ne 1 ] && [ -f ".skip-pre-commit" ]; then
  echo "[pre-commit] Skipping due to .skip-pre-commit file." >&2
  exit 0
fi

# Configure skip/only branches via git config:
#   git config hooks.skipBranches "feature/* test/*"
#   git config hooks.onlyBranches "main develop"
SKIP_BRANCHES=$(git config --get hooks.skipBranches || echo "")
ONLY_BRANCHES=$(git config --get hooks.onlyBranches || echo "")

if [ "$FULL_MODE" -ne 1 ]; then
  if [ -n "$SKIP_BRANCHES" ] && [ -n "$BRANCH" ]; then
    for pat in $(echo "$SKIP_BRANCHES" | tr ',' ' '); do
      # Basic glob match using bash [[ ]]
      if [[ "$BRANCH" == $pat ]]; then
        echo "[pre-commit] Skipping on branch '$BRANCH' (hooks.skipBranches match: '$pat')." >&2
        exit 0
      fi
    done
  fi
fi

if [ "$FULL_MODE" -ne 1 ]; then
  if [ -n "$ONLY_BRANCHES" ] && [ -n "$BRANCH" ]; then
    match=0
    for pat in $(echo "$ONLY_BRANCHES" | tr ',' ' '); do
      if [[ "$BRANCH" == $pat ]]; then
        match=1
        break
      fi
    done
    if [ "$match" -ne 1 ]; then
      echo "[pre-commit] Skipping on branch '$BRANCH' (not in hooks.onlyBranches)." >&2
      exit 0
    fi
  fi
fi

# --- Determine changed files (works for pre-commit and CI workflow) ---
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  # In GitHub Actions: compare with base branch (default: origin/main)
  BASE_BRANCH=${GITHUB_BASE_REF:-origin/main}
  CHANGED_FILES=$(git diff --name-only "$BASE_BRANCH...HEAD")
else
  if [ -n "$(git diff --name-only)" ]; then
    echo "[pre-commit] ERROR: You have unstaged changes. Please stage/stash or discard them before committing." >&2
    exit 1
  fi
  # Local pre-commit: use staged files
  CHANGED_FILES=$(git diff --cached --name-only)
fi

# Ensure skip file is not committed
if echo "$CHANGED_FILES" | grep -qx "$SKIP_FILE"; then
  git restore --staged "$SKIP_FILE" 2>/dev/null || git reset -q "$SKIP_FILE" || true
  echo "[pre-commit] Unstaged $SKIP_FILE to avoid committing it." >&2
fi

# If skip flag set, exit now (ignored in FULL mode)
if [ "$FULL_MODE" -ne 1 ] && [ "$SKIP_FLAG" -eq 1 ]; then
  exit 0
fi

# --- Functions ---
get_index_file() {
  # Return staged (index) version of a file if available, else fall back to worktree file
  path="$1"
  git show ":$path" 2>/dev/null || cat "$path" 2>/dev/null || true
}

check_package_json_version_name() {
  if echo "$CHANGED_FILES" | grep -qx "package.json"; then
    echo "[pre-commit] Checking package.json version and name ..." >&2
    v_head=$(git show HEAD:package.json 2>/dev/null | jq -r .version || echo "")
    v_index=$(get_index_file package.json | jq -r .version || echo "")
    n_head=$(git show HEAD:package.json 2>/dev/null | jq -r .name || echo "")
    n_index=$(get_index_file package.json | jq -r .name || echo "")
    # echo "[pre-commit] HEAD version: '$v_head', index version: '$v_index'" >&2
    # echo "[pre-commit] HEAD name: '$n_head', index name: '$n_index'" >&2
    if [ "$v_head" != "$v_index" ] || [ "$n_head" != "$n_index" ]; then
      echo -e "\033[31m[pre-commit] ERROR: 'package.json' 'version' or 'name' was changed in this commit.\033[0m" >&2
      return 1
    fi
  fi
  return 0
}

check_apkbuild() {
  APK_PATH="alpine/package/modbus2mqtt/APKBUILD"
  apk_content=$(get_index_file "$APK_PATH")
  if [ -z "$apk_content" ] && [ -f "$APK_PATH" ]; then
    apk_content=$(cat "$APK_PATH")
  fi
  # Allow either official package name or fork namespace
  # Valid examples:
  #   npmpackage="${pkgname}"
  #   npmpackage="@owner/repo"
  if echo "$apk_content" | grep -E 'npmpackage="\$\{pkgname\}"' >/dev/null 2>&1; then
    : # ok
  elif echo "$apk_content" | grep -E 'npmpackage="@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+"' >/dev/null 2>&1; then
    : # ok (fork)
  else
    echo -e "\033[31m[pre-commit] ERROR: $APK_PATH must define npmpackage as \"\${pkgname}\" or \"@owner/repo\".\033[0m" >&2
    return 1
  fi
  return 0
}

check_eslint() {
  if command -v npx >/dev/null 2>&1; then
    # Collect staged lintable files and run ESLint once for all
    STAGED_LINT_FILES=$(echo "$CHANGED_FILES" | grep -E '\\.(ts|tsx|js|jsx)$' | grep -v -E '^(src/angular/|angular/src/)' || true)
    if [ -n "$STAGED_LINT_FILES" ]; then
      echo "[pre-commit] Running ESLint on staged files ..." >&2
      # Use cache and stylish output; fail on any error
      if ! printf '%s\n' $STAGED_LINT_FILES | xargs -I{} -r npx eslint --cache --format stylish --max-warnings=0 {}; then
        echo -e "\033[31m[pre-commit] ERROR: ESLint failed for staged files. Commit aborted.\033[0m" >&2
        return 1
      fi
    fi
  fi
  return 0
}

check_prettier() {
  if command -v npm >/dev/null 2>&1; then
    STAGED_FORMAT_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(mts|mjs|ts|tsx|js|jsx|css|html|json|sh)$' || true)
    if [ -n "$STAGED_FORMAT_FILES" ]; then
      PRETTIER_OUTPUT=$(printf '%s\n' "$STAGED_FORMAT_FILES" | scripts/prettier-changed.sh)
      MODIFIED_FILES=$(git diff --name-only)
      if [ -n "$MODIFIED_FILES" ]; then
        echo -e "\033[31m[pre-commit] ERROR: Prettier modified files. Please review the changes before committing:\033[0m" >&2
        echo "$MODIFIED_FILES"| sed -e 's/^/\033[31m[pre-commit] ERROR:   /g' | sed -e 's/$/\033[0m/' >&2
        echo "$MODIFIED_FILES" | xargs -r git add || true
        echo -e "\033[31m[pre-commit] Staged formatted files. Aborting commit so you can verify changes.\033[0m" >&2
        return 1
      fi
    fi
  fi
  return 0
}

check_forbidden_extensions() {
  # Only forbid CommonJS-specific extensions in this ESM project.
  # TypeScript source (.ts/.tsx) and .js/.mjs are allowed here due to repo usage (tests, Cypress, scripts).
  forbidden_exts="cjs cts"
  for file in $CHANGED_FILES; do
    # Allow-list known config files that require CJS
    case "$file" in
      jest.config.cjs)
        continue
        ;;
    esac
    ext="${file##*.}"
    for forbidden in $forbidden_exts; do
      if [ "$ext" = "$forbidden" ]; then
        echo -e "\033[31m[pre-commit] ERROR: File extension .$forbidden is not allowed in this ESM project: $file\033[0m" >&2
        return 1
      fi
    done
  done
  return 0
}
check_files_for_english() {
  local found=0
  local matches=()
  for file in $CHANGED_FILES; do
    case "$file" in
      *.png|*.jpg|*.jpeg|*.gif|*.bmp|*.ico|*.pdf|*.zip|*.tar|*.gz|*.bz2|*.xz|*.7z|*.mp3|*.mp4|*.mov|*.avi|*.mkv|*.ogg|*.wav|*.flac|*.exe|*.dll|*.so|*.bin)
        # skip common binary formats
        continue
        ;;
      *)
        if [ -f "$file" ]; then
          # check if file is binary (contains null byte)
          if grep -q $'\x00' "$file"; then
            continue
          fi
          if grep -Ei "$umlaut_pattern|$german_words" "$file" >/dev/null; then
            matches+=("$file")
            found=1
          fi
        fi
        ;;
    esac
  done
  if [ $found -eq 1 ]; then
    echo -e "\033[31m[pre-commit] ERROR: Non-English (German) content detected in: ${matches[*]}\033[0m" >&2
    return 1
  else
    return 0
  fi
}

# Run full-project ESLint across src and tests
run_eslint_full() {
  if command -v npx >/dev/null 2>&1; then
    echo "[pre-commit] Running full ESLint (src and __tests__) ..." >&2
    # Keep Angular app excluded per existing project lint scripts
    if ! npx eslint --cache --ext .ts,.tsx,.js,.jsx --ignore-pattern 'src/angular/**' --ignore-pattern 'angular/**' --format stylish src __tests__; then
      echo -e "\033[31m[pre-commit] ERROR: ESLint failed for the repository.\033[0m" >&2
      return 1
    fi
  fi
  return 0
}

# Run full Jest test suite
run_jest_full() {
  if command -v npx >/dev/null 2>&1; then
    echo "[pre-commit] Running full Jest test suite ..." >&2
    # Avoid watch, run serially to be predictable in hooks
    if ! npx jest --config jest.config.cjs --runInBand --detectOpenHandles --watchAll=false; then
      echo -e "\033[31m[pre-commit] ERROR: Jest tests failed.\033[0m" >&2
      return 1
    fi
  fi
  return 0
}

# --- Run all checks ---
FAILED=0
check_package_json_version_name || FAILED=1
check_apkbuild || FAILED=1
check_eslint || FAILED=1
check_prettier || FAILED=1
# Optional full-project checks (controlled via env/file/call path)
if [ "$FULL_MODE" -eq 1 ]; then
  run_eslint_full || FAILED=1
  run_jest_full || FAILED=1
else
  echo "[pre-commit] Full checks skipped (set PRECOMMIT_FULL=1 or .precommit-full to enable)." >&2
fi
check_forbidden_extensions || FAILED=1
check_files_for_english || FAILED=1

if [ "$FAILED" -ne 0 ]; then
  echo -e "\033[31m[pre-commit]ERROR Commit aborted.\033[0m" >&2
  exit 1
fi

echo "[pre-commit] All checks passed." >&2
exit 0
