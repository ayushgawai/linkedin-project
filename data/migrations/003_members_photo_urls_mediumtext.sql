-- Allow full data URLs when S3 is disabled (blob: URLs must never be stored; use data: from client).
ALTER TABLE members MODIFY COLUMN profile_photo_url MEDIUMTEXT NULL;
ALTER TABLE members MODIFY COLUMN cover_photo_url MEDIUMTEXT NULL;
