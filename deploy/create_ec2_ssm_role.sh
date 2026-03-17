#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   AWS_REGION=eu-west-1 \
#   EC2_ROLE_NAME=hodidit-ec2-ssm-role \
#   INSTANCE_PROFILE_NAME=hodidit-ec2-profile \
#   ./deploy/create_ec2_ssm_role.sh

REGION="${AWS_REGION:-eu-west-1}"
EC2_ROLE_NAME="${EC2_ROLE_NAME:-hodidit-ec2-ssm-role}"
INSTANCE_PROFILE_NAME="${INSTANCE_PROFILE_NAME:-hodidit-ec2-profile}"
MANAGED_POLICY_ARN="${MANAGED_POLICY_ARN:-arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

TRUST_POLICY_FILE="${TMP_DIR}/trust-policy.json"
cat >"${TRUST_POLICY_FILE}" <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

echo "[1/4] Ensuring EC2 role ${EC2_ROLE_NAME} exists..."
if aws iam get-role --role-name "${EC2_ROLE_NAME}" >/dev/null 2>&1; then
  echo "Role already exists."
else
  aws iam create-role \
    --role-name "${EC2_ROLE_NAME}" \
    --assume-role-policy-document "file://${TRUST_POLICY_FILE}" \
    --description "EC2 role for hodidit SSM-managed instances" >/dev/null
fi

echo "[2/4] Attaching AmazonSSMManagedInstanceCore..."
aws iam attach-role-policy \
  --role-name "${EC2_ROLE_NAME}" \
  --policy-arn "${MANAGED_POLICY_ARN}" >/dev/null

echo "[3/4] Ensuring instance profile ${INSTANCE_PROFILE_NAME} exists..."
if aws iam get-instance-profile --instance-profile-name "${INSTANCE_PROFILE_NAME}" >/dev/null 2>&1; then
  echo "Instance profile already exists."
else
  aws iam create-instance-profile \
    --instance-profile-name "${INSTANCE_PROFILE_NAME}" >/dev/null
fi

ROLE_ALREADY_ATTACHED="$(
  aws iam get-instance-profile \
    --instance-profile-name "${INSTANCE_PROFILE_NAME}" \
    --query "length(InstanceProfile.Roles[?RoleName=='${EC2_ROLE_NAME}'])" \
    --output text
)"

if [[ "${ROLE_ALREADY_ATTACHED}" == "0" ]]; then
  aws iam add-role-to-instance-profile \
    --instance-profile-name "${INSTANCE_PROFILE_NAME}" \
    --role-name "${EC2_ROLE_NAME}" >/dev/null
fi

echo "[4/4] Waiting briefly for IAM propagation..."
sleep 10

echo
echo "EC2 SSM role/profile ready."
echo "  AWS_REGION=${REGION}"
echo "  EC2_ROLE_NAME=${EC2_ROLE_NAME}"
echo "  INSTANCE_PROFILE_NAME=${INSTANCE_PROFILE_NAME}"
