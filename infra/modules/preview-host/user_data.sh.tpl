#!/usr/bin/env bash
set -euo pipefail
exec > /var/log/ksat-bootstrap.log 2>&1

dnf update -y
dnf install -y docker openssl awscli
systemctl enable --now docker

# AL2023 does not ship the Compose plugin; install the pinned release.
curl -fsSL \
  "https://github.com/docker/compose/releases/download/v2.33.1/docker-compose-linux-aarch64" \
  -o /usr/libexec/docker/cli-plugins/docker-compose
chmod +x /usr/libexec/docker/cli-plugins/docker-compose

mkdir -p ${releases_dir}

cat > /etc/ksat-preview.env <<EOF
AWS_REGION=${region}
ECR_REGISTRY=${ecr_registry}
PREVIEW_DOMAIN=${preview_domain}
ACME_EMAIL=${acme_email}
BUCKET_PREFIX=${bucket_prefix}
POSTGRES_PASSWORD_PARAM=${postgres_param}
EOF
chmod 600 /etc/ksat-preview.env

aws ecr get-login-password --region ${region} |
  docker login --username AWS --password-stdin ${ecr_registry}
