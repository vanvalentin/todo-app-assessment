data "terraform_remote_state" "shared" {
  backend = "s3"

  config = {
    bucket = "ksat-terraform-state"
    key    = "shared/terraform.tfstate"
    region = var.region
  }
}

module "preview_host" {
  source = "../../modules/preview-host"

  name             = "${var.project}-preview-host"
  region           = var.region
  vpc_id           = data.terraform_remote_state.shared.outputs.vpc_id
  subnet_id        = data.terraform_remote_state.shared.outputs.public_subnet_ids[0]
  ecr_registry     = data.terraform_remote_state.shared.outputs.ecr_registry
  artifacts_bucket = data.terraform_remote_state.shared.outputs.artifacts_bucket
  bucket_prefix    = data.terraform_remote_state.shared.outputs.preview_bucket_prefix
  preview_domain   = var.preview_domain
  zone_id          = var.zone_id
  acme_email       = var.acme_email
  instance_type    = var.instance_type
  allowed_cidrs    = var.allowed_cidrs
}
