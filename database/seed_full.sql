USE kebrchacha;

-- ─── Add more sample users ────────────────────────────────────────────────────
INSERT IGNORE INTO users (telegram_id, username, first_name, last_name, is_admin) VALUES
(100000016, 'kaleb_m',    'Kaleb',    'Mekonnen',  0),
(100000017, 'sara_t',     'Sara',     'Tekle',     0),
(100000018, 'mikias_b',   'Mikias',   'Bekele',    0),
(100000019, 'eden_h',     'Eden',     'Hailu',     0),
(100000020, 'robel_g',    'Robel',    'Gebre',     0),
(100000021, 'feven_a',    'Feven',    'Asefa',     0),
(100000022, 'haben_t',    'Haben',    'Tsegay',    0),
(100000023, 'yordanos_k', 'Yordanos', 'Kifle',     0),
(100000024, 'amanuel_d',  'Amanuel',  'Desta',     0),
(100000025, 'saron_w',    'Saron',    'Woldemariam',0),
(100000026, 'tewodros_g', 'Tewodros', 'Gebru',     0),
(100000027, 'miriam_s',   'Miriam',   'Seyoum',    0),
(100000028, 'daniel_f',   'Daniel',   'Fikre',     0),
(100000029, 'liya_b',     'Liya',     'Berhane',   0),
(100000030, 'kiros_t',    'Kiros',    'Tesfai',    0);

-- ─── Fill remaining numbers (2,4,6,10,12,14,16,18,22,24,26,28,30,32,34,36-50) 
-- First convert all existing pending to verified
UPDATE tickets SET status = 'verified' WHERE room_id = 1 AND status = 'pending';

-- Now fill every remaining empty slot
INSERT IGNORE INTO tickets (room_id, user_id, number, status)
SELECT 1, u.id, n.num, 'verified'
FROM (
  SELECT 2  AS num UNION SELECT 4  UNION SELECT 6  UNION SELECT 10 UNION
  SELECT 12 UNION SELECT 14 UNION SELECT 16 UNION SELECT 18 UNION
  SELECT 22 UNION SELECT 24 UNION SELECT 26 UNION SELECT 28 UNION
  SELECT 30 UNION SELECT 32 UNION SELECT 34 UNION SELECT 36 UNION
  SELECT 37 UNION SELECT 38 UNION SELECT 39 UNION SELECT 40 UNION
  SELECT 41 UNION SELECT 42 UNION SELECT 43 UNION SELECT 44 UNION
  SELECT 45 UNION SELECT 46 UNION SELECT 47 UNION SELECT 48 UNION SELECT 49
) n
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM users
  WHERE telegram_id BETWEEN 100000016 AND 100000030
) u ON u.rn = (n.num % 15) + 1;

-- ─── Lock the room and set filled_slots = 50 ─────────────────────────────────
UPDATE rooms SET filled_slots = 50, status = 'locked' WHERE id = 1;

-- ─── Verify final state ───────────────────────────────────────────────────────
SELECT COUNT(*) AS total_tickets,
       SUM(status = 'verified') AS verified,
       SUM(status = 'pending')  AS pending
FROM tickets WHERE room_id = 1;
