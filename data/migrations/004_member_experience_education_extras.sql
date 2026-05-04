-- Persist full member experience/education shapes (employment type, skills, YYYY-MM strings, etc.)
ALTER TABLE member_experience MODIFY COLUMN exp_id VARCHAR(80) NOT NULL;
ALTER TABLE member_experience ADD COLUMN extras JSON NULL;

ALTER TABLE member_education MODIFY COLUMN edu_id VARCHAR(80) NOT NULL;
ALTER TABLE member_education ADD COLUMN extras JSON NULL;
