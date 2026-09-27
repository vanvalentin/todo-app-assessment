# Infrastructure

Terraform for the two deployment targets, plus the shared platform they both use.
Nothing here is deployed yet: the deploy workflows skip until the
`AWS_DEPLOY_ENABLED` repository variable is `true`.

## Layout

```text
infra/
├── modules/
│   ├── network/        # VPC, public/private subnets, NAT
│   ├── prod/           # ECS Fargate, ALB, Aurora Serverless v2, ElastiCache, S3
│   └── preview-host/   # One EC2 host for release environments
└── envs/
    ├── shared/         # Network, ECR, GitHub OIDC roles, deploy artifacts
    ├── prod/           # Production stack
    └── preview/        # The release host and its wildcard DNS record
```

Each environment has its own state file in one versioned S3 bucket. State locking
uses the S3 backend's `use_lockfile` (Terraform 1.10 or newer), so no DynamoDB table
is needed.

## Bootstrap

The bucket names are placeholders. To use this for real:

1. Create the state bucket (`ksat-terraform-state`), an artifacts bucket
   (`ksat-deploy-artifacts`) and a Route 53 hosted zone.
2. Update the bucket names in `envs/*/versions.tf` and `envs/*/main.tf` if you rename
   them, then set the domain variables in `envs/prod/terraform.tfvars` and
   `envs/preview/terraform.tfvars`.
3. Apply `shared`, then `prod` and `preview`. The first `prod` apply uses a placeholder
   image tag; the deploy workflow registers the real task definitions.

```bash
cd infra/envs/shared  && terraform init && terraform apply -var github_repo=<owner>/<repo>
cd ../prod            && terraform init && terraform apply
cd ../preview         && terraform init && terraform apply
```

`envs/prod` and `envs/preview` read the network, ECR registry and artifacts bucket from
`envs/shared` through a remote state data source, so apply `shared` first.

## Repository variables

| Variable | Purpose |
| --- | --- |
| `AWS_DEPLOY_ENABLED` | `true` enables the deploy and teardown workflows; anything else skips them |
| `AWS_REGION` | Region for every AWS call (defaults to `eu-west-1`) |
| `AWS_PROD_DEPLOY_ROLE_ARN` | Output `prod_deploy_role_arn` from `envs/shared` |
| `AWS_PREVIEW_DEPLOY_ROLE_ARN` | Output `preview_deploy_role_arn` from `envs/shared` |

Both roles are assumed through GitHub OIDC, so no AWS keys are stored in GitHub. The
production role only trusts the `production` GitHub Environment, and the preview role
only trusts `release/*` branches. Add required reviewers to the `production`
environment to gate production deploys.

## Conventions

- The provider lock files are not committed, so `terraform init` resolves providers on
  each machine. Commit them instead once you pin upgrades deliberately.
- Individual release environments are not Terraform resources. The deploy workflow
  creates them on the preview host and the teardown workflow removes them.
- `terraform fmt -check` and `terraform validate` run in `.github/workflows/infra.yml`
  on every change under `infra/`.
