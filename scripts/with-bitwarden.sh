#!/usr/bin/env bash
# Disable tracing before reading a credential, including when invoked with bash -x.
set +x
set -euo pipefail

if [ "$#" -eq 0 ]; then
  printf '%s\n' 'Usage: bash scripts/with-bitwarden.sh <command> [arguments…]' >&2
  exit 2
fi

if [ -z "${BITWARDEN_ACCESS_TOKEN:-}" ]; then
  if [ "$(uname -s)" != Darwin ]; then
    printf '%s\n' 'Set BITWARDEN_ACCESS_TOKEN in your deployment environment before running this command.' >&2
    exit 1
  fi
  roomform_keychain_service="${BITWARDEN_KEYCHAIN_SERVICE:-roomform.bitwarden-access-token}"
  roomform_keychain_account="${BITWARDEN_KEYCHAIN_ACCOUNT:-$(id -un)}"
  if ! BITWARDEN_ACCESS_TOKEN="$(/usr/bin/security find-generic-password -s "$roomform_keychain_service" -a "$roomform_keychain_account" -w 2>/dev/null)"; then
    printf '%s\n' 'Could not read the Bitwarden access token from macOS Keychain. Unlock your login keychain and run npm run secrets:store to save a token.' >&2
    exit 1
  fi
fi

if [ -z "$BITWARDEN_ACCESS_TOKEN" ]; then
  printf '%s\n' 'The Bitwarden access token is empty. Run npm run secrets:store to replace it.' >&2
  exit 1
fi

export BITWARDEN_ACCESS_TOKEN
exec "$@"
