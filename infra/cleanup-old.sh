#!/bin/bash
# Clean up old ad-hoc AWS resources from the dev environment.
# Run once, then delete this script.
#
# Usage: ./infra/cleanup-old.sh <profile> <region>

set -euo pipefail

PROFILE="${1:?Usage: cleanup-old.sh <profile> <region>}"
REGION="${2:-us-east-1}"

echo "=== Cleaning up old diagram-agent resources ==="
echo "Profile: ${PROFILE} | Region: ${REGION}"
echo ""

# Old v1 Lambda (AgentCore proxy)
echo "[1/6] Deleting old Lambda: diagram-agent-proxy-dev..."
aws lambda delete-function --function-name diagram-agent-proxy-dev \
  --profile "${PROFILE}" --region "${REGION}" 2>/dev/null && echo "  Deleted" || echo "  Not found (OK)"

# Old v2 Lambda (ad-hoc created)
echo "[2/6] Deleting old Lambda: diagram-agent-v2..."
aws lambda delete-function --function-name diagram-agent-v2 \
  --profile "${PROFILE}" --region "${REGION}" 2>/dev/null && echo "  Deleted" || echo "  Not found (OK)"

# Old IAM roles
echo "[3/6] Deleting old IAM roles..."
for ROLE in diagram-agent-proxy-dev diagram-agent-v2-role; do
  # Detach managed policies
  for POLICY_ARN in $(aws iam list-attached-role-policies --role-name "${ROLE}" --query 'AttachedPolicies[].PolicyArn' --output text --profile "${PROFILE}" 2>/dev/null); do
    aws iam detach-role-policy --role-name "${ROLE}" --policy-arn "${POLICY_ARN}" --profile "${PROFILE}" 2>/dev/null
  done
  # Delete inline policies
  for POLICY in $(aws iam list-role-policies --role-name "${ROLE}" --query 'PolicyNames[]' --output text --profile "${PROFILE}" 2>/dev/null); do
    aws iam delete-role-policy --role-name "${ROLE}" --policy-name "${POLICY}" --profile "${PROFILE}" 2>/dev/null
  done
  aws iam delete-role --role-name "${ROLE}" --profile "${PROFILE}" 2>/dev/null && echo "  Deleted ${ROLE}" || echo "  ${ROLE} not found (OK)"
done

# Old ECR repo
echo "[4/6] Deleting old ECR repo: diagram-agent-v2..."
aws ecr delete-repository --repository-name diagram-agent-v2 --force \
  --profile "${PROFILE}" --region "${REGION}" 2>/dev/null && echo "  Deleted" || echo "  Not found (OK)"

# Old API Gateway
echo "[5/6] Deleting old API Gateway: diagram-agent-api-dev..."
OLD_API_ID=$(aws apigatewayv2 get-apis --profile "${PROFILE}" --region "${REGION}" \
  --query "Items[?Name=='diagram-agent-api-dev'].ApiId" --output text 2>/dev/null)
if [[ -n "$OLD_API_ID" && "$OLD_API_ID" != "None" ]]; then
  aws apigatewayv2 delete-api --api-id "${OLD_API_ID}" --profile "${PROFILE}" --region "${REGION}" 2>/dev/null
  echo "  Deleted API ${OLD_API_ID}"
else
  echo "  Not found (OK)"
fi

# Old Cognito domain + app client (from dev)
echo "[6/6] Deleting old Cognito domain: infinitra-diagram-dev..."
aws cognito-idp delete-user-pool-domain --domain infinitra-diagram-dev \
  --user-pool-id us-east-1_4HYB87uJQ \
  --profile "${PROFILE}" --region "${REGION}" 2>/dev/null && echo "  Deleted" || echo "  Not found (OK)"

# Old Cognito domain: infinitra-diagram (no env suffix)
aws cognito-idp delete-user-pool-domain --domain infinitra-diagram \
  --user-pool-id us-east-1_4HYB87uJQ \
  --profile "${PROFILE}" --region "${REGION}" 2>/dev/null && echo "  Deleted infinitra-diagram" || echo "  infinitra-diagram not found (OK)"

echo ""
echo "=== Cleanup complete ==="
echo "You can now delete this script: rm infra/cleanup-old.sh"
