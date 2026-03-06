#!/bin/sh
set -eu

if [ -d /run/secrets ]; then
  for secret_path in /run/secrets/*; do
    [ -f "$secret_path" ] || continue
    var_name="$(basename "$secret_path")"
    export "$var_name=$(cat "$secret_path")"
  done
fi

if [ -z "${NODE_ENV:-}" ]; then
  export NODE_ENV=production
fi

exec npx medusa start
