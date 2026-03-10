#!/bin/sh
set -eu

# Force production mode - must be set before loading Medusa CLI
# This prevents ts-node from being loaded
export NODE_ENV=production

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
exec node node_modules/@medusajs/cli/cli.js start
