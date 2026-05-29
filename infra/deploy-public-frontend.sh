#!/bin/bash
# Deploy Blueprint public frontend only (rebuild + S3 sync + CloudFront invalidation).
#
# Usage:
#   ./infra/deploy-public-frontend.sh <profile> <region>

set -euo pipefail

PROFILE="${1:?Usage: deploy-public-frontend.sh <profile> <region>}"
REGION="${2:?}"
ENV="prd"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
CONFIG_FILE="${SCRIPT_DIR}/config/public-prd.env"

source "$CONFIG_FILE"

ACCOUNT_ID=$(aws sts get-caller-identity --profile "${PROFILE}" --region "${REGION}" --query Account --output text)

# Get stack outputs
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "blueprint-public-api-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name "blueprint-public-cognito-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='ClientId'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

COGNITO_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "blueprint-public-cognito-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

COGNITO_DOMAIN="https://${COGNITO_DOMAIN_PREFIX}.auth.${REGION}.amazoncognito.com"

DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name "blueprint-public-frontend-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

echo "============================================"
echo "  Deploying Blueprint public frontend"
echo "  Bucket: s3://${FRONTEND_BUCKET}/"
echo "  API:    ${API_ENDPOINT}"
echo "============================================"

# Write .env.production
cat > "${PROJECT_ROOT}/frontend/.env.production" <<EOF
VITE_API_ENDPOINT=${API_ENDPOINT}
VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN}
VITE_CLIENT_ID=${COGNITO_CLIENT_ID}
VITE_REDIRECT_URI=${FRONTEND_URL}/callback
VITE_COGNITO_POOL_ID=${COGNITO_POOL_ID}
VITE_REGION=${REGION}
EOF

# Build with base path = /
cd "${PROJECT_ROOT}/frontend"
VITE_BASE_PATH=/ npm run build 2>&1 | tail -5

# Sync to S3
aws s3 sync dist/ "s3://${FRONTEND_BUCKET}/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --profile "${PROFILE}" --region "${REGION}"

aws s3 cp dist/index.html "s3://${FRONTEND_BUCKET}/index.html" \
  --cache-control "public, max-age=60" \
  --content-type "text/html" \
  --profile "${PROFILE}" --region "${REGION}"

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id "${DIST_ID}" \
  --paths "/*" \
  --profile "${PROFILE}" \
  --output text --query 'Invalidation.Id'

rm -f "${PROJECT_ROOT}/frontend/.env.production"

echo ""
echo "  Done! ${FRONTEND_URL}"
echo "============================================"
