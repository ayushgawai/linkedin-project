-- JSON blob for licenses, projects, courses (member + recruiter mirror rows)
ALTER TABLE members ADD COLUMN profile_extensions JSON NULL;
