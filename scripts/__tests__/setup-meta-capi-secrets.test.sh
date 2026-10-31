#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../setup-meta-capi-secrets.sh"

# Fake Docker only. These tests never access a Docker daemon or real secrets.
docker() {
  case "$1 $2" in
    'info --format') printf '%s\n' "${MOCK_MANAGER:-true}" ;;
    'secret inspect') [[ "${MOCK_EXISTING:-false}" == true ]] ;;
    'secret create')
      local value
      value="$(cat)"
      [[ -n "$value" ]] || return 1
      if [[ "$3" == META_CAPI_ACCESS_TOKEN ]]; then [[ "$value" == test_token ]]; fi
      printf 'secret-id\n'
      ;;
    'service inspect')
      if [[ "${3:-}" == --format ]]; then printf '%s\n' "${MOCK_ATTACHED:-}"; else printf '{}\n'; fi
      ;;
    'service update') printf 'UPDATE: %s\n' "$*" ;;
    *) printf 'Unexpected Docker invocation\n' >&2; return 1 ;;
  esac
}

output="$(setup_meta_main <<< $'123456789\ntest_token\nTEST123')"
[[ "$output" == *'Created secret: META_PIXEL_ID'* ]]
[[ "$output" == *'Created secret: META_CAPI_ACCESS_TOKEN'* ]]
[[ "$output" == *'Created secret: META_TEST_EVENT_CODE'* ]]
[[ "$output" != *test_token* && "$output" != *UPDATE:* ]]

output="$(setup_meta_main --attach <<< $'123456789\ntest_token\n')"
[[ "$output" == *'--env-add META_CAPI_ENABLED=false'* ]]
[[ "$output" == *'source=META_CAPI_ACCESS_TOKEN,target=META_CAPI_ACCESS_TOKEN'* ]]
[[ "$output" == *jd-backend_api* && "$output" != *test_token* ]]

output="$(MOCK_EXISTING=true MOCK_ATTACHED=$'META_PIXEL_ID\nMETA_CAPI_ACCESS_TOKEN\nMETA_TEST_EVENT_CODE' setup_meta_main --attach </dev/null)"
[[ "$output" == *'Keeping existing secret: META_PIXEL_ID'* && "$output" != *'--secret-add'* ]]

# Invoke failures directly: a surrounding `if function` would disable Bash errexit in the function.
set +e
(set -e; setup_meta_main <<< $'not-an-id\ntest_token\nTEST123') >/dev/null 2>&1
invalid_status=$?
(set -e; MOCK_MANAGER=false setup_meta_main </dev/null) >/dev/null 2>&1
manager_status=$?
set -e
[[ "$invalid_status" -ne 0 && "$manager_status" -ne 0 ]]
printf 'PASS: secret prompts, optional test code, token hiding, attachment, idempotency, and validation\n'
