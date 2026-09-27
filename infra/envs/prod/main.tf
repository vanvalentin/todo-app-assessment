data "terraform_remote_state" "shared" {
  backend = "s3"

  config = {
    bucket = "ksat-terraform-state"
    key    = "shared/terraform.tfstate"
    region = var.region
  }
}

module "prod" {
  source = "../../modules/prod"

  name               = "${var.project}-prod"
  region             = var.region
  vpc_id             = data.terraform_remote_state.shared.outputs.vpc_id
  public_subnet_ids  = data.terraform_remote_state.shared.outputs.public_subnet_ids
  private_subnet_ids = data.terraform_remote_state.shared.outputs.private_subnet_ids
  ecr_registry       = data.terraform_remote_state.shared.outputs.ecr_registry
  domain             = var.domain
  zone_id            = var.zone_id
  image_tag          = var.image_tag
  db_min_capacity    = var.db_min_capacity
  db_max_capacity    = var.db_max_capacity
  redis_node_type    = var.redis_node_type
}
