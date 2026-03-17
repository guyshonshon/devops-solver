#!/usr/bin/env bash
# Deploy: git pull + docker rebuild on EC2 via SSM.
# Called by GitHub Actions on every push to main.
set -euo pipefail

REGION="${AWS_REGION:-eu-west-1}"
INSTANCE_ID="${INSTANCE_ID:?Set EC2_INSTANCE_ID in GitHub secrets}"
REPO_BRANCH="${REPO_BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/hodidit}"

aws_with_retry() {
  local attempt=1
  local max_attempts="${AWS_MAX_ATTEMPTS:-5}"
  local delay="${AWS_RETRY_DELAY_SECONDS:-3}"
  local output exit_code

  while true; do
    if output=$("$@" 2>&1); then
      printf '%s' "$output"
      return 0
    fi

    exit_code=$?
    if [[ $attempt -ge $max_attempts ]]; then
      printf '%s\n' "$output" >&2
      return "$exit_code"
    fi

    printf 'WARN: AWS command failed (attempt %d/%d): %s\n' \
      "$attempt" "$max_attempts" "$(printf '%s' "$output" | head -n 1)" >&2
    attempt=$((attempt + 1))
    sleep "$delay"
  done
}

# Wait for SSM agent
echo "Waiting for SSM on $INSTANCE_ID..."
PING=""
for _ in {1..60}; do
  PING=$(aws_with_retry aws ssm describe-instance-information \
    --region "$REGION" \
    --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text || true)
  [[ "$PING" == "None" || "$PING" == "[]" ]] && PING=""
  [[ "$PING" == "Online" ]] && break
  sleep 5
done
[[ "$PING" == "Online" ]] || { echo "ERROR: SSM not online for $INSTANCE_ID" >&2; exit 1; }

# Build remote script (variables expanded locally before sending)
# SSM runs with /bin/sh — re-exec with bash for pipefail + [[ support
REMOTE=$(cat <<SCRIPT
[ -n "\$BASH_VERSION" ] || exec /bin/bash "\$0" "\$@"
export HOME=/root
git config --global --add safe.directory ${APP_DIR} 2>/dev/null || true
cd ${APP_DIR}
APP_DIR=${APP_DIR} REPO_BRANCH=${REPO_BRANCH} ./deploy/deploy_on_instance.sh
SCRIPT
)

echo "Sending deploy command..."
COMMAND_ID=$(aws_with_retry aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "$(jq -cn --arg cmd "$REMOTE" '{commands:[$cmd]}')" \
  --query 'Command.CommandId' \
  --output text)

echo "Command ID: $COMMAND_ID"
STATUS=""
i=0
while true; do
  STATUS=$(aws_with_retry aws ssm get-command-invocation \
    --region "$REGION" --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
    --query 'Status' --output text || true)
  case "$STATUS" in
    Success|Failed|TimedOut|Cancelled|Undeliverable|Terminated) break ;;
  esac
  i=$((i+1))
  elapsed=$((i*5))
  printf "\r[%ds] Status: %-20s" "$elapsed" "${STATUS:-pending}"
  sleep 5
  [[ $i -ge 300 ]] && { echo; echo "ERROR: Timed out after 25 min" >&2; exit 1; }
done
echo  # newline after progress line

aws_with_retry aws ssm get-command-invocation \
  --region "$REGION" --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
  --output json

[[ "$STATUS" == "Success" ]] || { echo "ERROR: Deploy failed: $STATUS" >&2; exit 1; }
echo "Deploy complete."
