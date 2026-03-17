#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   AWS_REGION=eu-west-1 \
#   GITHUB_DEPLOY_USER_NAME=hodidit-gh-deploy \
#   CREATE_ACCESS_KEY=1 \
#   ./deploy/create_github_deploy_user.sh

REGION="${AWS_REGION:-eu-west-1}"
GITHUB_DEPLOY_USER_NAME="${GITHUB_DEPLOY_USER_NAME:-hodidit-gh-deploy}"
POLICY_NAME="${POLICY_NAME:-hodidit-gh-deploy-policy}"
CREATE_ACCESS_KEY="${CREATE_ACCESS_KEY:-0}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

POLICY_FILE="${TMP_DIR}/policy.json"
cat >"${POLICY_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SsmDeploy",
      "Effect": "Allow",
      "Action": [
        "ssm:DescribeInstanceInformation",
        "ssm:GetCommandInvocation",
        "ssm:ListCommandInvocations",
        "ssm:ListCommands",
        "ssm:SendCommand"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Ec2Describe",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances"
      ],
      "Resource": "*"
    }
  ]
}
EOF

echo "[1/3] Ensuring IAM user ${GITHUB_DEPLOY_USER_NAME} exists..."
if aws iam get-user --user-name "${GITHUB_DEPLOY_USER_NAME}" >/dev/null 2>&1; then
  echo "User already exists."
else
  aws iam create-user --user-name "${GITHUB_DEPLOY_USER_NAME}" >/dev/null
fi

echo "[2/3] Putting inline policy ${POLICY_NAME}..."
aws iam put-user-policy \
  --user-name "${GITHUB_DEPLOY_USER_NAME}" \
  --policy-name "${POLICY_NAME}" \
  --policy-document "file://${POLICY_FILE}" >/dev/null

echo "[3/3] Current user ready."
echo "  AWS_REGION=${REGION}"
echo "  GITHUB_DEPLOY_USER_NAME=${GITHUB_DEPLOY_USER_NAME}"
echo "  POLICY_NAME=${POLICY_NAME}"

if [[ "${CREATE_ACCESS_KEY}" == "1" ]]; then
  KEY_COUNT="$(
    aws iam list-access-keys \
      --user-name "${GITHUB_DEPLOY_USER_NAME}" \
      --query 'length(AccessKeyMetadata)' \
      --output text
  )"

  if [[ "${KEY_COUNT}" -ge 2 ]]; then
    echo "ERROR: user already has ${KEY_COUNT} access keys; delete one before creating another." >&2
    exit 1
  fi

  CREDS_JSON="$(
    aws iam create-access-key \
      --user-name "${GITHUB_DEPLOY_USER_NAME}" \
      --query 'AccessKey.{AWS_ACCESS_KEY_ID:AccessKeyId,AWS_SECRET_ACCESS_KEY:SecretAccessKey}' \
      --output json
  )"

  echo
  echo "Store these in GitHub repository secrets now:"
  echo "${CREDS_JSON}"
fi
