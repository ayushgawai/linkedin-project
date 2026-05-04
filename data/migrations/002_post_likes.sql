-- Run once on existing DBs: docker exec -i linkedinclone-mysql mysql -uroot -p"$DB_PASS" linkedinclone < data/migrations/002_post_likes.sql
CREATE TABLE IF NOT EXISTS post_likes (
  post_id VARCHAR(64) NOT NULL,
  member_id VARCHAR(36) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, member_id),
  INDEX idx_post_likes_post (post_id),
  INDEX idx_post_likes_member (member_id)
) ENGINE=InnoDB;
