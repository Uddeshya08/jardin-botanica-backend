#!/bin/sh
set -eu

# Load Docker secrets as environment variables
# In Docker Swarm, secrets are mounted at /run/secrets/
if [ -d /run/secrets ]; then
  for secret_path in /run/secrets/*; do
    [ -f "$secret_path" ] || continue
    var_name="$(basename "$secret_path")"
    var_value="$(cat "$secret_path")"
    export "$var_name=$var_value"
  done
fi

# Run Medusa start command
# NODE_ENV is already set to production in Dockerfile
exec node node_modules/@medusajs/medusa/dist/bin/medusa.js start
