variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "project" {
  type    = string
  default = "ksat"
}

variable "domain" {
  type = string
}

variable "zone_id" {
  type = string
}

# Placeholder on the first apply; the deploy workflow registers task definitions that
# point at the immutable commit SHA it just pushed.
variable "image_tag" {
  type    = string
  default = "bootstrap"
}

variable "db_min_capacity" {
  type    = number
  default = 0.5
}

variable "db_max_capacity" {
  type    = number
  default = 2
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
