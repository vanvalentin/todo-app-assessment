output "vpc_id" {
  value = module.network.vpc_id
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "public_subnet_ids" {
  value = module.network.public_subnet_ids
}

output "ecr_registry" {
  value = local.ecr_registry
}

output "artifacts_bucket" {
  value = aws_s3_bucket.artifacts.id
}

output "preview_bucket_prefix" {
  value = var.preview_bucket_prefix
}

output "prod_deploy_role_arn" {
  value = aws_iam_role.prod_deploy.arn
}

output "preview_deploy_role_arn" {
  value = aws_iam_role.preview_deploy.arn
}
