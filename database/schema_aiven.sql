-- ============================================================
-- KEBRCHACHA DATABASE SCHEMA — Aiven Version
-- Run this in Aiven Query tab (uses defaultdb, no CREATE DATABASE)
-- ============================================================

-- USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  telegram_id   BIGINT UNIQUE NOT NULL,
  username      VARCHAR(64),
  first_name    VARCHAR(64),
  last_name     VARCHAR(64),
  is_admin      TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_telegram_id (telegram_id)
) ENGINE=InnoDB;

-- ROOMS TABLE
CREATE TABLE IF NOT EXISTS rooms (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(128) NOT NULL,
  entry_fee       DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  prize_1st       DECIMAL(10,2) NOT NULL,
  prize_2nd       DECIMAL(10,2) NOT NULL,
  prize_3rd       DECIMAL(10,2) NOT NULL,
  total_slots     INT NOT NULL DEFAULT 50,
  filled_slots    INT NOT NULL DEFAULT 0,
  status          ENUM('active','locked','completed','cancelled') NOT NULL DEFAULT 'active',
  created_by      INT UNSIGNED NOT NULL,
  winner_1st      INT UNSIGNED NULL,
  winner_2nd      INT UNSIGNED NULL,
  winner_3rd      INT UNSIGNED NULL,
  draw_at         TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (winner_1st) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (winner_2nd) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (winner_3rd) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- TICKETS TABLE (SMALLINT for number — supports up to 500 slots)
CREATE TABLE IF NOT EXISTS tickets (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  number      SMALLINT UNSIGNED NOT NULL,
  status      ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_room_number (room_id, number),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_room_id (room_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id       INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  room_id         INT UNSIGNED NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  screenshot_path VARCHAR(512) NOT NULL,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note      TEXT NULL,
  reviewed_by     INT UNSIGNED NULL,
  reviewed_at     TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id)   REFERENCES tickets(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (room_id)     REFERENCES rooms(id)    ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)    ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_room_id (room_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB;

-- WINNERS TABLE
CREATE TABLE IF NOT EXISTS winners (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  ticket_id   INT UNSIGNED NOT NULL,
  place       TINYINT UNSIGNED NOT NULL,
  prize       DECIMAL(10,2) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_room_place (room_id, place),
  FOREIGN KEY (room_id)   REFERENCES rooms(id)   ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Seed admin user
INSERT IGNORE INTO users (telegram_id, username, first_name, is_admin)
VALUES (991793142, 'Tesfa3362', 'Tesfamichael', 1);
