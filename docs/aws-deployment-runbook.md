# AWS Deployment Runbook

This is the single source of truth for Ayush's deployment flow.

Scope:
- ECR repositories for the three Member 1 services
- ECS Fargate deployment behind an Application Load Balancer
- RDS MySQL database
- Demo schema and seed loading
- Smoke testing

## Files Used

- Env template: [/.env.aws.example](/Users/spartan/Documents/GitHub/Linkedin-Project/.env.aws.example:1)
- ECR IaC: [member1-ecr.yaml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/aws/member1-ecr.yaml:1)
- ECS/RDS IaC: [member1-ecs-rds.yaml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/aws/member1-ecs-rds.yaml:1)
- Bootstrap script: [member1_aws_bootstrap.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/member1_aws_bootstrap.sh:1)
- Deploy script: [member1_aws_deploy.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/member1_aws_deploy.sh:1)
- Schema: [schema.sql](/Users/spartan/Documents/GitHub/Linkedin-Project/data/schema.sql:1)
- Demo seed: [member1_demo_seed.sql](/Users/spartan/Documents/GitHub/Linkedin-Project/data/member1_demo_seed.sql:1)
- Smoke test: [member1_smoke_test.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/member1_smoke_test.sh:1)

## Why This Flow

This runbook follows the current AWS documentation model of:
- authenticating Docker to Amazon ECR with `aws ecr get-login-password`
- using Amazon ECS Fargate with an ECS task execution role that includes `AmazonECSTaskExecutionRolePolicy`
- deploying infrastructure through CloudFormation

## What You Need To Do In The AWS Console

These are the only console steps I want from your end before we run the scripts:

1. Sign in to the AWS account.
2. Confirm billing is enabled.
3. Choose a single region.
   Recommended: `us-west-2`
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
7. Put those credentials into a local `.env.aws` file copied from `.env.aws.example`.

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

## 1. Create The AWS Env File

Copy the template:

```bash
cp .env.aws.example .env.aws
```

Fill in at least:
- `AWS_REGION`
- `AWS_ACCOUNT_ID`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN` if your credentials are temporary
- `AWS_DB_PASSWORD`

The repository names and stack names can stay as the defaults unless you want different names.

## 2. Validate The Repo Before AWS

Run:

```bash
npm install
npm test
```

Optional local container validation:

```bash
docker compose -f infra/docker-compose.yml up --build -d mysql profile job application
mysql -h 127.0.0.1 -u root -plinkedin linkedinclone < data/member1_demo_seed.sql
bash scripts/member1_smoke_test.sh
```

## 3. Bootstrap ECR Repositories

This creates the three Amazon ECR repositories using CloudFormation:

```bash
bash scripts/member1_aws_bootstrap.sh
```

If your `.env.aws` is not in the repo root:

```bash
bash scripts/member1_aws_bootstrap.sh /full/path/to/.env.aws
```

## 4. Build, Push, And Deploy The App Stack

Run:

```bash
bash scripts/member1_aws_deploy.sh
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
mysql -h <rds-endpoint> -u admin -p linkedinclone < data/member1_demo_seed.sql
```

If the database name or user changed in `.env.aws`, use those values instead.

## 6. Run Smoke Tests Against AWS

The stack outputs include the ALB DNS name.

Run:

```bash
bash scripts/member1_smoke_test.sh http://<alb-dns>
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

## References

- Amazon ECR private registry authentication: https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html
- Pushing images to Amazon ECR: https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push.html
- Amazon ECS service load balancing: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html
- Amazon ECS task execution IAM role: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
- Amazon RDS creating a DB instance: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateDBInstance.html
- Amazon RDS MySQL getting started and connecting: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.MySQL.html
