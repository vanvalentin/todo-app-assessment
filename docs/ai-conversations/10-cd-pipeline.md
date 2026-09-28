# 10 — CD pipeline

**Goal:** describe a trunk-based deployment to AWS as code, without provisioning real infrastructure.

---

**Me:**

> I would like to add a CD pipeline:
>
> - Trunk-based development with:
>   - push to master deploys to prod
>   - push to `release/*` deploys to a brand new release environment (not sure if that's viable for the backend?)
>
> Using AWS services (but we won't set it up for real). Can you draft a plan?

**Agent — plan (condensed):** Per-release environments are viable if each release gets its **own database** rather than a copy of prod. Asked for decisions on IaC tool, database isolation, migration visibility and the release runtime.

**Me:**

> 1. Terraform
> 2. Per-release database
> 3. Should it post a GitHub message on the PR merging to master if any migration needs to run?
> 4. Nginx, but what about something simpler? We want to keep costs low for release branches (ECS for prod though).
>
> For the README, add a quick CI/CD section (if it wasn't already there). Don't overwhelm it with details, as it's an assessment.

**Agent — revised plan (condensed):**

| Branch       | Environment      | Runs on                                                                                                   |
| ------------ | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `master`     | prod             | ECS Fargate (web, api, worker; `migrate` as a one-off task), ALB, Aurora PostgreSQL, ElastiCache, S3, SES |
| `release/*`  | `release-<name>` | One small EC2 host running Docker Compose. Extra branches cost almost nothing                             |
| Pull request | —                | CI, `terraform validate`, and a comment listing pending migrations                                        |

- Prod deploy: migrations first, then a rolling ECS deploy that **rolls back** if the new version doesn't become healthy.
- Nothing deploys until the `AWS_DEPLOY_ENABLED` repository variable is set.

---

**Me:** You can start the implementation. Once done, create a new branch and a PR whose description is a simple explanation of the CD (with a diagram if possible and needed).

**Agent (condensed):**

- Terraform for `shared`, `prod` and `preview`, with `terraform validate` and `fmt -check` passing for all three.
- Four workflows (deploy, release teardown, infra check, migration report), checked with `actionlint`.
- Caught its own bug before shipping: the roll step would have pushed the API image to the web service.
- Found that `auth_token` isn't supported on a single-node ElastiCache cluster and switched to a replication group.
- Opened PR #1 with a diagram-based description.
