#!/usr/bin/env bash
# Run interactively on the Docker Swarm manager. Never put credentials in this file.
set -euo pipefail
set +x

service="jd-backend_api"
health_url="https://app.jardinbotanica.com/health"
names=(RAZORPAY_ID RAZORPAY_SECRET RAZORPAY_ACCOUNT RAZORPAY_WEBHOOK_SECRET)
suffix="$(date -u +%Y%m%d%H%M%S)-$$"

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

echo "This rotates four Razorpay secrets and restarts $service twice."
echo "Have a secure backup of the existing values before continuing."
echo "The webhook secret must match the live webhook configured in Razorpay."
read -r -s -p "Live Razorpay Key ID (rzp_live_...): " key_id
printf '\n'
read -r -s -p "Live Razorpay Key Secret: " key_secret
printf '\n'
read -r -s -p "Razorpay Merchant/Account ID: " account_id
printf '\n'
read -r -s -p "Live Razorpay Webhook Secret: " webhook_secret
printf '\n'
trap 'unset key_id key_secret account_id webhook_secret' EXIT

if [[ "$key_id" != rzp_live_* || -z "$key_secret" || -z "$account_id" || -z "$webhook_secret" ]]; then
  echo "A live Key ID and all three other values are required. Nothing was changed." >&2
  exit 1
fi

read -r -p "Type ROTATE to update the live service: " confirmation
if [[ "$confirmation" != "ROTATE" ]]; then
  echo "Cancelled. Nothing was changed."
  exit 0
fi

values=("$key_id" "$key_secret" "$account_id" "$webhook_secret")
new_names=()
for i in "${!names[@]}"; do
  new_name="${names[$i]}_rot_${suffix}"
  printf '%s' "${values[$i]}" | docker secret create "$new_name" - >/dev/null
  new_names+=("$new_name")
done
unset key_id key_secret account_id webhook_secret

check_health() {
  local attempt
  for attempt in {1..12}; do
    if curl --silent --show-error --fail --max-time 5 "$health_url" >/dev/null; then
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
