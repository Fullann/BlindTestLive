CREATE DATABASE IF NOT EXISTS blindtest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE blindtest;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at BIGINT NOT NULL,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_secret VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS playlists (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_id VARCHAR(36) NOT NULL,
  tracks JSON NOT NULL DEFAULT (JSON_ARRAY()),
  visibility ENUM('private', 'public') NOT NULL DEFAULT 'private',
  created_at BIGINT NOT NULL,
  CONSTRAINT fk_playlists_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blindtests (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  mode ENUM('playlist', 'youtube') NOT NULL DEFAULT 'playlist',
  status ENUM('active', 'finished') NOT NULL DEFAULT 'active',
  game_id VARCHAR(10) NOT NULL,
  host_token VARCHAR(255) DEFAULT NULL,
  playlist_id VARCHAR(36) DEFAULT NULL,
  source_url TEXT DEFAULT NULL,
  created_at BIGINT NOT NULL,
  ended_at BIGINT DEFAULT NULL,
  CONSTRAINT fk_blindtests_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_blindtests_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_playlists_owner ON playlists (owner_id);
CREATE INDEX idx_playlists_visibility ON playlists (visibility);
CREATE INDEX idx_blindtests_owner ON blindtests (owner_id);
CREATE INDEX idx_blindtests_game_id ON blindtests (game_id);

-- Colonnes store pour les playlists
ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS category VARCHAR(64) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS likes_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS downloads_count INT NOT NULL DEFAULT 0;

-- Likes du magasin de blind tests
CREATE TABLE IF NOT EXISTS playlist_likes (
  playlist_id VARCHAR(36) NOT NULL,
  user_id     VARCHAR(36) NOT NULL,
  created_at  BIGINT      NOT NULL,
  PRIMARY KEY (playlist_id, user_id),
  INDEX idx_playlist_likes_user (user_id),
  CONSTRAINT fk_likes_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens de collaboration playlist (cohost/édition)
CREATE TABLE IF NOT EXISTS playlist_collab_tokens (
  playlist_id VARCHAR(36)  NOT NULL,
  token       VARCHAR(255) NOT NULL,
  created_by  VARCHAR(36)  NOT NULL,
  created_at  BIGINT       NOT NULL,
  expires_at  BIGINT       NOT NULL,
  PRIMARY KEY (playlist_id, token),
  INDEX idx_collab_token (token),
  INDEX idx_collab_expires (expires_at),
  CONSTRAINT fk_collab_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
  CONSTRAINT fk_collab_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inventaire des totems ESP32 par compte admin
CREATE TABLE IF NOT EXISTS hardware_devices (
  device_id  VARCHAR(64)  NOT NULL PRIMARY KEY,
  owner_id   VARCHAR(36)  NOT NULL,
  secret     VARCHAR(128) NOT NULL,
  name       VARCHAR(64)  NOT NULL DEFAULT '',
  firmware   VARCHAR(32)  NOT NULL DEFAULT '',
  created_at BIGINT       NOT NULL,
  INDEX idx_hw_owner (owner_id),
  CONSTRAINT fk_hw_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
