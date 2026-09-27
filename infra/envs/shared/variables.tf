variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "project" {
  type    = string
  default = "ksat"
}

variable "availability_zones" {
  type    = list(string)
  default = ["eu-west-1a", "eu-west-1b"]
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

# "owner/repository" of this GitHub repository; restricts the OIDC trust policy.
variable "github_repo" {
  type = string
}

variable "artifacts_bucket" {
  type        = string
  default     = "ksat-deploy-artifacts"
  description = "Bucket the deploy workflow uploads release Compose files to."
}

variable "preview_bucket_prefix" {
  type    = string
  default = "ksat-preview"
}

variable "ecr_image_retention_count" {
  type    = number
  default = 30
}
