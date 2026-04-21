# AWS Deployment Runbook

This is the single source of truth for the backend deployment flow.

Scope:
- ECR repositories for the three backend services
- ECS Fargate deployment behind an Application Load Balancer
- RDS MySQL database
- Demo schema and seed loading
- Smoke testing

## Files Used

- Single env template: [/.env.example](/Users/spartan/Documents/GitHub/Linkedin-Project/.env.example:1)
- ECR IaC: [backend-ecr.yaml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/aws/backend-ecr.yaml:1)
- ECS/RDS IaC: [backend-platform.yaml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/aws/backend-platform.yaml:1)
- Bootstrap script: [aws_bootstrap_backend.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/aws_bootstrap_backend.sh:1)
- Deploy script: [aws_deploy_backend.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/aws_deploy_backend.sh:1)
- Destroy script: [aws_destroy_backend.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/aws_destroy_backend.sh:1)
- Cost-stop script: [aws_stop_backend_costs.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/aws_stop_backend_costs.sh:1)
- Schema: [schema.sql](/Users/spartan/Documents/GitHub/Linkedin-Project/data/schema.sql:1)
- Demo seed: [backend_demo_seed.sql](/Users/spartan/Documents/GitHub/Linkedin-Project/data/backend_demo_seed.sql:1)
- Smoke test: [backend_smoke_test.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/backend_smoke_test.sh:1)

## Why This Flow

This runbook follows the current AWS documentation model of:
- authenticating Docker to Amazon ECR with `aws ecr get-login-password`
- using Amazon ECS Fargate with an ECS task execution role that includes `AmazonECSTaskExecutionRolePolicy`
- deploying infrastructure through CloudFormation

## What You Need To Do In The AWS Console

These are the only console steps I want from your end before we run the scripts:

1. Sign in to the AWS account.
2. Confirm billing is enabled.
3. Choose a single region and keep all resources in that same region.
4. Create an IAM user or role for programmatic access if you have not already.
5. Give that principal access for:
   - CloudFormation
   - ECS
   - ECR
   - IAM
   - EC2 / VPC
   - RDS
   - CloudWatch Logs
6. Generate access credentials for the AWS CLI.
7. Put those credentials into your local `.env` file copied from `.env.example`.

Do not use the AWS root account for regular deployment work unless there is no alternative for initial account bootstrap.

You do not need to create ECS, ECR, RDS, ALB, or VPC resources manually in the console if we use the scripts in this repo.

## Local Machine Requirements

Install and verify:

```bash
aws --version
docker --version
docker compose version
node --version
npm --version
mysql --version
```

If any of those are missing, install them first.

## 1. Update The Single Env File

Copy the template:

```bash
cp .env.example .env
```

Fill in at least:
- `AWS_REGION`
- `AWS_ACCOUNT_ID`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN` if your credentials are temporary
- `AWS_DB_PASSWORD`
- `AWS_ADMIN_CIDR` with your current public IP in CIDR form, for example `203.0.113.10/32`

The repository names and stack names can stay as the defaults unless you want different names.
If `AWS_ADMIN_CIDR` is omitted, the deploy script will try to detect your public IP automatically and use `<your-ip>/32`.

## 2. Validate The Repo Before AWS

Run:

```bash
npm install
npm test
npm run test:backend-services
```

Optional local container validation:

```bash
docker compose -f infra/docker-compose.yml up --build -d mysql profile job application
mysql -h 127.0.0.1 -u root -plinkedin linkedinclone < data/backend_demo_seed.sql
bash scripts/backend_smoke_test.sh
```

## 3. Bootstrap ECR Repositories

This creates the three Amazon ECR repositories using CloudFormation:

```bash
bash scripts/aws_bootstrap_backend.sh
```

If your `.env` file is not in the repo root:

```bash
bash scripts/aws_bootstrap_backend.sh /full/path/to/.env
```

## 4. Build, Push, And Deploy The App Stack

Run:

```bash
bash scripts/aws_deploy_backend.sh
```

That script will:
- authenticate Docker to ECR
- build all three service images
- push all three images
- deploy the ECS + ALB + RDS CloudFormation stack
- print stack outputs

## 5. Load Schema And Demo Seed Into RDS

After the stack finishes:

1. Find the database endpoint from the CloudFormation outputs.
2. Run:

```bash
mysql -h <rds-endpoint> -u admin -p linkedinclone < data/schema.sql
mysql -h <rds-endpoint> -u admin -p linkedinclone < data/backend_demo_seed.sql
```

If the database name or user changed in `.env`, use those values instead.

## 6. Run Smoke Tests Against AWS

The stack outputs include the ALB DNS name.

Run:

```bash
bash scripts/backend_smoke_test.sh http://<alb-dns>
```

Because the helper script defaults to localhost ports, it is usually easier to run these manually against the ALB:

```bash
curl http://<alb-dns>/members/search \
  -H 'content-type: application/json' \
  -d '{"page":1,"page_size":5}'

curl http://<alb-dns>/jobs/search \
  -H 'content-type: application/json' \
  -d '{"page":1,"page_size":5}'

curl http://<alb-dns>/applications/byMember \
  -H 'content-type: application/json' \
  -d '{"member_id":"22222222-2222-2222-2222-222222222222","page":1,"page_size":5}'
```

## 7. If Deployment Fails

Check in this order:

1. CloudFormation stack events
2. ECS service events
3. ECS task health
4. CloudWatch log groups:
   - `/ecs/linkedinclone/profile`
   - `/ecs/linkedinclone/job`
   - `/ecs/linkedinclone/application`
5. RDS connectivity and schema load
6. ECR image URIs and image tags

## 8. What Is Manual vs Programmatic

Programmatic from this repo:
- create ECR repos
- build images
- push images
- deploy ECS, ALB, VPC, IAM role, and RDS stack

Manual from your side:
- AWS account creation
- billing activation
- credential generation
- optional console inspection and troubleshooting

## 9. Notes

- This stack uses public subnets and a publicly accessible RDS instance because it is optimized for class-project speed and simpler testing, not production hardening.
- The ECS tasks now log to CloudWatch Logs through the ECS task execution role path.
- The deployment flow intentionally does not merge any branch.
- To reduce ongoing cost without deleting the full environment, run `bash scripts/aws_stop_backend_costs.sh`.
- To fully remove the backend environment and avoid ongoing AWS cost, run `bash scripts/aws_destroy_backend.sh`.

## References

- Amazon ECR private registry authentication: https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html
- Pushing images to Amazon ECR: https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push.html
- Amazon ECS service load balancing: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html
- Amazon ECS task execution IAM role: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
- Amazon RDS creating a DB instance: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateDBInstance.html
- Amazon RDS MySQL getting started and connecting: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.MySQL.html
