variable "name" {
  type = string
}

variable "cidr" {
  type = string
}

variable "availability_zones" {
  type    = list(string)
  default = ["eu-west-1a", "eu-west-1b"]
}
