#!/bin/bash
# Deploy diagram-agent to an AWS environment.
#
# Usage:
#   ./infra/deploy.sh <env> <profile> <region>
#
# Examples:
#   ./infra/deploy.sh stg your-aws-profile us-east-1
#   ./infra/deploy.sh prd your-prd-profile us-east-1

set -euo pipefail

ENV="${1:?Usage: deploy.sh <env> <profile> <region>}"
PROFILE="${2:?}"
REGION="${3:?}"

if [[ "$ENV" != "stg" && "$ENV" != "prd" ]]; then
  echo "Error: env must be 'stg' or 'prd'" && exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
CFN_DIR="${SCRIPT_DIR}/cfn"
CONFIG_FILE="${SCRIPT_DIR}/config/${ENV}.env"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: config file not found: ${CONFIG_FILE}" && exit 1
fi

# shellcheck source=/dev/null
source "$CONFIG_FILE"

ACCOUNT_ID=$(aws sts get-caller-identity --profile "${PROFILE}" --region "${REGION}" --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
REPO_NAME="diagram-agent-${ENV}"
IMAGE_URI="${ECR_URI}/${REPO_NAME}:latest"
STACK_PREFIX="diagram-agent-${ENV}"

echo "============================================"
echo "  Deploying diagram-agent [${ENV}]"
echo "  Account: ${ACCOUNT_ID}"
echo "  Region:  ${REGION}"
echo "  Profile: ${PROFILE}"
echo "============================================"

# ── 1. Storage (S3 bucket) ────────────────────────────────────────────────
echo ""
echo "[1/5] Deploying storage stack..."
aws cloudformation deploy \
  --stack-name "${STACK_PREFIX}-storage" \
  --template-file "${SCRIPT_DIR}/storage.yaml" \
  --parameter-overrides Environment="${ENV}" \
  --no-fail-on-empty-changeset \
  --profile "${PROFILE}" --region "${REGION}"

# ── 2. ECR repository ────────────────────────────────────────────────────
echo ""
echo "[2/5] Deploying ECR stack..."
aws cloudformation deploy \
  --stack-name "${STACK_PREFIX}-ecr" \
  --template-file "${CFN_DIR}/ecr.yaml" \
  --parameter-overrides Environment="${ENV}" \
  --no-fail-on-empty-changeset \
  --profile "${PROFILE}" --region "${REGION}"

# ── 3. Build & push Docker image ─────────────────────────────────────────
echo ""
echo "[3/5] Building and pushing Docker image..."
aws ecr get-login-password --profile "${PROFILE}" --region "${REGION}" | \
  docker login --username AWS --password-stdin "${ECR_URI}" 2>&1 | tail -1

docker buildx build --platform linux/arm64 \
  -t "${IMAGE_URI}" \
  -f "${SCRIPT_DIR}/lambda/Dockerfile" \
  --provenance=false \
  --push "${PROJECT_ROOT}" 2>&1 | tail -5

# ── 4. API stack (IAM, Lambda, API Gateway, Cognito) ─────────────────────
echo ""
echo "[4/5] Deploying API stack..."
aws cloudformation deploy \
  --stack-name "${STACK_PREFIX}-api" \
  --template-file "${CFN_DIR}/api.yaml" \
  --parameter-overrides \
    Environment="${ENV}" \
    ImageUri="${IMAGE_URI}" \
    CognitoUserPoolId="${COGNITO_USER_POOL_ID}" \
    CognitoDomainPrefix="${COGNITO_DOMAIN_PREFIX}" \
    FrontendUrl="${FRONTEND_URL}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --profile "${PROFILE}" --region "${REGION}"

# ── 5. Update Lambda to latest image (in case stack already existed) ─────
echo ""
echo "[5/5] Updating Lambda to latest image..."
aws lambda update-function-code \
  --function-name "diagram-agent-${ENV}" \
  --image-uri "${IMAGE_URI}" \
  --profile "${PROFILE}" --region "${REGION}" \
  --output text --query 'LastUpdateStatus' 2>&1 || true

# ── Output ────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Deployment complete [${ENV}]"
echo "============================================"

# Get outputs
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_PREFIX}-api" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_PREFIX}-api" \
  --query "Stacks[0].Outputs[?OutputKey=='ClientId'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

COGNITO_DOMAIN="https://${COGNITO_DOMAIN_PREFIX}.auth.${REGION}.amazoncognito.com"

echo ""
echo "API Endpoint: ${API_ENDPOINT}"
echo "Client ID:    ${CLIENT_ID}"
echo "Cognito:      ${COGNITO_DOMAIN}"
echo ""
echo "Frontend .env:"
echo "──────────────"
echo "VITE_API_ENDPOINT=${API_ENDPOINT}"
echo "VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN}"
echo "VITE_CLIENT_ID=${CLIENT_ID}"
echo "VITE_REDIRECT_URI=${FRONTEND_URL}/blueprint/callback"
echo "VITE_COGNITO_POOL_ID=${COGNITO_USER_POOL_ID}"
echo "VITE_REGION=${REGION}"
