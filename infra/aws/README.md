## AWS deployment (ECS)

This repo includes CloudFormation templates for deploying:

- **Backend-only (legacy)**: `infra/aws/backend-ecr.yaml`, `infra/aws/backend-platform.yaml` (profile/job/application)
- **Full stack (all microservices + Kafka/Redis/Mongo + RDS MySQL)**:
  - `infra/aws/full-ecr.yaml`
  - `infra/aws/full-platform.yaml`

### Full stack: expected architecture

- **ECS Fargate**: api-gateway, profile, job, application, messaging, connection, analytics, ai-agent
- **RDS MySQL**: relational/transactional data
- **MongoDB (ECS task)**: connections mirror + logs/traces/events
- **Redis (ECS task)**: caching
- **Kafka (ECS task)**: async workflow + AI orchestration topics
- **Cloud Map**: service discovery under `linkedinclone.local`
- **ALB**: public entrypoint to `api-gateway`

### Deploy steps (CLI outline)

1. Create ECR repos

```bash
aws cloudformation deploy \
  --stack-name linkedinclone-ecr \
  --template-file infra/aws/full-ecr.yaml \
  --capabilities CAPABILITY_NAMED_IAM
```

2. Build and push images to the returned repository URIs (tag `latest`).

3. Deploy the platform stack

```bash
aws cloudformation deploy \
  --stack-name linkedinclone-full \
  --template-file infra/aws/full-platform.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    AdminCidr=<your-ip>/32 \
    DbPassword=<password> \
    ApiGatewayImageUri=<ecr-uri>:latest \
    ProfileImageUri=<ecr-uri>:latest \
    JobImageUri=<ecr-uri>:latest \
    ApplicationImageUri=<ecr-uri>:latest \
    MessagingImageUri=<ecr-uri>:latest \
    ConnectionImageUri=<ecr-uri>:latest \
    AnalyticsImageUri=<ecr-uri>:latest \
    AiAgentImageUri=<ecr-uri>:latest
```

After deploy, the CloudFormation output `AlbDnsName` is the entrypoint for the UI/API client (via api-gateway).

