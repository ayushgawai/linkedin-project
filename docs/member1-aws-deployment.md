# Member 1 AWS Deployment

Canonical deployment guide: [aws-deployment-runbook.md](/Users/spartan/Documents/GitHub/Linkedin-Project/docs/aws-deployment-runbook.md:1)

This deployment covers Ayush's Member 1 scope:
- Profile Service
- Job Service
- Application Service
- MySQL backing store

## What Is Included

- Local Docker support through [infra/docker-compose.yml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/docker-compose.yml:1)
- ECS Fargate + ALB + RDS MySQL CloudFormation in [infra/aws/member1-ecs-rds.yaml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/aws/member1-ecs-rds.yaml:1)
- CI test execution in [.github/workflows/ci.yml](/Users/spartan/Documents/GitHub/Linkedin-Project/.github/workflows/ci.yml:1)

## Local Validation

```bash
npm install
docker compose -f infra/docker-compose.yml up --build -d mysql profile job application
mysql -h 127.0.0.1 -u root -plinkedin linkedinclone < data/member1_demo_seed.sql
npm test
bash scripts/member1_smoke_test.sh
```

If you need a clean schema refresh, remove the MySQL volume first:

```bash
docker compose -f infra/docker-compose.yml down -v
```

## AWS Deployment Flow

1. Build and push the three service images to ECR.
2. Deploy the CloudFormation stack with those image URIs.
3. Wait for ECS services and the RDS instance to become healthy.
4. Load `data/schema.sql` and `data/member1_demo_seed.sql` into RDS.
5. Test the ALB endpoints for `/members/*`, `/jobs/*`, and `/applications/*`.

### Example ECR Image Build

```bash
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-west-2.amazonaws.com

docker build -f services/profile/Dockerfile -t <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-profile:member1 .
docker build -f services/job/Dockerfile -t <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-job:member1 .
docker build -f services/application/Dockerfile -t <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-application:member1 .

docker push <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-profile:member1
docker push <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-job:member1
docker push <account>.dkr.ecr.us-west-2.amazonaws.com/linkedinclone-application:member1
```

### Example Stack Deploy

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

## Post-Deploy Smoke Tests

Replace `<alb-dns>` with the stack output:

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

## Notes

- The CloudFormation stack provisions a fresh RDS instance, so for demos it is easiest to deploy into a dedicated test account or project VPC.
- The schema file at [data/schema.sql](/Users/spartan/Documents/GitHub/Linkedin-Project/data/schema.sql:1) is mounted automatically in local Docker, but in AWS you should run the schema once against the RDS endpoint after the database is reachable.
- Demo data for recruiter/member/job setup is in [data/member1_demo_seed.sql](/Users/spartan/Documents/GitHub/Linkedin-Project/data/member1_demo_seed.sql:1).
- Repeatable smoke testing is in [scripts/member1_smoke_test.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/member1_smoke_test.sh:1).
- The ALB uses path-based routing:
  `/members/*` -> profile
  `/jobs/*` -> job
  `/applications/*` -> application
