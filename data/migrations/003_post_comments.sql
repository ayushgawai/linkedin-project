CREATE TABLE IF NOT EXISTS post_comments (
  comment_id VARCHAR(64) PRIMARY KEY,
  post_id VARCHAR(64) NOT NULL,
  author_member_id VARCHAR(36) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_post_comments_post (post_id, created_at DESC)
) ENGINE=InnoDB;
