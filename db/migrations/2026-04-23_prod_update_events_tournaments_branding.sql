-- Migration production (idempotente)
-- Date: 2026-04-23
-- Objet:
-- 1) Tournois multi-soirees
-- 2) Branding evenement (mode marque blanche)
-- 3) Profils joueurs persistants (sans compte obligatoire)
-- 4) Analytics persistées en base
--
-- Prerequis:
-- - Base MySQL/MariaDB avec tables users et blindtests existantes
-- - Encodage utf8mb4

START TRANSACTION;

-- =========================
-- 1) Tournois multi-soirees
-- =========================
CREATE TABLE IF NOT EXISTS tournaments (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  owner_id   VARCHAR(36)  NOT NULL,
  name       VARCHAR(255) NOT NULL,
  starts_at  BIGINT       NULL,
  ends_at    BIGINT       NULL,
  created_at BIGINT       NOT NULL,
  INDEX idx_tournaments_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tournament_sessions (
  tournament_id VARCHAR(36) NOT NULL,
  blindtest_id  VARCHAR(36) NOT NULL,
  created_at    BIGINT      NOT NULL,
  PRIMARY KEY (tournament_id, blindtest_id),
  INDEX idx_tournament_sessions_bt (blindtest_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =======================================
-- 2) Branding evenement (marque blanche)
-- =======================================
CREATE TABLE IF NOT EXISTS event_branding (
  blindtest_id   VARCHAR(36)  NOT NULL PRIMARY KEY,
  owner_id       VARCHAR(36)  NOT NULL,
  client_name    VARCHAR(255) NOT NULL DEFAULT '',
  logo_url       TEXT         NULL,
  primary_color  VARCHAR(16)  NOT NULL DEFAULT '#6366f1',
  accent_color   VARCHAR(16)  NOT NULL DEFAULT '#a855f7',
  created_at     BIGINT       NOT NULL,
  updated_at     BIGINT       NOT NULL,
  INDEX idx_event_branding_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ======================================================
-- 3) Profils joueurs persistants (sans compte obligatoire)
-- ======================================================
CREATE TABLE IF NOT EXISTS player_profiles (
  public_id      VARCHAR(64) NOT NULL PRIMARY KEY,
  nickname       VARCHAR(32) NOT NULL,
  badges_json    JSON        NOT NULL,
  seasons_json   JSON        NOT NULL,
  total_sessions INT         NOT NULL DEFAULT 0,
  total_score    INT         NOT NULL DEFAULT 0,
  total_buzzes   INT         NOT NULL DEFAULT 0,
  total_correct  INT         NOT NULL DEFAULT 0,
  total_wrong    INT         NOT NULL DEFAULT 0,
  created_at     BIGINT      NOT NULL,
  updated_at     BIGINT      NOT NULL,
  INDEX idx_player_profiles_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_profile_sessions (
  id              VARCHAR(36) NOT NULL PRIMARY KEY,
  public_id       VARCHAR(64) NOT NULL,
  game_id         VARCHAR(10) NOT NULL,
  player_name     VARCHAR(64) NOT NULL,
  score           INT         NOT NULL DEFAULT 0,
  buzzes          INT         NOT NULL DEFAULT 0,
  correct_answers INT         NOT NULL DEFAULT 0,
  wrong_answers   INT         NOT NULL DEFAULT 0,
  created_at      BIGINT      NOT NULL,
  INDEX idx_player_profile_sessions_public (public_id),
  INDEX idx_player_profile_sessions_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================
-- 4) Analytics persistées en DB
-- ==============================
CREATE TABLE IF NOT EXISTS game_analytics (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  game_id       VARCHAR(10) NOT NULL,
  ended_reason  VARCHAR(64) NOT NULL,
  players_count INT         NOT NULL DEFAULT 0,
  total_buzzes  INT         NOT NULL DEFAULT 0,
  total_correct INT         NOT NULL DEFAULT 0,
  total_wrong   INT         NOT NULL DEFAULT 0,
  created_at    BIGINT      NOT NULL,
  INDEX idx_game_analytics_game (game_id),
  INDEX idx_game_analytics_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_player_analytics (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  analytics_id    VARCHAR(36)  NOT NULL,
  player_id       VARCHAR(100) NOT NULL,
  public_id       VARCHAR(64)  NULL,
  player_name     VARCHAR(64)  NOT NULL,
  score           INT          NOT NULL DEFAULT 0,
  buzzes          INT          NOT NULL DEFAULT 0,
  correct_answers INT          NOT NULL DEFAULT 0,
  wrong_answers   INT          NOT NULL DEFAULT 0,
  created_at      BIGINT       NOT NULL,
  INDEX idx_game_player_analytics_analytics (analytics_id),
  INDEX idx_game_player_analytics_public (public_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;
