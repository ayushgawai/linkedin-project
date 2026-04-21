# Member 1 Manual Follow-Up Checklist

Canonical deployment guide: [aws-deployment-runbook.md](/Users/spartan/Documents/GitHub/Linkedin-Project/docs/aws-deployment-runbook.md:1)

This document covers the work that still needs a human account owner or project lead to complete after the code on `feature/ayush/backend-infra-foundation` is ready.

## 1. What Is Already Done In Code

- Profile, Job, and Application services are implemented.
- Automated tests exist for Member 1 service behavior.
- CI is configured to install dependencies and run tests.
- Local Docker Compose support is added for `mysql`, `profile`, `job`, and `application`.
- AWS CloudFormation for ECS Fargate + ALB + RDS is added.
- Deployment instructions are in `docs/member1-aws-deployment.md`.

## 2. GitHub Steps You Still Need To Do

1. Open the pushed branch:
   `feature/ayush/backend-infra-foundation`
2. Create a PR from that branch into your target base branch.
3. Do not merge yet.
4. Request review from Claude Opus 4.6 and any teammates/prof-required reviewers.
5. Confirm GitHub Actions is green on the PR.
6. Only after review, you decide whether to merge manually.

## 3. GitHub Repo Settings To Check

1. Go to `Settings -> Actions -> General`.
   Make sure GitHub Actions is enabled.
2. Go to `Settings -> Branches`.
   Add a branch protection rule for your main branch if needed.
3. Require:
   - pull request before merge
   - status checks to pass
   - at least one approval if your team wants that
4. Confirm the repo has permission to pull npm packages normally.

## 4. AWS Account Preparation

You must do this in your own AWS account because I cannot create or verify accounts here.

1. Sign in to AWS.
2. Pick one region and keep everything there.
   Recommended for class simplicity: `us-west-2`
3. Create or confirm access for:
   - ECS
   - ECR
   - RDS
   - CloudFormation
   - IAM
   - VPC
   - CloudWatch Logs
4. Make sure billing is enabled on the account.
5. Make sure the account can launch:
   - `db.t3.micro`
   - ECS Fargate tasks
6. Install and configure AWS CLI locally:

```bash
aws configure
```

You will need:
- AWS Access Key ID
- AWS Secret Access Key
- default region
- default output format

## 5. ECR Setup

Create the three image repositories if they do not already exist.

```bash
aws ecr create-repository --repository-name linkedinclone-profile --region us-west-2
aws ecr create-repository --repository-name linkedinclone-job --region us-west-2
aws ecr create-repository --repository-name linkedinclone-application --region us-west-2
```

Then authenticate Docker to ECR:

```bash
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-west-2.amazonaws.com
```

## 6. Docker Requirement

You must have Docker Desktop or equivalent installed and running on your machine.

Check:

```bash
docker --version
docker compose version
```

If Docker is missing, install Docker Desktop first before trying local compose or ECR pushes.

## 7. Local Pre-Deploy Checklist

Run these yourself before AWS deploy:

```bash
npm install
npm test
docker compose -f infra/docker-compose.yml up --build -d mysql profile job application
```

Then test locally:

```bash
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
```

If MySQL schema needs reset:

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up --build -d mysql profile job application
```

## 8. Database Initialization In AWS

The CloudFormation stack creates the RDS database instance, but you still need to load the schema.

After the stack is up:

1. Get the RDS endpoint from CloudFormation outputs.
2. Connect using a MySQL client.
3. Run the schema file:
   `data/schema.sql`
4. Load demo data from:
   `data/member1_demo_seed.sql`

Example:

```bash
mysql -h <rds-endpoint> -u admin -p linkedinclone < data/schema.sql
mysql -h <rds-endpoint> -u admin -p linkedinclone < data/member1_demo_seed.sql
```

## 9. Build And Push Images

Build and push all three services:

```bash
docker build -f services/profile/Dockerfile -t <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-profile:member1 .
docker build -f services/job/Dockerfile -t <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-job:member1 .
docker build -f services/application/Dockerfile -t <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-application:member1 .

docker push <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-profile:member1
docker push <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-job:member1
docker push <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-application:member1
```

## 10. Deploy CloudFormation

Use the included template:
`infra/aws/member1-ecs-rds.yaml`

Example:

```bash
aws cloudformation deploy \
  --region us-west-2 \
  --stack-name linkedinclone-member1 \
  --template-file infra/aws/member1-ecs-rds.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    DbPassword='ChangeMe123!' \
    ProfileImageUri='<account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-profile:member1' \
    JobImageUri='<account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-job:member1' \
    ApplicationImageUri='<account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-application:member1'
```

## 11. Post-Deploy Verification

After stack deployment:

1. Open CloudFormation and confirm stack is `CREATE_COMPLETE` or `UPDATE_COMPLETE`.
2. Open ECS and confirm all three services are stable.
3. Open EC2 Load Balancer and copy the ALB DNS name.
4. Run smoke tests:

```bash
curl http://<alb-dns>/health
curl http://<alb-dns>/members/search -H 'content-type: application/json' -d '{"page":1,"page_size":5}'
curl http://<alb-dns>/jobs/search -H 'content-type: application/json' -d '{"page":1,"page_size":5}'
curl http://<alb-dns>/applications/byMember -H 'content-type: application/json' -d '{"member_id":"22222222-2222-2222-2222-222222222222","page":1,"page_size":5}'
bash scripts/member1_smoke_test.sh http://<alb-dns>
```

5. If these fail, check:
   - ECS task logs
   - RDS connectivity
   - security groups
   - image URI correctness
   - schema loaded successfully

## 12. Demo Data You Will Likely Need

Before demo/review, load the provided seed data or insert at least:

- one recruiter
- one or more members
- one or more jobs

Why:
- `jobs/create` requires a valid recruiter
- `applications/submit` requires valid member and job records
- a ready seed file is already provided in `data/member1_demo_seed.sql`

## 13. CI Troubleshooting If GitHub Fails

If GitHub Actions fails:

1. Open the failing run.
2. Check whether it failed on:
   - `npm install`
   - `npm run test:member1`
   - `npm run test:api-doc`
3. Compare with your local run:

```bash
npm install
npm test
```

4. If it fails only in GitHub:
   - verify `package-lock.json` is committed
   - verify workflow file is committed
   - verify the branch contains the latest commit

## 14. Before Final Merge

Do all of this first:

1. Claude Opus 4.6 review completed
2. GitHub CI green
3. Local `npm test` green
4. PR diff reviewed
5. No unresolved comments
6. Deployment plan understood

Only then should you decide whether to merge manually.

## 15. Important Reminder

This branch must not be merged automatically by me.
You are the only one who should merge after review.
