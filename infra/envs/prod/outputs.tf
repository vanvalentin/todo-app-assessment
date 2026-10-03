output "cluster_name" {
  value = module.prod.cluster_name
}

output "service_names" {
  value = module.prod.service_names
}

output "family_names" {
  value = module.prod.family_names
}

output "migrate_subnet_id" {
  value = module.prod.migrate_subnet_id
}

output "migrate_security_group_id" {
  value = module.prod.migrate_security_group_id
}

output "app_url" {
  value = module.prod.app_url
}

output "ecr_registry" {
  value = data.terraform_remote_state.shared.outputs.ecr_registry
}
