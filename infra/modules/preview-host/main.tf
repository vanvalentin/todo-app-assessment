data "aws_ssm_parameter" "al2023_arm64_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-minimal-kernel-6.1-arm64"
}

data "aws_caller_identity" "current" {}

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "postgres_password" {
  name  = "/${var.name}/postgres-password"
  type  = "SecureString"
  value = random_password.postgres.result

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_security_group" "host" {
  name   = var.name
  vpc_id = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = var.name }
}

# Scoped S3 access: its own release buckets plus the deploy-artifact bucket.
resource "aws_iam_role" "host" {
  name = var.name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "host_ssm" {
  role       = aws_iam_role.host.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "host" {
  name = "permissions"
  role = aws_iam_role.host.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:GetRepositoryPolicy",
        ]
        Resource = [
          "${var.ecr_registry}/ksat-api",
          "${var.ecr_registry}/ksat-web",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.name}/*"]
      },
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::${var.artifacts_bucket}/*",
          "arn:aws:s3:::${var.bucket_prefix}-*",
          "arn:aws:s3:::${var.bucket_prefix}-*/*",
        ]
      },
    ]
  })
}

resource "aws_iam_instance_profile" "host" {
  name = var.name
  role = aws_iam_role.host.name
}

resource "aws_instance" "host" {
  ami                         = data.aws_ssm_parameter.al2023_arm64_ami.value
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.host.id]
  iam_instance_profile        = aws_iam_instance_profile.host.name
  associate_public_ip_address = true
  user_data_replace_on_change = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tpl", {
    region         = var.region
    ecr_registry   = var.ecr_registry
    preview_domain = var.preview_domain
    acme_email     = var.acme_email
    bucket_prefix  = var.bucket_prefix
    postgres_param = aws_ssm_parameter.postgres_password.name
    releases_dir   = "/opt/ksat/releases"
  }))

  tags = { Name = var.name }
}

resource "aws_eip" "host" {
  domain = "vpc"
}

resource "aws_eip_association" "host" {
  instance_id   = aws_instance.host.id
  allocation_id = aws_eip.host.id
}

resource "aws_route53_record" "wildcard" {
  zone_id = var.zone_id
  name    = "*.${var.preview_domain}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.host.public_ip]
}
