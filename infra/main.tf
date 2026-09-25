# Provider schema source: hashicorp/terraform-provider-aws v6.66.0,
# website/docs/r/bedrockagentcore_harness.html.markdown.
locals {
  harness = jsondecode(file("${path.module}/../config/create-harness.json"))
  model   = local.harness.model.bedrockModelConfig
  runtime = local.harness.environment.agentCoreRuntimeEnvironment
}

resource "aws_iam_role" "harness" {
  name        = "livenation-demo-harness"
  description = "Execution role for the Live Nation managed AgentCore Harness demo"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "bedrock-agentcore.amazonaws.com"
      }
      Action = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = "009073575420"
        }
        ArnLike = {
          "aws:SourceArn" = "arn:aws:bedrock-agentcore:us-east-1:009073575420:*"
        }
      }
    }]
  })

  tags = {
    project     = "livenation-demo"
    environment = "demo"
  }
}

resource "aws_iam_role_policy" "harness" {
  name = "livenation-demo-harness-execution"
  role = aws_iam_role.harness.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BedrockModelInvocation"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = "arn:aws:bedrock:us-east-1::foundation-model/moonshotai.kimi-k2.5"
      },
      {
        Sid      = "EcrPublicTokenAccess"
        Effect   = "Allow"
        Action   = "ecr-public:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid      = "StsForEcrPublicPull"
        Effect   = "Allow"
        Action   = "sts:GetServiceBearerToken"
        Resource = "*"
      },
      {
        Sid    = "XRayTracingAccess"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets"
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogsGroup"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:us-east-1:009073575420:log-group:/aws/bedrock-agentcore/runtimes/*"
      },
      {
        Sid      = "CloudWatchLogsDescribeGroups"
        Effect   = "Allow"
        Action   = "logs:DescribeLogGroups"
        Resource = "arn:aws:logs:us-east-1:009073575420:log-group:*"
      },
      {
        Sid    = "CloudWatchLogsStream"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:us-east-1:009073575420:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"
      },
      {
        Sid      = "CloudWatchLogsPutResourcePolicy"
        Effect   = "Allow"
        Action   = "logs:PutResourcePolicy"
        Resource = "*"
      },
      {
        Sid      = "CloudWatchMetricsPublish"
        Effect   = "Allow"
        Action   = "cloudwatch:PutMetricData"
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "bedrock-agentcore"
          }
        }
      },
      {
        Sid    = "AgentCoreWorkloadIdentity"
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:GetWorkloadAccessToken",
          "bedrock-agentcore:GetWorkloadAccessTokenForJWT"
        ]
        Resource = [
          "arn:aws:bedrock-agentcore:us-east-1:009073575420:workload-identity-directory/default",
          "arn:aws:bedrock-agentcore:us-east-1:009073575420:workload-identity-directory/default/workload-identity/harness_livenation_demo-*"
        ]
      }
    ]
  })
}

resource "aws_bedrockagentcore_harness" "demo" {
  harness_name          = local.harness.harnessName
  execution_role_arn    = aws_iam_role.harness.arn
  allowed_tools         = local.harness.allowedTools
  environment_variables = local.harness.environmentVariables
  max_iterations        = local.harness.maxIterations
  max_tokens            = local.harness.maxTokens
  timeout_seconds       = local.harness.timeoutSeconds
  tags                  = local.harness.tags

  depends_on = [aws_iam_role_policy.harness]

  model {
    bedrock_model_config {
      model_id   = local.model.modelId
      api_format = local.model.apiFormat
      max_tokens = local.model.maxTokens
    }
  }

  dynamic "system_prompt" {
    for_each = local.harness.systemPrompt
    content {
      text = system_prompt.value.text
    }
  }

  dynamic "tool" {
    for_each = local.harness.tools
    content {
      type = tool.value.type
      name = tool.value.name
      config {
        inline_function {
          description  = tool.value.config.inlineFunction.description
          input_schema = jsonencode(tool.value.config.inlineFunction.inputSchema)
        }
      }
    }
  }

  memory {
    disabled {}
  }

  truncation {
    strategy = local.harness.truncation.strategy
    config {
      sliding_window {
        messages_count = local.harness.truncation.config.slidingWindow.messagesCount
      }
    }
  }

  environment {
    agentcore_runtime_environment {
      lifecycle_configuration {
        idle_runtime_session_timeout = local.runtime.lifecycleConfiguration.idleRuntimeSessionTimeout
        max_lifetime                 = local.runtime.lifecycleConfiguration.maxLifetime
      }
      network_configuration {
        network_mode = local.runtime.networkConfiguration.networkMode
      }
    }
  }
}

output "harness_arn" {
  value = aws_bedrockagentcore_harness.demo.arn
}

output "harness_id" {
  value = aws_bedrockagentcore_harness.demo.harness_id
}

output "execution_role_arn" {
  value = aws_iam_role.harness.arn
}

output "agent_runtime_arn" {
  value = aws_bedrockagentcore_harness.demo.environment_actual[0].agentcore_runtime_environment[0].agent_runtime_arn
}
