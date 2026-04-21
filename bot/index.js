'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

var Telegraf = require('telegraf');
var db       = require('../config/db');

var BOT_TOKEN         = process.env.BOT_TOKEN;
var ADMIN_TELEGRAM_ID = parseInt(process.env.ADMIN_TELEGRAM_ID) || 0;
var FRONTEND_URL      = process.env.FRONTEND_URL || 'http://localhost:5173';

if (!BOT_TOKEN) {
  console.error('[Bot] BOT_TOKEN is not set in .env');
  process.exit(1);
}

var bot = new Telegraf(BOT_TOKEN);

// ─── Helper: upsert user into DB ─────────────────────────────────────────────
function upsertUser(from) {
  if (!from) return Promise.resolve();
  var isAdmin = (from.id === ADMIN_TELEGRAM_ID) ? 1 : 0;
  var sql = [
    'INSERT INTO users (telegram_id, username, first_name, last_name, is_admin)',
    'VALUES (?, ?, ?, ?, ?)',
    'ON DUPLICATE KEY UPDATE',
    '  username   = VALUES(username),',
    '  first_name = VALUES(first_name),',
    '  last_name  = VALUES(last_name)'
  ].join(' ');
  return db.execute(sql, [
    from.id,
    from.username   || null,
    from.first_name || null,
    from.last_name  || null,
    isAdmin
  ]).catch(function(err) {
    console.error('[Bot] upsertUser error:', err.message);
  });
}

// ─── /start ──────────────────────────────────────────────────────────────────
bot.start(function(ctx) {
  upsertUser(ctx.from);

  var firstName = (ctx.from && ctx.from.first_name) || 'ተጫዋች';
  var isAdmin   = ctx.from && ctx.from.id === ADMIN_TELEGRAM_ID;

  // Button text: emoji only + Latin — avoids ????? on devices without Amharic font
  var keyboard = {
    inline_keyboard: [
      [{ text: '🎰 Open KEBRCHACHA', web_app: { url: FRONTEND_URL } }]
    ]
  };

  if (isAdmin) {
    keyboard.inline_keyboard.push([
      { text: '⚙️ Admin Dashboard', web_app: { url: FRONTEND_URL + '/admin' } }
    ]);
  }

  // Impressive Amharic welcome message (message body supports Amharic fine)
  var msg = [
    '🎰✨ *ወደ ከበርቻቻ እንኳን ደህና መጡ!* ✨🎰',
    '',
    'ሰላም *' + firstName + '*! 👋',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '🏆 *እንዴት ይጫወታሉ?*',
    '━━━━━━━━━━━━━━━━━━━━━',
    '1️⃣  ንቁ ክፍል ይምረጡ',
    '2️⃣  ቁጥርዎን ይምረጡ \\(1\\-50\\)',
    '3️⃣  የክፍያ ቅጽበታዊ ምስል ይጫኑ',
    '4️⃣  የአስተዳዳሪ ማረጋገጫ ይጠብቁ',
    '5️⃣  ሁሉም ቦታዎች ሲሞሉ ዕጣ ይሳላል\\!',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '🥇 *1ኛ ሽልማት* \\| 🥈 *2ኛ ሽልማት* \\| 🥉 *3ኛ ሽልማት*',
    '',
    isAdmin
      ? '⚙️ _የአስተዳዳሪ መዳረሻ አለዎት_'
      : '🍀 _መልካም እድል\\!_'
  ].filter(Boolean).join('\n');

  ctx.replyWithMarkdownV2(msg, { reply_markup: keyboard })
    .catch(function() {
      // Fallback: plain text if MarkdownV2 fails
      var plain = [
        '� ወደ ከበርቻቻ እንኳን ደህና መጡ!',
        '',
        'ሰላም ' + firstName + '! 👋',
        '',
        '🏆 እንዴት ይጫወታሉ?',
        '1. ንቁ ክፍል ይምረጡ',
        '2. ቁጥርዎን ይምረጡ (1-50)',
        '3. የክፍያ ቅጽበታዊ ምስል ይጫኑ',
        '4. ማረጋገጫ ይጠብቁ',
        '5. ዕጣ ይሳላል!',
        '',
        '🥇 1ኛ | 🥈 2ኛ | 🥉 3ኛ ሽልማት',
        isAdmin ? '\n⚙️ Admin access enabled.' : '\n🍀 Good luck!'
      ].join('\n');
      ctx.reply(plain, { reply_markup: keyboard });
    });
});

// ─── /help ───────────────────────────────────────────────────────────────────
bot.help(function(ctx) {
  upsertUser(ctx.from);
  ctx.reply([
    '🎰 ከበርቻቻ እገዛ',
    '',
    '/start - ጨዋታ ክፈት',
    '/rooms - ንቁ ክፍሎች',
    '/mytickets - ትኬቶቼ',
    '/help - ይህን መልዕክት አሳይ'
  ].join('\n'));
});

// ─── /rooms ──────────────────────────────────────────────────────────────────
bot.command('rooms', function(ctx) {
  upsertUser(ctx.from);

  db.execute('SELECT * FROM rooms WHERE status = 'active' ORDER BY created_at DESC LIMIT 5')
    .then(function(results) {
      var rooms = results[0];
      if (!rooms || rooms.length === 0) {
        return ctx.reply('No active rooms right now. Check back soon! 🎲');
      }

      var lines = ['🎰 ንቁ ክፍሎች:\n'];
      rooms.forEach(function(room) {
        var pct = Math.round((room.filled_slots / room.total_slots) * 100);
        lines.push('🏠 ' + room.title);
        lines.push('💰 ክፍያ: ' + room.entry_fee + ' ብር');
        lines.push('📊 ' + room.filled_slots + '/50 (' + pct + '%)');
        lines.push('🥇 ' + room.prize_1st + ' | 🥈 ' + room.prize_2nd + ' | 🥉 ' + room.prize_3rd + ' ብር');
        lines.push('');
      });

      return ctx.reply(lines.join('\n'), {
        reply_markup: {
          inline_keyboard: [[
            { text: '🎮 አሁን ተጫወት', web_app: { url: FRONTEND_URL } }
          ]]
        }
      });
    })
    .catch(function(err) {
      console.error('[Bot/rooms] Error:', err);
      ctx.reply('Failed to fetch rooms. Please try again.');
    });
});

// ─── /mytickets ──────────────────────────────────────────────────────────────
bot.command('mytickets', function(ctx) {
  upsertUser(ctx.from);

  var telegramId = ctx.from.id;
  var sql = [
    'SELECT t.number, t.status, r.title',
    'FROM tickets t',
    'JOIN users u ON t.user_id = u.id',
    'JOIN rooms r ON t.room_id = r.id',
    'WHERE u.telegram_id = ?',
    'ORDER BY t.created_at DESC',
    'LIMIT 10'
  ].join(' ');

  db.execute(sql, [telegramId])
    .then(function(results) {
      var tickets = results[0];
      if (!tickets || tickets.length === 0) {
        return ctx.reply('You have no tickets yet. Join a room to play! 🎲');
      }

      var lines = ['🎫 ትኬቶቼ:\n'];
      tickets.forEach(function(t) {
        var icon = t.status === 'verified' ? '✅' : (t.status === 'rejected' ? '❌' : '⏳');
        lines.push(icon + ' #' + t.number + ' — ' + t.title + ' — ' + (
          t.status === 'verified' ? 'ተረጋግጧል' :
          t.status === 'rejected' ? 'ውድቅ ሆኗል' : 'በመጠባበቅ ላይ'
        ));
      });

      return ctx.reply(lines.join('\n'));
    })
    .catch(function(err) {
      console.error('[Bot/mytickets] Error:', err);
      ctx.reply('Failed to fetch tickets. Please try again.');
    });
});

// ─── Admin: Notify on new payment ────────────────────────────────────────────
function notifyAdminNewPayment(paymentData) {
  if (!ADMIN_TELEGRAM_ID) return;

  var message = [
    '💳 New Payment Received!',
    '',
    '👤 User: @' + (paymentData.username || 'unknown'),
    '🏠 Room: ' + paymentData.room_title,
    '🔢 Number: #' + paymentData.number,
    '💰 Amount: ' + paymentData.amount + ' ETB',
    '',
    '👉 Review in Admin Dashboard'
  ].join('\n');

  bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, message, {
    reply_markup: {
      inline_keyboard: [[
        { text: '⚙️ Open Dashboard', web_app: { url: FRONTEND_URL + '/admin' } }
      ]]
    }
  }).catch(function(err) {
    console.error('[Bot] Failed to notify admin:', err.message);
  });
}

// ─── Start bot ───────────────────────────────────────────────────────────────
bot.launch()
  .then(function() {
    console.log('[Bot] KEBRCHACHA bot is running...');
  })
  .catch(function(err) {
    console.error('[Bot] Failed to start:', err.message);
  });

// Graceful stop
process.once('SIGINT',  function() { bot.stop('SIGINT');  });
process.once('SIGTERM', function() { bot.stop('SIGTERM'); });

module.exports = { bot: bot, notifyAdminNewPayment: notifyAdminNewPayment };
