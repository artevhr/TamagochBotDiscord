const db = require('./db');

// Насколько быстро меняются параметры (за один тик = 5 мин)
const HUNGER_DRAIN   = 3;   // -сытость/тик
const HAPPY_DRAIN    = 2;   // -настроение/тик
const HEALTH_REGEN   = 2;   // +здоровье/тик если сытость > 50
const HEALTH_DRAIN   = 5;   // -здоровье/тик если сытость < 20
const TICK_MS        = 5 * 60 * 1000; // 5 минут
const XP_PER_TICK    = 1;   // пассивный XP за выживание

// Кулдауны в миллисекундах
const COOLDOWNS = {
  feed:   15 * 60 * 1000,  // 15 мин
  pet:    10 * 60 * 1000,  // 10 мин
  play:   20 * 60 * 1000,  // 20 мин
  work:   60 * 60 * 1000,  // 1 час (работа)
  daily: 24 * 60 * 60 * 1000, // 24 ч (ежедневная награда)
};

// Цены и награды
const PRICES = {
  feed:   50,    // стоимость покормить
  pet:    20,    // стоимость погладить
  play:   30,    // стоимость поиграть
  revive: 1000,  // стоимость возродить
};

const REWARDS = {
  feed_xp:   3,   // XP за кормёжку
  play_xp:   5,   // XP за игру
  work_min:  80,  // мин монет с работы
  work_max:  200, // макс монет с работы
  daily:     150, // ежедневный бонус
};

/**
 * Определяет настроение питомца по его статам
 */
function getMood(pet) {
  if (pet.is_dead)          return 'dead';
  if (pet.hunger   < 15)    return 'hungry';
  if (pet.health   < 30)    return 'sick';
  if (pet.happiness > 75)   return 'happy';
  if (pet.happiness < 25)   return 'sad';
  return 'neutral';
}

const MOOD_TEXTS = {
  dead:    '† мёртв †',
  hungry:  'очень голоден!',
  sick:    'чувствует себя плохо...',
  happy:   'в восторге!',
  sad:     'грустит...',
  neutral: 'всё нормально',
};

function getMoodText(mood) {
  return MOOD_TEXTS[mood] || 'нормально';
}

/**
 * Проверяет кулдаун. Возвращает 0 если готово, или секунды до конца.
 */
function checkCooldown(lastUsed, cooldownMs) {
  if (!lastUsed) return 0;
  const elapsed = Date.now() - lastUsed;
  if (elapsed >= cooldownMs) return 0;
  return Math.ceil((cooldownMs - elapsed) / 1000);
}

/**
 * Форматирует секунды в "X мин Y сек" или просто "X мин"
 */
function formatCooldown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0 && s > 0) return `${m} мин ${s} сек`;
  if (m > 0) return `${m} мин`;
  return `${s} сек`;
}

/**
 * Глобальный тик — обновляет всех живых питомцев
 */
function tickAllPets() {
  const pets = db.getAllAlivePets();
  const now = Date.now();

  for (const pet of pets) {
    const elapsed = now - pet.last_tick;
    const ticks = Math.floor(elapsed / TICK_MS);
    if (ticks < 1) continue;

    let { hunger, happiness, health, age_ticks, xp, level } = pet;

    for (let i = 0; i < ticks; i++) {
      hunger     = Math.max(0, hunger     - HUNGER_DRAIN);
      happiness  = Math.max(0, happiness  - HAPPY_DRAIN);
      age_ticks += 1;
      xp        += XP_PER_TICK;

      if (hunger < 20) {
        health = Math.max(0, health - HEALTH_DRAIN);
      } else if (hunger > 50) {
        health = Math.min(100, health + HEALTH_REGEN);
      }
    }

    // Проверка левелапа (каждые 100 XP)
    const xpPerLevel = 100;
    while (xp >= xpPerLevel) {
      xp -= xpPerLevel;
      level += 1;
    }

    const is_dead = health <= 0 ? 1 : 0;

    db.updatePet(pet.guild_id, {
      hunger,
      happiness,
      health,
      age_ticks,
      xp,
      level,
      is_dead,
      last_tick: now,
    });

    if (is_dead) {
      console.log(`💀 Питомец "${pet.name}" на сервере ${pet.guild_id} умер`);
    }
  }
}

/**
 * Переводит age_ticks в читаемый возраст
 * 1 тик = 5 мин → 288 тиков = 1 день
 */
function formatAge(ageTicks) {
  const totalMinutes = ageTicks * 5;
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);

  if (days > 0) return `${days} д. ${hours} ч.`;
  if (hours > 0) return `${hours} ч.`;
  return `${totalMinutes} мин.`;
}

/**
 * XP до следующего уровня
 */
function xpToNext(pet) {
  return 100 - pet.xp;
}

// Рандомные имена для нового котика
const CAT_NAMES = [
  'Мурзик', 'Барсик', 'Васька', 'Тигра', 'Пушок',
  'Снежок', 'Рыжик', 'Бублик', 'Котофей', 'Кузьма',
  'Персик', 'Шурик', 'Мотя', 'Феликс', 'Батон',
  'Нарцисс', 'Пончик', 'Хомяк', 'Маршал', 'Кефир',
];

function randomCatName() {
  return CAT_NAMES[Math.floor(Math.random() * CAT_NAMES.length)];
}

module.exports = {
  getMood,
  getMoodText,
  checkCooldown,
  formatCooldown,
  tickAllPets,
  formatAge,
  xpToNext,
  randomCatName,
  COOLDOWNS,
  PRICES,
  REWARDS,
  TICK_MS,
};
