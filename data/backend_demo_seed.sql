USE linkedinclone;

INSERT INTO recruiters (
  recruiter_id,
  company_id,
  name,
  email,
  phone,
  company_name,
  company_industry,
  company_size,
  role,
  access_level
)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Ayush Recruiter',
  'ayush.recruiter@example.com',
  '+1-408-555-0100',
  'LinkedInClone',
  'software',
  '51-200',
  'recruiter',
  'admin'
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  phone = VALUES(phone),
  company_name = VALUES(company_name),
  company_industry = VALUES(company_industry),
  company_size = VALUES(company_size),
  role = VALUES(role),
  access_level = VALUES(access_level);

INSERT INTO members (
  member_id,
  first_name,
  last_name,
  email,
  phone,
  location,
  headline,
  about,
  profile_photo_url
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Ayush',
  'Candidate',
  'ayush.candidate@example.com',
  '+1-408-555-0101',
  'San Jose, CA',
  'Backend Engineer',
  'Distributed systems engineer with experience in Node.js, MySQL, Docker, and AWS.',
  'https://example.com/profile/ayush.jpg'
)
ON DUPLICATE KEY UPDATE
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  phone = VALUES(phone),
  location = VALUES(location),
  headline = VALUES(headline),
  about = VALUES(about),
  profile_photo_url = VALUES(profile_photo_url);

INSERT INTO members (
  member_id,
  first_name,
  last_name,
  email,
  phone,
  location,
  headline,
  about,
  profile_photo_url
)
VALUES
(
  '66666666-6666-6666-6666-666666666666',
  'Demo',
  'Friend',
  'demo.friend@example.com',
  '+1-408-555-0106',
  'San Jose, CA',
  'Software Engineer',
  'Demo profile for connections graph testing.',
  NULL
),
(
  '77777777-7777-7777-7777-777777777777',
  'Demo',
  'Pending',
  'demo.pending@example.com',
  '+1-408-555-0107',
  'San Jose, CA',
  'SWE Intern',
  'Demo profile for pending connection testing.',
  NULL
)
ON DUPLICATE KEY UPDATE
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  phone = VALUES(phone),
  location = VALUES(location),
  headline = VALUES(headline),
  about = VALUES(about),
  profile_photo_url = VALUES(profile_photo_url);

INSERT INTO member_skills (member_id, skill)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'Node.js'),
  ('22222222-2222-2222-2222-222222222222', 'MySQL'),
  ('22222222-2222-2222-2222-222222222222', 'Docker'),
  ('22222222-2222-2222-2222-222222222222', 'AWS')
ON DUPLICATE KEY UPDATE
  skill = VALUES(skill);

INSERT INTO member_experience (
  exp_id,
  member_id,
  company,
  title,
  start_date,
  end_date,
  description,
  is_current
)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'LinkedInClone',
  'Software Engineer',
  '2023-01-01',
  NULL,
  'Built backend APIs, CI workflows, and deployment automation.',
  TRUE
)
ON DUPLICATE KEY UPDATE
  company = VALUES(company),
  title = VALUES(title),
  start_date = VALUES(start_date),
  end_date = VALUES(end_date),
  description = VALUES(description),
  is_current = VALUES(is_current);

INSERT INTO member_education (
  edu_id,
  member_id,
  institution,
  degree,
  field,
  start_year,
  end_year
)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  'San Jose State University',
  'MS',
  'Software Engineering',
  2024,
  2026
)
ON DUPLICATE KEY UPDATE
  institution = VALUES(institution),
  degree = VALUES(degree),
  field = VALUES(field),
  start_year = VALUES(start_year),
  end_year = VALUES(end_year);

INSERT INTO jobs (
  job_id,
  company_id,
  recruiter_id,
  title,
  description,
  seniority_level,
  employment_type,
  location,
  remote_type,
  salary_range,
  status
)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Backend Engineer',
  'Build profile, job, and application services for a distributed LinkedIn-style platform.',
  'mid',
  'full_time',
  'San Jose, CA',
  'hybrid',
  '$120k-$150k',
  'open'
)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  seniority_level = VALUES(seniority_level),
  employment_type = VALUES(employment_type),
  location = VALUES(location),
  remote_type = VALUES(remote_type),
  salary_range = VALUES(salary_range),
  status = VALUES(status);

INSERT INTO job_skills (job_id, skill)
VALUES
  ('55555555-5555-5555-5555-555555555555', 'Node.js'),
  ('55555555-5555-5555-5555-555555555555', 'MySQL'),
  ('55555555-5555-5555-5555-555555555555', 'Docker'),
  ('55555555-5555-5555-5555-555555555555', 'AWS')
ON DUPLICATE KEY UPDATE
  skill = VALUES(skill);

-- Seed connections in MySQL (matches Mongo seeded graph).
INSERT INTO connections (
  connection_id,
  user_a,
  user_b,
  status,
  requested_by
)
VALUES
  ('88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', 'accepted', '22222222-2222-2222-2222-222222222222'),
  ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777', 'pending',  '77777777-7777-7777-7777-777777777777')
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  requested_by = VALUES(requested_by);
