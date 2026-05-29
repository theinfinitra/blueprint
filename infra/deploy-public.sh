#!/bin/bash
# Deploy Blueprint public stack (Cognito + API GW + CloudFront + Frontend).
#
# Usage:
#   ./infra/deploy-public.sh <profile> <region>
#
# Prerequisites:
#   - infra/config/public-prd.env filled with LinkedIn credentials
#   - ACM certificate for blueprint.theinfinitra.com in us-east-1
#   - Route 53 hosted zone for theinfinitra.com

set -euo pipefail

PROFILE="${1:?Usage: deploy-public.sh <profile> <region>}"
REGION="${2:?}"
ENV="prd"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
CFN_DIR="${SCRIPT_DIR}/cfn"
CONFIG_FILE="${SCRIPT_DIR}/config/public-prd.env"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: config not found: ${CONFIG_FILE}" && exit 1
fi

source "$CONFIG_FILE"

# Validate required config
: "${LINKEDIN_CLIENT_ID:?Set LINKEDIN_CLIENT_ID in public-prd.env}"
: "${LINKEDIN_CLIENT_SECRET:?Set LINKEDIN_CLIENT_SECRET in public-prd.env}"
: "${COGNITO_DOMAIN_PREFIX:?Set COGNITO_DOMAIN_PREFIX in public-prd.env}"
: "${FRONTEND_URL:?Set FRONTEND_URL in public-prd.env}"
: "${FRONTEND_BUCKET:?Set FRONTEND_BUCKET in public-prd.env}"
: "${S3_BUCKET:?Set S3_BUCKET in public-prd.env}"

ACCOUNT_ID=$(aws sts get-caller-identity --profile "${PROFILE}" --region "${REGION}" --query Account --output text)

echo "============================================"
echo "  Deploying Blueprint Public [${ENV}]"
echo "  Account: ${ACCOUNT_ID}"
echo "  Region:  ${REGION}"
echo "  Domain:  blueprint.theinfinitra.com"
echo "============================================"

# ── 1. Cognito User Pool + LinkedIn IdP ──────────────────────────────────
echo ""
echo "[1/6] Deploying Cognito pool with LinkedIn IdP..."
aws cloudformation deploy \
  --stack-name "blueprint-public-cognito-${ENV}" \
  --template-file "${CFN_DIR}/cognito-public.yaml" \
  --parameter-overrides \
    Environment="${ENV}" \
    LinkedInClientId="${LINKEDIN_CLIENT_ID}" \
    LinkedInClientSecret="${LINKEDIN_CLIENT_SECRET}" \
    CognitoDomainPrefix="${COGNITO_DOMAIN_PREFIX}" \
    FrontendUrl="${FRONTEND_URL}" \
  --no-fail-on-empty-changeset \
  --profile "${PROFILE}" --region "${REGION}"

COGNITO_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "blueprint-public-cognito-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name "blueprint-public-cognito-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='ClientId'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

echo "  Pool: ${COGNITO_POOL_ID}"
echo "  Client: ${COGNITO_CLIENT_ID}"

# ── 2. Public API Gateway ─────────────────────────────────────────────────
echo ""
echo "[2/6] Deploying public API Gateway..."
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:diagram-agent-${ENV}"
LAMBDA_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/diagram-agent-${ENV}-role"

aws cloudformation deploy \
  --stack-name "blueprint-public-api-${ENV}" \
  --template-file "${CFN_DIR}/api-public.yaml" \
  --parameter-overrides \
    Environment="${ENV}" \
    CognitoUserPoolId="${COGNITO_POOL_ID}" \
    CognitoClientId="${COGNITO_CLIENT_ID}" \
    FrontendUrl="${FRONTEND_URL}" \
    LambdaFunctionArn="${LAMBDA_ARN}" \
    LambdaRoleArn="${LAMBDA_ROLE_ARN}" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --profile "${PROFILE}" --region "${REGION}"

API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "blueprint-public-api-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

echo "  API: ${API_ENDPOINT}"

# ── 3. Update internal Lambda env vars ────────────────────────────────────
echo ""
echo "[3/6] Updating Lambda environment variables..."
USAGE_TABLE="blueprint-usage-${ENV}"
INTERNAL_POOL_ID=$(grep COGNITO_USER_POOL_ID "${SCRIPT_DIR}/config/prd.env" | cut -d= -f2)

aws lambda update-function-configuration \
  --function-name "diagram-agent-${ENV}" \
  --environment "Variables={S3_BUCKET=${S3_BUCKET},USAGE_TABLE=${USAGE_TABLE},INTERNAL_POOL_ID=${INTERNAL_POOL_ID}}" \
  --profile "${PROFILE}" --region "${REGION}" \
  --output text --query 'LastUpdateStatus' 2>&1 || true

# ── 4. CloudFront + S3 (requires ACM cert in us-east-1) ──────────────────
echo ""
echo "[4/6] Deploying CloudFront + S3..."

# Find ACM cert for blueprint.theinfinitra.com in us-east-1
CERT_ARN=$(aws acm list-certificates \
  --profile "${PROFILE}" --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='blueprint.theinfinitra.com'].CertificateArn" \
  --output text 2>/dev/null)

if [[ -z "$CERT_ARN" || "$CERT_ARN" == "None" ]]; then
  echo "  No ACM cert found for blueprint.theinfinitra.com in us-east-1."
  echo "  Creating certificate request..."
  CERT_ARN=$(aws acm request-certificate \
    --domain-name "blueprint.theinfinitra.com" \
    --validation-method DNS \
    --profile "${PROFILE}" --region us-east-1 \
    --output text --query 'CertificateArn')
  echo "  Certificate ARN: ${CERT_ARN}"
  echo "  ⚠️  You must validate the DNS record before CloudFront will work."
  echo "  Run: aws acm describe-certificate --certificate-arn ${CERT_ARN} --profile ${PROFILE} --region us-east-1"
  echo "  Then add the CNAME record to Route 53."
  echo ""
  read -p "  Press Enter once DNS validation is complete (or Ctrl+C to abort)..."
fi

# Find hosted zone — skipped, DNS is on GoDaddy
echo "  Cert: ${CERT_ARN}"

aws cloudformation deploy \
  --stack-name "blueprint-public-frontend-${ENV}" \
  --template-file "${CFN_DIR}/frontend-public.yaml" \
  --parameter-overrides \
    Environment="${ENV}" \
    CertificateArn="${CERT_ARN}" \
  --no-fail-on-empty-changeset \
  --profile "${PROFILE}" --region "${REGION}"

# ── 5. Build frontend ─────────────────────────────────────────────────────
echo ""
echo "[5/6] Building and deploying frontend..."
COGNITO_DOMAIN="https://${COGNITO_DOMAIN_PREFIX}.auth.${REGION}.amazoncognito.com"

cat > "${PROJECT_ROOT}/frontend/.env.production" <<EOF
VITE_API_ENDPOINT=${API_ENDPOINT}
VITE_COGNITO_DOMAIN=${COGNITO_DOMAIN}
VITE_CLIENT_ID=${COGNITO_CLIENT_ID}
VITE_REDIRECT_URI=${FRONTEND_URL}/callback
VITE_COGNITO_POOL_ID=${COGNITO_POOL_ID}
VITE_REGION=${REGION}
EOF

cd "${PROJECT_ROOT}/frontend"
VITE_BASE_PATH=/ npm run build 2>&1 | tail -5

# ── 6. Sync to S3 + invalidate ────────────────────────────────────────────
echo ""
echo "[6/6] Syncing to S3 and invalidating CloudFront..."
aws s3 sync dist/ "s3://${FRONTEND_BUCKET}/" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --profile "${PROFILE}" --region "${REGION}"

aws s3 cp dist/index.html "s3://${FRONTEND_BUCKET}/index.html" \
  --cache-control "public, max-age=60" \
  --content-type "text/html" \
  --profile "${PROFILE}" --region "${REGION}"

DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name "blueprint-public-frontend-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

if [[ -n "$DIST_ID" && "$DIST_ID" != "None" ]]; then
  aws cloudfront create-invalidation \
    --distribution-id "${DIST_ID}" \
    --paths "/*" \
    --profile "${PROFILE}" \
    --output text --query 'Invalidation.Id' 2>&1
fi

# Cleanup
rm -f "${PROJECT_ROOT}/frontend/.env.production"

DIST_DOMAIN=$(aws cloudformation describe-stacks \
  --stack-name "blueprint-public-frontend-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomain'].OutputValue" \
  --output text --profile "${PROFILE}" --region "${REGION}")

echo ""
echo "============================================"
echo "  Blueprint Public deployed!"
echo "============================================"
echo ""
echo "  URL:      ${FRONTEND_URL}"
echo "  API:      ${API_ENDPOINT}"
echo "  Cognito:  ${COGNITO_DOMAIN}"
echo "  Client:   ${COGNITO_CLIENT_ID}"
echo ""
echo "  ── GoDaddy DNS (add if not already set) ──"
echo "  Type:  CNAME"
echo "  Name:  blueprint"
echo "  Value: ${DIST_DOMAIN}"
echo ""
echo "  ── LinkedIn App (add redirect URL) ──"
echo "  ${COGNITO_DOMAIN}/oauth2/idpresponse"
echo "============================================"
