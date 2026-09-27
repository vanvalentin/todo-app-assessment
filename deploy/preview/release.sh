#!/usr/bin/env bash
# Manages release environments on the preview host. Invoked by GitHub Actions over SSM.
#
#   release.sh deploy <release> <image-tag>   create or update an environment
#   release.sh destroy <release>              remove containers, database and bucket
#   release.sh prune <release>...             destroy every environment not listed
#
# Required environment (written by Terraform user data to /etc/ksat-preview.env):
#   AWS_REGION, ECR_REGISTRY, PREVIEW_DOMAIN, ACME_EMAIL, BUCKET_PREFIX, POSTGRES_PASSWORD_PARAM
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR=/opt/ksat/releases
# shellcheck source=/dev/null
source /etc/ksat-preview.env

log() { printf '[release] %s\n' "$*"; }

validate_release() {
  # Sanitized by the workflow; re-checked because the value reaches SQL, DNS and bucket names.
  [[ "$1" =~ ^release-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$ ]] || {
    echo "invalid release name: $1" >&2
    exit 2
  }
}

psql_admin() {
  docker exec -i preview-postgres psql -v ON_ERROR_STOP=1 -U postgres -tAq "$@"
}

start_host_services() {
  local postgres_password
  postgres_password="$(aws ssm get-parameter --with-decryption --name "$POSTGRES_PASSWORD_PARAM" \
    --query Parameter.Value --output text)"
  POSTGRES_PASSWORD="$postgres_password" docker compose -f "$SCRIPT_DIR/compose.host.yaml" up -d --wait
}

write_release_env() {
  local release="$1" env_file="$2" db="${1//-/_}"
  [[ -f "$env_file" ]] && return 0
  local db_password auth_secret url="https://$release.$PREVIEW_DOMAIN"
  db_password="$(openssl rand -hex 24)"
  auth_secret="$(openssl rand -hex 32)"

  psql_admin -c "CREATE ROLE $db LOGIN PASSWORD '$db_password'"
  psql_admin -c "CREATE DATABASE $db OWNER $db"
  aws s3api create-bucket --bucket "$BUCKET_PREFIX-$release" --region "$AWS_REGION" \
    --create-bucket-configuration "LocationConstraint=$AWS_REGION" >/dev/null

  umask 077
  cat >"$env_file" <<EOF
NODE_ENV=production
TRUST_PROXY=true
DATABASE_URL=postgresql://$db:$db_password@preview-postgres:5432/$db
REDIS_URL=redis://redis:6379
S3_AUTH=iam
S3_REGION=$AWS_REGION
S3_BUCKET=$BUCKET_PREFIX-$release
S3_FORCE_PATH_STYLE=false
BETTER_AUTH_URL=$url
BETTER_AUTH_SECRET=$auth_secret
BETTER_AUTH_TRUSTED_ORIGINS=$url
BETTER_AUTH_SECURE_COOKIES=true
APP_PUBLIC_URL=$url
SEED_DEMO_DATA=true
ALLOW_PRODUCTION_DEMO_SEED=true
SMTP_HOST=preview-mailpit
SMTP_PORT=1025
MAIL_FROM=Ksat preview <no-reply@$PREVIEW_DOMAIN>
EOF
}

compose_release() {
  local release="$1" tag="$2"
  shift 2
  RELEASE="$release" IMAGE_TAG="$tag" ECR_REGISTRY="$ECR_REGISTRY" PREVIEW_DOMAIN="$PREVIEW_DOMAIN" \
    RELEASE_ENV_FILE="$STATE_DIR/$release/release.env" \
    docker compose -f "$SCRIPT_DIR/compose.release.yaml" "$@"
}

deploy() {
  local release="$1" tag="$2"
  validate_release "$release"
  [[ "$tag" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid image tag: $tag" >&2; exit 2; }

  aws ecr get-login-password --region "$AWS_REGION" |
    docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null
  start_host_services

  mkdir -p "$STATE_DIR/$release"
  write_release_env "$release" "$STATE_DIR/$release/release.env"
  echo "$tag" >"$STATE_DIR/$release/image-tag"

  log "deploying $release at $tag"
  compose_release "$release" "$tag" pull --quiet
  # --wait fails the deploy if migrations fail or the API never becomes healthy.
  compose_release "$release" "$tag" up -d --wait --remove-orphans
  log "ready at https://$release.$PREVIEW_DOMAIN"
}

destroy() {
  local release="$1" db="${1//-/_}"
  validate_release "$release"
  log "destroying $release"
  if [[ -f "$STATE_DIR/$release/release.env" ]]; then
    compose_release "$release" "$(cat "$STATE_DIR/$release/image-tag")" down --volumes --remove-orphans
  fi
  psql_admin -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"
  psql_admin -c "DROP ROLE IF EXISTS $db"
  aws s3 rb "s3://$BUCKET_PREFIX-$release" --force >/dev/null 2>&1 || true
  rm -rf "${STATE_DIR:?}/$release"
}

prune() {
  local keep=" $* " dir release
  for dir in "$STATE_DIR"/release-*; do
    [[ -d "$dir" ]] || continue
    release="$(basename "$dir")"
    [[ "$keep" == *" $release "* ]] || destroy "$release"
  done
}

case "${1:-}" in
  deploy) deploy "$2" "$3" ;;
  destroy) destroy "$2" ;;
  prune) shift; prune "$@" ;;
  *) echo "usage: $0 deploy|destroy|prune ..." >&2; exit 2 ;;
esac
