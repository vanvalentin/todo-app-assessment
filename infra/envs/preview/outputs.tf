output "instance_id" {
  value = module.preview_host.instance_id
}

output "public_ip" {
  value = module.preview_host.public_ip
}

output "postgres_password_param" {
  value = module.preview_host.postgres_password_param
}

output "preview_domain" {
  value = var.preview_domain
}
