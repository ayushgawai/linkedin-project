-- Run once on existing DBs (Docker MySQL) if `members` predates `cover_photo_url`.
-- If you see ER_DUP_FIELDNAME, the column already exists — skip this file.
ALTER TABLE members ADD COLUMN cover_photo_url VARCHAR(500) NULL AFTER profile_photo_url;
