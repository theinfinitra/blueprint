#!/bin/bash
# Deploy Blueprint frontend to S3/CloudFront.
#
# Usage:
#   ./infra/deploy-frontend.sh <env> <profile> <region>
#
# Examples:
#   ./infra/deploy-frontend.sh stg infinitra-noone us-east-1

set -euo pipefail

ENV="${1:?Usage: deploy-frontend.sh <env> <profile> <region>}"
PROFILE="${2:?}"
REGION="${3:?}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
FRONTEND_DIR="${PROJECT_ROOT}/frontend"
CONFIG_FILE="${SCRIPT_DIR}/config/${ENV}.env"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: config not found: ${CONFIG_FILE}" && exit 1
fi

# shellcheck source=/dev/null
source "$CONFIG_FILE"

BUCKET="${FRONTEND_BUCKET:?FRONTEND_BUCKET not set in config}"
PREFIX="${FRONTEND_PATH:-blueprint}"

# Get API stack outputs for the .env
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "diagram-agent-${ENV}-api" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name "diagram-agent-${ENV}-api" \
  --query "Stacks[0].Outputs[?OutputKey=='ClientId'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

COGNITO_DOMAIN="https://${COGNITO_DOMAIN_PREFIX}.auth.${REGION}.amazoncognito.com"

echo "============================================"
echo "  Deploying Blueprint frontend [${ENV}]"
echo "  Bucket: s3://${BUCKET}/${PREFIX}/"
echo "  URL:    ${FRONTEND_URL}/${PREFIX}/"
echo "============================================"

# 1. Write production .env
echo "[1/4] Writing production .env..."
cat > "${FRONTEND_DIR}/.env.production" <<EOF
VITE_API_ENDPOINT=${API_ENDPOINT}
VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN}
VITE_CLIENT_ID=${CLIENT_ID}
VITE_REDIRECT_URI=${FRONTEND_URL}/${PREFIX}/callback
VITE_COGNITO_POOL_ID=${COGNITO_USER_POOL_ID}
VITE_REGION=${REGION}
EOF

# 2. Build
echo "[2/4] Building frontend..."
cd "${FRONTEND_DIR}"
npm run build 2>&1 | tail -5

# 3. Sync to S3
echo "[3/4] Syncing to s3://${BUCKET}/${PREFIX}/..."
aws s3 sync dist/ "s3://${BUCKET}/${PREFIX}/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --profile "${PROFILE}" --region "${REGION}"

# index.html should not be cached aggressively
aws s3 cp dist/index.html "s3://${BUCKET}/${PREFIX}/index.html" \
  --cache-control "public, max-age=60" \
  --content-type "text/html" \
  --profile "${PROFILE}" --region "${REGION}"

# 4. Invalidate CloudFront (find distribution by alias)
echo "[4/4] Invalidating CloudFront cache..."
DOMAIN=$(echo "${FRONTEND_URL}" | sed 's|https://||')
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?contains(@, '${DOMAIN}')]].Id" \
  --output text --profile "${PROFILE}" 2>/dev/null)

if [[ -n "$DIST_ID" && "$DIST_ID" != "None" ]]; then
  aws cloudfront create-invalidation \
    --distribution-id "${DIST_ID}" \
    --paths "/${PREFIX}/*" \
    --profile "${PROFILE}" \
    --output text --query 'Invalidation.Id' 2>&1
  echo "  Invalidated: /${PREFIX}/*"
else
  echo "  No CloudFront distribution found for ${DOMAIN} — skipping"
fi

# Cleanup
rm -f "${FRONTEND_DIR}/.env.production"

echo ""
echo "============================================"
echo "  Frontend deployed!"
echo "  ${FRONTEND_URL}/${PREFIX}/"
echo "============================================"
