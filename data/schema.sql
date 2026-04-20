CREATE DATABASE IF NOT EXISTS linkedinclone;
USE linkedinclone;

CREATE TABLE IF NOT EXISTS members (
  member_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  location VARCHAR(255),
  headline VARCHAR(500),
  about TEXT,
  profile_photo_url VARCHAR(500),
  connections_count INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_members_email ON members(email);
CREATE FULLTEXT INDEX idx_members_ft ON members(first_name, last_name, headline, about);

CREATE TABLE IF NOT EXISTS recruiters (
  recruiter_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  company_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  company_name VARCHAR(300) NOT NULL,
  company_industry VARCHAR(200),
  company_size VARCHAR(100),
  role VARCHAR(100) DEFAULT 'recruiter',
  access_level ENUM('recruiter', 'admin') DEFAULT 'recruiter',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jobs (
  job_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  company_id VARCHAR(36) NOT NULL,
  recruiter_id VARCHAR(36) NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  seniority_level ENUM('internship', 'entry', 'associate', 'mid', 'senior', 'director', 'executive'),
  employment_type ENUM('full_time', 'part_time', 'contract', 'temporary', 'volunteer', 'internship'),
  location VARCHAR(255),
  remote_type ENUM('onsite', 'remote', 'hybrid') DEFAULT 'onsite',
  salary_range VARCHAR(100),
  status ENUM('open', 'closed') DEFAULT 'open',
  posted_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
  views_count INT DEFAULT 0,
  applicants_count INT DEFAULT 0,
  CONSTRAINT fk_jobs_recruiter FOREIGN KEY (recruiter_id) REFERENCES recruiters(recruiter_id)
) ENGINE=InnoDB;

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_recruiter ON jobs(recruiter_id);
CREATE FULLTEXT INDEX idx_jobs_ft ON jobs(title, description, location);

CREATE TABLE IF NOT EXISTS job_skills (
  job_id VARCHAR(36) NOT NULL,
  skill VARCHAR(200) NOT NULL,
  PRIMARY KEY (job_id, skill),
  CONSTRAINT fk_job_skills_job FOREIGN KEY (job_id) REFERENCES jobs(job_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applications (
  application_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  member_id VARCHAR(36) NOT NULL,
  resume_url VARCHAR(500),
  resume_text TEXT,
  cover_letter TEXT,
  answers JSON,
  application_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
  status ENUM('submitted', 'reviewing', 'interview', 'offer', 'rejected') DEFAULT 'submitted',
  status_note TEXT,
  UNIQUE KEY uk_job_member (job_id, member_id),
  CONSTRAINT fk_applications_job FOREIGN KEY (job_id) REFERENCES jobs(job_id),
  CONSTRAINT fk_applications_member FOREIGN KEY (member_id) REFERENCES members(member_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS application_notes (
  note_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  application_id VARCHAR(36) NOT NULL,
  recruiter_id VARCHAR(36) NOT NULL,
  note_text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notes_application FOREIGN KEY (application_id) REFERENCES applications(application_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS connections (
  connection_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_a VARCHAR(36) NOT NULL,
  user_b VARCHAR(36) NOT NULL,
  status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
  requested_by VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_connection_pair (user_a, user_b)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS threads (
  thread_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS thread_participants (
  thread_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (thread_id, user_id),
  CONSTRAINT fk_participants_thread FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  message_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  thread_id VARCHAR(36) NOT NULL,
  sender_id VARCHAR(36) NOT NULL,
  message_text TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_thread FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
) ENGINE=InnoDB;

CREATE INDEX idx_messages_thread ON messages(thread_id, sent_at);

CREATE TABLE IF NOT EXISTS member_skills (
  member_id VARCHAR(36) NOT NULL,
  skill VARCHAR(200) NOT NULL,
  PRIMARY KEY (member_id, skill),
  CONSTRAINT fk_member_skills_member FOREIGN KEY (member_id) REFERENCES members(member_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS member_experience (
  exp_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  member_id VARCHAR(36),
  company VARCHAR(300),
  title VARCHAR(300),
  start_date DATE,
  end_date DATE,
  description TEXT,
  is_current BOOLEAN DEFAULT FALSE,
  CONSTRAINT fk_member_experience_member FOREIGN KEY (member_id) REFERENCES members(member_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS member_education (
  edu_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  member_id VARCHAR(36),
  institution VARCHAR(300),
  degree VARCHAR(200),
  field VARCHAR(200),
  start_year INT,
  end_year INT,
  CONSTRAINT fk_member_education_member FOREIGN KEY (member_id) REFERENCES members(member_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS processed_events (
  idempotency_key VARCHAR(255) PRIMARY KEY,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  topic VARCHAR(120) NOT NULL,
  envelope JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent BOOLEAN DEFAULT FALSE,
  sent_at DATETIME NULL,
  INDEX idx_outbox_unsent (sent, created_at)
) ENGINE=InnoDB;
