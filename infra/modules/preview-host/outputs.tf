output "instance_id" {
  value = aws_instance.host.id
}

output "public_ip" {
  value = aws_eip.host.public_ip
}

output "postgres_password_param" {
  value = aws_ssm_parameter.postgres_password.name
}
