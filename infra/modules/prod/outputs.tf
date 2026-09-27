output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

# ECS service names in the order they are rolled out; the workflow pairs each service
# with the task definition family it runs.
output "service_names" {
  value = [
    aws_ecs_service.web.name,
    aws_ecs_service.api.name,
    aws_ecs_service.worker.name,
  ]
}

output "family_names" {
  value = {
    web     = aws_ecs_task_definition.web.family
    api     = aws_ecs_task_definition.api.family
    worker  = aws_ecs_task_definition.worker.family
    migrate = aws_ecs_task_definition.migrate.family
  }
}

output "migrate_subnet_id" {
  value = var.private_subnet_ids[0]
}

output "migrate_security_group_id" {
  value = aws_security_group.app.id
}

output "app_url" {
  value = "https://${var.domain}"
}
