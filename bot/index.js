'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

var TelegrafModule = require('telegraf');
var Telegraf = TelegrafModule.default || TelegrafModule;
var db       = require('../config/db');

var BOT_TOKEN         = process.env.BOT_TOKEN;
var ADMIN_TELEGRAM_ID = parseInt(process.env.ADMIN_TELEGRAM_ID) || 0;
var FRONTEND_URL      = process.env.FRONTEND_URL || 'http://localhost:5173';

if (!BOT_TOKEN) {
  console.error('[Bot] BOT_TOKEN is not set — bot disabled');
  module.exports = { bot: null, notifyAdminNewPayment: function() {} };
  return;
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

// ─── /start ────────────────────────────────────────────
bot.start(function(ctx) {
  upsertUser(ctx.from);

  var isAdmin = ctx.from && ctx.from.id === ADMIN_TELEGRAM_ID;

  var keyboard = {
    inline_keyboard: [
      [{ text: '🎮 ጨዋታ ጀምር', web_app: { url: FRONTEND_URL } }],
      [
        { text: '📢 ቻናል ይጎብኙ', url: 'https://t.me/keberechacha' },
        { text: '👥 ግሩፕ ይቀላቀሉ', url: 'https://t.me/+LtpfRVF3KgY2YWE0' }
      ],
      [{ text: '📞 የደንበኛ አገልግሎት', url: 'https://t.me/Tesfa3362' }]
    ]
  };

  if (isAdmin) {
    keyboard.inline_keyboard.push([
      { text: '⚙️ Admin Dashboard', web_app: { url: FRONTEND_URL + '/admin' } }
    ]);
  }

  var msg = [
    '🎲 እንኳን ወደ ከብርቻቻ (KEBRCHACHA) በደህና መጥው! 🎲',
    '',
    'የዕልዎን መናወጥ ለመሞከር እና በትንሽ ኢንቀስትምንት ትልቅ ሽላማቶችን ለማሽነፈ ትክክለኛው ቦታ ላይ ነወት።',
    'ከብርቻቻ ዘመናዊ፣ ግልጸ እና ታማኝ የሆነ የዲጂታል ዕጸ ማወጸያ መድረክ ነው።',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    'ለመጀመር የሚከተሉትን ደረጃዎች ይከተሉ፡',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '1️⃣ ክፈል ይምረጡ፡ በአሁኑ ሰዓት ክፈት የሆኑ የጨዋታ ክፈሎችን (Rooms) ከታች ባለው ዝርዝር ይምረጡ።',
    '2️⃣ ቅጥርዎን ይያዙ፡ ከ' + '1-50 ባለው የቅጥር ሰንጸረጅ ላይ የፈለጉትን ዕደለኛ ቅጥር ይምረጡ።',
    '3️⃣ ክፈያዎን ያረጋግጡ፡ የቴለብር ክፈያ በመፈፈነም ደረሰኞን ይላኩ። ቅጥርው ወዲያውኑ በስምዎ ይያዛል።',
    '4️⃣ ዕጸውን ይጠበቁ፡ የክፈሉ ተጫወቾች እንደሞሉ ሲስተም በራሱ አሽናፊዎችን ይለያል!',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '📍 ማሳሰቢያ፡ ሁሉም የዕጸ አወጸጥ ሂደቶች በዘመናዊ ቴክኖሎጂ የታገዙ እና ፍጹም ግልጸነት ያላቻው ናቸው።',
    '',
    'መልካም ዕድል! 🍀'
  ].join('\n');

  ctx.reply(msg, { reply_markup: keyboard });
});

// ─── /help ───────────────────────────────────────────────────────────────────
bot.help(function(ctx) {
  upsertUser(ctx.from);
  ctx.reply([
    '\uD83C\uDFB0 \u12A8\u1260\u122D\u127B\u127B \u12A5\u1308\u12DB',
    '',
    '/start - \u1328\u12CB\u1273 \u12AD\u1348\u1275',
    '/rooms - \u1295\u1241 \u12AD\u1348\u120E\u127D',
    '/mytickets - \u1275\u12A8\u1276\u127E',
    '/help - \u12ED\u1205\u1295 \u1218\u120D\u12D5\u12AD\u1275 \u12A0\u1233\u12ED'
  ].join('\n'));
});

// ─── /rooms ──────────────────────────────────────────────────────────────────
bot.command('rooms', function(ctx) {
  upsertUser(ctx.from);

  var sql = "SELECT * FROM rooms WHERE status = 'active' ORDER BY created_at DESC LIMIT 5";
  db.execute(sql)
    .then(function(results) {
      var rooms = results[0];
      if (!rooms || rooms.length === 0) {
        return ctx.reply('No active rooms right now. Check back soon! \uD83C\uDFB2');
      }

      var lines = ['\uD83C\uDFB0 \u1295\u1241 \u12AD\u1348\u120E\u127D:\n'];
      rooms.forEach(function(room) {
        var pct = Math.round((room.filled_slots / room.total_slots) * 100);
        lines.push('\uD83C\uDFE0 ' + room.title);
        lines.push('\uD83D\uDCB0 \u12AD\u1348\u12EB: ' + room.entry_fee + ' \u1265\u122D');
        lines.push('\uD83D\uDCCA ' + room.filled_slots + '/50 (' + pct + '%)');
        lines.push('\uD83E\uDD47 ' + room.prize_1st + ' | \uD83E\uDD48 ' + room.prize_2nd + ' | \uD83E\uDD49 ' + room.prize_3rd + ' \u1265\u122D');
        lines.push('');
      });

      return ctx.reply(lines.join('\n'), {
        reply_markup: {
          inline_keyboard: [[
            { text: '\uD83C\uDFAE \u12A0\u1201\u1295 \u1270\u132B\u12C8\u1275', web_app: { url: FRONTEND_URL } }
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
        return ctx.reply('You have no tickets yet. Join a room to play! \uD83C\uDFB2');
      }

      var lines = ['\uD83C\uDFAB \u1275\u12A8\u1276\u127E:\n'];
      tickets.forEach(function(t) {
        var icon = t.status === 'verified' ? '\u2705' : (t.status === 'rejected' ? '\u274C' : '\u23F3');
        lines.push(icon + ' #' + t.number + ' \u2014 ' + t.title + ' \u2014 ' + (
          t.status === 'verified' ? '\u1270\u1228\u130B\u130D\u1327\u120D' :
          t.status === 'rejected' ? '\u12EB\u12F0\u1245 \u1206\u1297\u120D' : '\u1260\u1218\u1320\u1263\u1260\u1245 \u120B\u12ED'
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
    '\uD83D\uDCB3 New Payment Received!',
    '',
    '\uD83D\uDC64 User: @' + (paymentData.username || 'unknown'),
    '\uD83C\uDFE0 Room: ' + paymentData.room_title,
    '\uD83D\uDD22 Number: #' + paymentData.number,
    '\uD83D\uDCB0 Amount: ' + paymentData.amount + ' ETB',
    '',
    '\uD83D\uDC49 Review in Admin Dashboard'
  ].join('\n');

  bot.telegram.sendMessage(ADMIN_TELEGRAM_ID, message, {
    reply_markup: {
      inline_keyboard: [[
        { text: '\u2699\uFE0F Open Dashboard', web_app: { url: FRONTEND_URL + '/admin' } }
      ]]
    }
  }).catch(function(err) {
    console.error('[Bot] Failed to notify admin:', err.message);
  });
}

// ─── Start bot ───────────────────────────────────────────────────────────────
function launchBot() {
  bot.launch()
    .then(function() {
      console.log('[Bot] KEBRCHACHA bot is running...');
    })
    .catch(function(err) {
      console.error('[Bot] Launch failed:', err.message, '— retrying in 5s...');
      setTimeout(launchBot, 5000);
    });
}

// Auto-reconnect on polling errors (network drops, Telegram timeouts)
bot.catch(function(err) {
  console.error('[Bot] Polling error:', err.message);
});

launchBot();

module.exports = { bot: bot, notifyAdminNewPayment: notifyAdminNewPayment };
