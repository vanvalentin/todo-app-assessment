variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "project" {
  type    = string
  default = "ksat"
}

# Release environments are served from <release>.<preview_domain>.
variable "preview_domain" {
  type = string
}

variable "zone_id" {
  type = string
}

variable "acme_email" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t4g.small"
}

# Restrict to a VPN or office range to keep preview environments private.
variable "allowed_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}
