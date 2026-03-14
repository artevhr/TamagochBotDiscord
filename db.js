const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'tamagotchi.db'));

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pets (
      guild_id   TEXT    PRIMARY KEY,
      name       TEXT    NOT NULL DEFAULT 'Мурзик',
      hunger     INTEGER NOT NULL DEFAULT 80,
      happiness  INTEGER NOT NULL DEFAULT 80,
      health     INTEGER NOT NULL DEFAULT 100,
      age_ticks  INTEGER NOT NULL DEFAULT 0,
      level      INTEGER NOT NULL DEFAULT 1,
      xp         INTEGER NOT NULL DEFAULT 0,
      is_dead    INTEGER NOT NULL DEFAULT 0,
      last_tick  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS feeders (
      guild_id   TEXT    NOT NULL,
      user_id    TEXT    NOT NULL,
      username   TEXT    NOT NULL,
      feed_count INTEGER NOT NULL DEFAULT 0,
      pet_count  INTEGER NOT NULL DEFAULT 0,
      play_count INTEGER NOT NULL DEFAULT 0,
      last_action INTEGER,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS cooldowns (
      guild_id TEXT NOT NULL,
      user_id  TEXT NOT NULL,
      action   TEXT NOT NULL,
      last_used INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, action)
    );

    CREATE TABLE IF NOT EXISTS wallets (
      guild_id   TEXT    NOT NULL,
      user_id    TEXT    NOT NULL,
      username   TEXT    NOT NULL,
      coins      INTEGER NOT NULL DEFAULT 0,
      total_earned INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT    NOT NULL,
      from_id    TEXT,
      to_id      TEXT    NOT NULL,
      amount     INTEGER NOT NULL,
      reason     TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);

  console.log('✅ База данных инициализирована');
}

function getPet(guildId) {
  return db.prepare('SELECT * FROM pets WHERE guild_id = ?').get(guildId);
}

function createPet(guildId, name = 'Мурзик') {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO pets
      (guild_id, name, hunger, happiness, health, age_ticks, level, xp, is_dead, last_tick, created_at)
    VALUES (?, ?, 80, 80, 100, 0, 1, 0, 0, ?, ?)
  `).run(guildId, name, now, now);
  return getPet(guildId);
}

function updatePet(guildId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE pets SET ${setClause} WHERE guild_id = ?`).run(...values, guildId);
}

function getAllAlivePets() {
  return db.prepare('SELECT * FROM pets WHERE is_dead = 0').all();
}

function recordAction(guildId, userId, username, action) {
  const existing = db.prepare('SELECT * FROM feeders WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!existing) {
    db.prepare(`
      INSERT INTO feeders (guild_id, user_id, username, feed_count, pet_count, play_count, last_action)
      VALUES (?, ?, ?, 0, 0, 0, ?)
    `).run(guildId, userId, username, Date.now());
  } else {
    db.prepare('UPDATE feeders SET username = ?, last_action = ? WHERE guild_id = ? AND user_id = ?')
      .run(username, Date.now(), guildId, userId);
  }

  const col = action === 'feed' ? 'feed_count' : action === 'pet' ? 'pet_count' : 'play_count';
  db.prepare(`UPDATE feeders SET ${col} = ${col} + 1 WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
}

function getTopFeeders(guildId, limit = 3) {
  return db.prepare(`
    SELECT username, feed_count, pet_count, play_count,
           (feed_count * 3 + pet_count + play_count * 2) AS score
    FROM feeders
    WHERE guild_id = ?
    ORDER BY score DESC
    LIMIT ?
  `).all(guildId, limit);
}

function getCooldown(guildId, userId, action) {
  return db.prepare(
    'SELECT last_used FROM cooldowns WHERE guild_id = ? AND user_id = ? AND action = ?'
  ).get(guildId, userId, action);
}

function setCooldown(guildId, userId, action) {
  db.prepare(`
    INSERT OR REPLACE INTO cooldowns (guild_id, user_id, action, last_used)
    VALUES (?, ?, ?, ?)
  `).run(guildId, userId, action, Date.now());
}

// ─── Кошельки ────────────────────────────────────────────────────────────────

function ensureWallet(guildId, userId, username) {
  const exists = db.prepare('SELECT 1 FROM wallets WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!exists) {
    db.prepare(`
      INSERT INTO wallets (guild_id, user_id, username, coins, total_earned)
      VALUES (?, ?, ?, 0, 0)
    `).run(guildId, userId, username);
  } else {
    db.prepare('UPDATE wallets SET username = ? WHERE guild_id = ? AND user_id = ?').run(username, guildId, userId);
  }
}

function getWallet(guildId, userId) {
  return db.prepare('SELECT * FROM wallets WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

function getCoins(guildId, userId) {
  const w = getWallet(guildId, userId);
  return w ? w.coins : 0;
}

/**
 * Начислить монеты. reason — строка для истории транзакций.
 */
function addCoins(guildId, userId, username, amount, reason = 'reward') {
  ensureWallet(guildId, userId, username);
  db.prepare(`
    UPDATE wallets SET coins = coins + ?, total_earned = total_earned + ?
    WHERE guild_id = ? AND user_id = ?
  `).run(amount, Math.max(0, amount), guildId, userId);
  db.prepare(`
    INSERT INTO transactions (guild_id, from_id, to_id, amount, reason)
    VALUES (?, NULL, ?, ?, ?)
  `).run(guildId, userId, amount, reason);
}

/**
 * Списать монеты. Возвращает true если успешно, false если не хватает.
 */
function spendCoins(guildId, userId, username, amount, reason = 'spend') {
  ensureWallet(guildId, userId, username);
  const wallet = getWallet(guildId, userId);
  if (!wallet || wallet.coins < amount) return false;
  db.prepare(`
    UPDATE wallets SET coins = coins - ? WHERE guild_id = ? AND user_id = ?
  `).run(amount, guildId, userId);
  db.prepare(`
    INSERT INTO transactions (guild_id, from_id, to_id, amount, reason)
    VALUES (?, ?, NULL, ?, ?)
  `).run(guildId, userId, amount, reason);
  return true;
}

/**
 * Перевод монет между пользователями. Атомарная транзакция.
 * Возвращает { ok, reason }
 */
function transferCoins(guildId, fromId, fromName, toId, toName, amount) {
  ensureWallet(guildId, fromId, fromName);
  ensureWallet(guildId, toId, toName);
  const from = getWallet(guildId, fromId);
  if (!from || from.coins < amount) return { ok: false, reason: 'not_enough' };
  if (fromId === toId) return { ok: false, reason: 'self' };

  const transfer = db.transaction(() => {
    db.prepare('UPDATE wallets SET coins = coins - ? WHERE guild_id = ? AND user_id = ?').run(amount, guildId, fromId);
    db.prepare('UPDATE wallets SET coins = coins + ?, total_earned = total_earned + ? WHERE guild_id = ? AND user_id = ?').run(amount, amount, guildId, toId);
    db.prepare(`
      INSERT INTO transactions (guild_id, from_id, to_id, amount, reason)
      VALUES (?, ?, ?, ?, 'transfer')
    `).run(guildId, fromId, toId, amount);
  });
  transfer();
  return { ok: true };
}

/**
 * Топ богачей сервера
 */
function getRichList(guildId, limit = 10) {
  return db.prepare(`
    SELECT username, coins, total_earned
    FROM wallets
    WHERE guild_id = ?
    ORDER BY coins DESC
    LIMIT ?
  `).all(guildId, limit);
}

/**
 * Последние транзакции пользователя
 */
function getHistory(guildId, userId, limit = 5) {
  return db.prepare(`
    SELECT * FROM transactions
    WHERE guild_id = ? AND (from_id = ? OR to_id = ?)
    ORDER BY created_at DESC
    LIMIT ?
  `).all(guildId, userId, userId, limit);
}

module.exports = {
  init,
  getPet,
  createPet,
  updatePet,
  getAllAlivePets,
  recordAction,
  getTopFeeders,
  getCooldown,
  setCooldown,
  // economy
  ensureWallet,
  getWallet,
  getCoins,
  addCoins,
  spendCoins,
  transferCoins,
  getRichList,
  getHistory,
};
