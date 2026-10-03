variable "name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "region" {
  type = string
}

variable "ecr_registry" {
  type = string
}

variable "artifacts_bucket" {
  type = string
}

variable "bucket_prefix" {
  type = string
}

variable "preview_domain" {
  type = string
}

variable "acme_email" {
  type = string
}

variable "zone_id" {
  type = string
}

variable "allowed_cidrs" {
  type        = list(string)
  default     = ["0.0.0.0/0"]
  description = "CIDRs allowed to reach ports 80/443 on the preview host."
}

variable "instance_type" {
  type    = string
  default = "t4g.small"
}
