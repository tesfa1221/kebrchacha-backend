USE kebrchacha;

-- ─── Sample Users ────────────────────────────────────────────────────────────
INSERT IGNORE INTO users (telegram_id, username, first_name, last_name, is_admin) VALUES
(100000001, 'abebe_keb',   'Abebe',     'Kebede',    0),
(100000002, 'tigist_h',    'Tigist',    'Haile',     0),
(100000003, 'dawit_m',     'Dawit',     'Mulugeta',  0),
(100000004, 'selam_t',     'Selam',     'Tadesse',   0),
(100000005, 'yonas_g',     'Yonas',     'Girma',     0),
(100000006, 'hana_b',      'Hana',      'Bekele',    0),
(100000007, 'samuel_w',    'Samuel',    'Worku',     0),
(100000008, 'meron_a',     'Meron',     'Alemu',     0),
(100000009, 'biruk_t',     'Biruk',     'Tesfaye',   0),
(100000010, 'lidya_g',     'Lidya',     'Getachew',  0),
(100000011, 'natnael_d',   'Natnael',   'Desta',     0),
(100000012, 'rahel_s',     'Rahel',     'Solomon',   0),
(100000013, 'eyob_f',      'Eyob',      'Fikadu',    0),
(100000014, 'bethlehem_k', 'Bethlehem', 'Kassa',     0),
(100000015, 'henok_z',     'Henok',     'Zeleke',    0);

-- ─── Sample Tickets (verified = red/taken, pending = yellow) ─────────────────
-- Get user IDs dynamically by telegram_id
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 1,  'verified' FROM users WHERE telegram_id = 100000001;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 3,  'verified' FROM users WHERE telegram_id = 100000002;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 5,  'verified' FROM users WHERE telegram_id = 100000003;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 7,  'verified' FROM users WHERE telegram_id = 100000004;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 9,  'verified' FROM users WHERE telegram_id = 100000005;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 11, 'verified' FROM users WHERE telegram_id = 100000006;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 13, 'verified' FROM users WHERE telegram_id = 100000007;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 15, 'verified' FROM users WHERE telegram_id = 100000008;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 17, 'verified' FROM users WHERE telegram_id = 100000009;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 19, 'verified' FROM users WHERE telegram_id = 100000010;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 21, 'verified' FROM users WHERE telegram_id = 100000011;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 23, 'verified' FROM users WHERE telegram_id = 100000012;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 25, 'verified' FROM users WHERE telegram_id = 100000013;
-- Pending (yellow) — payment not yet verified
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 27, 'pending'  FROM users WHERE telegram_id = 100000014;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 29, 'pending'  FROM users WHERE telegram_id = 100000015;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 31, 'pending'  FROM users WHERE telegram_id = 100000001;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 33, 'pending'  FROM users WHERE telegram_id = 100000003;
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, id, 35, 'pending'  FROM users WHERE telegram_id = 100000005;

-- ─── Update room filled_slots count ──────────────────────────────────────────
UPDATE rooms
SET filled_slots = (
  SELECT COUNT(*) FROM tickets
  WHERE room_id = 1 AND status = 'verified'
)
WHERE id = 1;
