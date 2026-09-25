# Local preparation only. The execution role does not exist in this module.
# Review its trust, model, and telemetry permissions before deployment.
# Provider schema source: hashicorp/terraform-provider-aws v6.66.0,
# website/docs/r/bedrockagentcore_harness.html.markdown.
locals {
  harness = jsondecode(file("${path.module}/../config/create-harness.json"))
  model   = local.harness.model.bedrockModelConfig
  runtime = local.harness.environment.agentCoreRuntimeEnvironment
}

resource "aws_bedrockagentcore_harness" "demo" {
  harness_name       = local.harness.harnessName
  execution_role_arn = local.harness.executionRoleArn
  allowed_tools      = local.harness.allowedTools
  max_iterations     = local.harness.maxIterations
  max_tokens         = local.harness.maxTokens
  timeout_seconds    = local.harness.timeoutSeconds
  tags               = local.harness.tags

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
