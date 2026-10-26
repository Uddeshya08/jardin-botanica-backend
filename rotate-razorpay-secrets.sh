#!/usr/bin/env bash
# Run interactively on the Docker Swarm manager. Never put credentials in this file.
set -euo pipefail
set +x

service="jd-backend_api"
check_url="https://app.jardinbotanica.com/store/regions"
names=(RAZORPAY_ID RAZORPAY_SECRET)
suffix="$(date -u +%Y%m%d%H%M%S)-$$"

if [[ "${1:-}" == "--keys-only" && "$#" -eq 1 ]]; then
  keys_only=true
elif [[ "$#" -eq 0 ]]; then
  keys_only=false
  names+=(RAZORPAY_ACCOUNT RAZORPAY_WEBHOOK_SECRET)
else
  echo "Usage: bash rotate-razorpay-secrets.sh [--keys-only]" >&2
  exit 1
fi

if [[ ! -t 0 ]]; then
  echo "Run from an interactive terminal (use ssh -t if connecting remotely)." >&2
  exit 1
fi

if [[ "$(docker info --format '{{.Swarm.ControlAvailable}}')" != "true" ]]; then
  echo "This script must run on a Docker Swarm manager." >&2
  exit 1
fi

docker service inspect "$service" >/dev/null
for name in "${names[@]}"; do
  docker secret inspect "$name" >/dev/null
  if ! docker service inspect "$service" --format '{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{println .SecretName}}{{end}}' | grep -Fxq "$name"; then
    echo "$service does not currently use $name. Inspect its secret state before rotating." >&2
    exit 1
  fi
done

echo "This rotates ${#names[@]} Razorpay secrets and restarts $service twice."
echo "Have a secure backup of the existing values before continuing."
if [[ "$keys_only" == false ]]; then
  echo "The webhook secret must match the live webhook configured in Razorpay."
fi
read -r -s -p "Live Razorpay Key ID (rzp_live_...): " key_id
printf '\n'
read -r -s -p "Live Razorpay Key Secret: " key_secret
printf '\n'
if [[ "$keys_only" == false ]]; then
  read -r -s -p "Razorpay Merchant/Account ID: " account_id
  printf '\n'
  read -r -s -p "Live Razorpay Webhook Secret: " webhook_secret
  printf '\n'
fi
trap 'unset key_id key_secret account_id webhook_secret' EXIT

if [[ "$key_id" != rzp_live_* ]]; then
  echo "Invalid Key ID: enter the Live Mode Key ID beginning with rzp_live_. Nothing was changed." >&2
  exit 1
fi
if [[ -z "$key_secret" ]]; then
  echo "Key Secret was empty. Nothing was changed." >&2
  exit 1
fi
if [[ "$keys_only" == false && -z "$account_id" ]]; then
  echo "Merchant/Account ID was empty. Nothing was changed." >&2
  exit 1
fi
if [[ "$keys_only" == false && -z "$webhook_secret" ]]; then
  echo "Webhook Secret was empty. Nothing was changed." >&2
  exit 1
fi

read -r -p "Type ROTATE to update the live service: " confirmation
if [[ "$confirmation" != "ROTATE" ]]; then
  echo "Cancelled. Nothing was changed."
  exit 0
fi

values=("$key_id" "$key_secret")
if [[ "$keys_only" == false ]]; then
  values+=("$account_id" "$webhook_secret")
fi
new_names=()
for i in "${!names[@]}"; do
  new_name="${names[$i]}_rot_${suffix}"
  printf '%s' "${values[$i]}" | docker secret create "$new_name" - >/dev/null
  new_names+=("$new_name")
done
unset key_id key_secret account_id webhook_secret

check_health() {
  local attempt status
  for attempt in {1..12}; do
    # The store endpoint returns 400 without a publishable key, confirming the API is serving.
    status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$check_url" || true)"
    if [[ "$status" == "200" || "$status" == "400" ]]; then
      return 0
    fi
    sleep 5
  done
  echo "Health check failed. Inspect $service before continuing; do not rerun this script." >&2
  return 1
}

to_versioned=()
for i in "${!names[@]}"; do
  to_versioned+=(--secret-rm "${names[$i]}" --secret-add "source=${new_names[$i]},target=${names[$i]}")
done

echo "Switching service to temporary versioned secrets..."
docker service update --detach=false "${to_versioned[@]}" "$service"
check_health

echo "Service is healthy on the new secrets. Original secret names will now be recreated."
echo "Do not redeploy the stack until this script finishes."
read -r -p "Type CONTINUE to finish, or stop and inspect first: " confirmation
if [[ "$confirmation" != "CONTINUE" ]]; then
  echo "Stopped with versioned secrets active. Original names still hold old values." >&2
  echo "Inspect the service before any stack redeploy; do not rerun this script." >&2
  exit 1
fi

for i in "${!names[@]}"; do
  docker secret rm "${names[$i]}" >/dev/null
  printf '%s' "${values[$i]}" | docker secret create "${names[$i]}" - >/dev/null
done
unset values

to_original=()
for i in "${!names[@]}"; do
  to_original+=(--secret-rm "${new_names[$i]}" --secret-add "source=${names[$i]},target=${names[$i]}")
done

echo "Switching service back to the original secret names..."
docker service update --detach=false "${to_original[@]}" "$service"
check_health

for new_name in "${new_names[@]}"; do
  docker secret rm "$new_name" >/dev/null
done

echo "Razorpay secrets rotated under their original names. Check a live payment and webhook before wider use."
