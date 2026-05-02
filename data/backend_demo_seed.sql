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
  'https://i.pravatar.cc/150?img=12'
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
  'Rohan',
  'Mehta',
  'rohan.mehta@example.com',
  '+1-408-555-0106',
  'San Jose, CA',
  'Software Engineer',
  'Backend + distributed systems. Happy to connect.',
  'https://i.pravatar.cc/150?img=32'
),
(
  '77777777-7777-7777-7777-777777777777',
  'Aisha',
  'Khan',
  'aisha.khan@example.com',
  '+1-408-555-0107',
  'San Jose, CA',
  'SWE Intern',
  'CS student exploring backend + cloud.',
  'https://i.pravatar.cc/150?img=47'
)
ON DUPLICATE KEY UPDATE
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  phone = VALUES(phone),
  location = VALUES(location),
  headline = VALUES(headline),
  about = VALUES(about),
  profile_photo_url = VALUES(profile_photo_url);

-- Extra members so search / "People you may know" and feed authors look varied (idempotent)
INSERT INTO members (member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url)
VALUES
  ('33333333-3333-3333-3333-333333330001', 'Marcus', 'Webb', 'marcus.webb@example.com', '+1-408-555-0201', 'San Francisco, CA', 'Product Manager | B2B SaaS', 'Shipping roadmap and cross-team alignment.', 'https://i.pravatar.cc/150?img=11'),
  ('33333333-3333-3333-3333-333333330002', 'Elena', 'Petrova', 'elena.petrova@example.com', '+1-408-555-0202', 'Seattle, WA', 'Data Scientist | ML Pipelines', 'Feature store and model monitoring.', 'https://i.pravatar.cc/150?img=5'),
  ('33333333-3333-3333-3333-333333330003', 'Jordan', 'Williams', 'jordan.williams@example.com', '+1-408-555-0203', 'Austin, TX', 'Frontend Engineer | Design Systems', 'Accessibility-first UI work.', 'https://i.pravatar.cc/150?img=14'),
  ('33333333-3333-3333-3333-333333330004', 'Priya', 'Nair', 'priya.nair@example.com', '+1-408-555-0204', 'San Jose, CA', 'Engineering Manager | Platform', 'Scaling teams and reliability culture.', 'https://i.pravatar.cc/150?img=16'),
  ('33333333-3333-3333-3333-333333330005', 'Diego', 'Martinez', 'diego.martinez@example.com', '+1-408-555-0205', 'Los Angeles, CA', 'DevOps Engineer | SRE', 'Kubernetes, observability, incident response.', 'https://i.pravatar.cc/150?img=18'),
  ('33333333-3333-3333-3333-333333330006', 'Yuki', 'Tanaka', 'yuki.tanaka@example.com', '+1-408-555-0206', 'Remote', 'Security Engineer', 'AppSec reviews and threat modeling.', 'https://i.pravatar.cc/150?img=21'),
  ('33333333-3333-3333-3333-333333330007', 'Amara', 'Okonkwo', 'amara.okonkwo@example.com', '+1-408-555-0207', 'New York, NY', 'Product Designer | UX Research', 'Enterprise workflows and research ops.', 'https://i.pravatar.cc/150?img=24'),
  ('33333333-3333-3333-3333-333333330008', 'Thomas', 'Berg', 'thomas.berg@example.com', '+1-408-555-0208', 'Chicago, IL', 'Sales Engineer', 'Technical discovery and demos.', 'https://i.pravatar.cc/150?img=27'),
  ('33333333-3333-3333-3333-333333330009', 'Fatima', 'Al-Hassan', 'fatima.alhassan@example.com', '+1-408-555-0209', 'San Diego, CA', 'Technical Writer | APIs', 'Developer docs and SDK examples.', 'https://i.pravatar.cc/150?img=29'),
  ('33333333-3333-3333-3333-333333330010', 'Chris', 'OBrien', 'chris.obrien@example.com', '+1-408-555-0210', 'Denver, CO', 'Mobile Engineer | iOS', 'SwiftUI and offline-first patterns.', 'https://i.pravatar.cc/150?img=33')
ON DUPLICATE KEY UPDATE
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  email = VALUES(email),
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

-- ----------------------------------------------------------------------------
-- Demo posts (idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO posts
  (post_id, author_member_id, visibility, content, media_type, media_url, article_title, article_source, poll_options,
   reactions_count, comments_count, reposts_count, created_at)
VALUES
  ('post-seed-1', '22222222-2222-2222-2222-222222222222', 'anyone',
   'Excited to share our distributed LinkedIn clone is up locally: MySQL + Mongo + Kafka + Redis + AI + analytics.',
   'text', NULL, NULL, NULL, NULL, 12, 2, 1, NOW() - INTERVAL 2 DAY),
  ('post-seed-2', '66666666-6666-6666-6666-666666666666', 'anyone',
   'Hiring: Backend Engineer (Node.js, Kafka). Drop a message if interested.',
   'text', NULL, NULL, NULL, NULL, 5, 1, 0, NOW() - INTERVAL 1 DAY),
  ('post-seed-3', '77777777-7777-7777-7777-777777777777', 'connections',
   'Connections-only update: prepping the demo with two accounts chatting and sending requests.',
   'text', NULL, NULL, NULL, NULL, 2, 0, 0, NOW() - INTERVAL 12 HOUR),
  ('post-seed-4', '33333333-3333-3333-3333-333333330001', 'anyone',
   'Shipped a new analytics slice for recruiter dashboards: top jobs, geo split, and saved-jobs trend. Feedback welcome.',
   'text', NULL, NULL, NULL, NULL, 18, 3, 2, NOW() - INTERVAL 3 HOUR),
  ('post-seed-5', '33333333-3333-3333-3333-333333330002', 'anyone',
   'We cut p95 feature-store latency in half by colocating embedding cache with the worker pool. Write-up soon.',
   'text', NULL, NULL, NULL, NULL, 9, 1, 1, NOW() - INTERVAL 5 HOUR),
  ('post-seed-6', '33333333-3333-3333-3333-333333330003', 'anyone',
   'Refreshed our design tokens: one source of truth for spacing, type scale, and focus rings across the app shell.',
   'text', NULL, NULL, NULL, NULL, 14, 4, 0, NOW() - INTERVAL 6 HOUR),
  ('post-seed-7', '33333333-3333-3333-3333-333333330004', 'anyone',
   'Hiring: two senior backend engineers. Stack: Node, MySQL, Redis, Kafka. Hybrid in the Bay — DM me.',
   'text', NULL, NULL, NULL, NULL, 22, 5, 3, NOW() - INTERVAL 8 HOUR),
  ('post-seed-8', '33333333-3333-3333-3333-333333330005', 'anyone',
   'Runbook + game day this week: verified Kafka consumer lag alerts and idempotent replays. Sleep schedule recovered.',
   'text', NULL, NULL, NULL, NULL, 7, 2, 0, NOW() - INTERVAL 10 HOUR),
  ('post-seed-9', '33333333-3333-3333-3333-333333330006', 'anyone',
   'Published internal guidance on OWASP API top risks for our microservices. Happy to share outline if useful.',
   'text', NULL, NULL, NULL, NULL, 6, 0, 1, NOW() - INTERVAL 14 HOUR),
  ('post-seed-10', '33333333-3333-3333-3333-333333330007', 'anyone',
   'User research takeaway: candidates want clearer “remote/hybrid” signals on job cards. We are iterating the filter UX.',
   'text', NULL, NULL, NULL, NULL, 11, 2, 1, NOW() - INTERVAL 18 HOUR),
  ('post-seed-11', '33333333-3333-3333-3333-333333330008', 'anyone',
   'Great week of customer proof calls — common theme is faster time-to-first-reply in messaging. On it.',
   'text', NULL, NULL, NULL, NULL, 4, 1, 0, NOW() - INTERVAL 20 HOUR),
  ('post-seed-12', '33333333-3333-3333-3333-333333330009', 'anyone',
   'Draft OpenAPI examples landed for applications + messaging webhooks. Ping me for review links.',
   'text', NULL, NULL, NULL, NULL, 8, 1, 0, NOW() - INTERVAL 22 HOUR),
  ('post-seed-13', '33333333-3333-3333-3333-333333330010', 'anyone',
   'Experimenting with background refresh + optimistic UI for thread lists. Feels snappier on slow Wi‑Fi.',
   'text', NULL, NULL, NULL, NULL, 10, 2, 1, NOW() - INTERVAL 26 HOUR),
  ('post-seed-14', '22222222-2222-2222-2222-222222222222', 'anyone',
   'Reminder: demo accounts Rohan + Aisha are in the seed data for connections + messaging flows.',
   'text', NULL, NULL, NULL, NULL, 3, 0, 0, NOW() - INTERVAL 30 MINUTE)
ON DUPLICATE KEY UPDATE
  content = VALUES(content),
  visibility = VALUES(visibility),
  media_type = VALUES(media_type),
  media_url = VALUES(media_url),
  article_title = VALUES(article_title),
  article_source = VALUES(article_source),
  poll_options = VALUES(poll_options),
  reactions_count = VALUES(reactions_count),
  comments_count = VALUES(comments_count),
  reposts_count = VALUES(reposts_count);
