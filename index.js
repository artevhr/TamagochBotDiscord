require('dotenv').config();
const { Client, GatewayIntentBits, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('./db');
const {
  getMood, getMoodText, randomCatName,
  checkCooldown, formatCooldown,
  tickAllPets,
  COOLDOWNS, PRICES, REWARDS,
} = require('./engine');
const { renderPetCard } = require('./card');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const PREFIX = '!';

client.once('ready', () => {
  console.log(`\n✅ Бот запущен как ${client.user.tag}`);
  db.init();
  setInterval(tickAllPets, 5 * 60 * 1000);
  console.log('⏰ Тик-система запущена\n');
});

async function sendCard(message, pet, feeders) {
  try {
    const buffer = await renderPetCard(pet, feeders);
    const att = new AttachmentBuilder(buffer, { name: 'pet.png' });
    await message.reply({ files: [att] });
  } catch (err) {
    console.error('Ошибка рендера карточки:', err);
    await message.reply('⚠️ Не удалось нарисовать карточку.');
  }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function coins(n) { return `**${n} 🪙**`; }

const FEED_REACTIONS = ['😋', '🍣', '🐟', '😸', '🎉'];
const PET_REACTIONS  = ['🐾', '😻', '💕', '✨'];
const PLAY_GAMES = [
  'гонялся за лазерной точкой', 'прыгал в коробку', 'ловил фантик на верёвочке',
  'носился по всей комнате', 'охотился за клубком ниток', 'атаковал шуршащий пакет',
];
const PURR_MESSAGES = [
  '*(мурлычет и трётся о ноги...)*',
  '*(счастливо жмурится...)*',
  '*(довольно машет хвостом...)*',
];
const WORK_EVENTS = [
  { text: 'разгрузил вагон с рыбой',         emoji: '🐟' },
  { text: 'написал курсовую за сокурсника',   emoji: '📝' },
  { text: 'сдал алюминиевые банки',           emoji: '♻️' },
  { text: 'выиграл турнир по шахматам',       emoji: '♟️' },
  { text: 'нашёл монету на улице',            emoji: '🍀' },
  { text: 'помог соседу с компом',            emoji: '💻' },
  { text: 'продал домашние пирожки',          emoji: '🥐' },
  { text: 'починил велосипед другу',          emoji: '🚲' },
  { text: 'спел на улице за пожертвования',   emoji: '🎸' },
  { text: 'выиграл в лотерею небольшой приз', emoji: '🎟️' },
];

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const parts    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd      = parts[0].toLowerCase();
  const args     = parts.slice(1);
  const guildId  = message.guild.id;
  const userId   = message.author.id;
  const username = message.author.displayName || message.author.username;

  db.ensureWallet(guildId, userId, username);

  let pet = db.getPet(guildId);
  if (!pet) {
    const firstName = randomCatName();
    pet = db.createPet(guildId, firstName);
    await message.channel.send(
      `🐣 На сервере появился питомец **${firstName}**!\n` +
      `Используй \`!работать\` чтобы зарабатывать монеты и \`!покормить\` чтобы кормить котика 🐱`
    );
  }

  // ВОЗРОДИТЬ
  if (['возродить', 'revive', 'newpet'].includes(cmd)) {
    if (!pet.is_dead) return message.reply(`😺 **${pet.name}** живёт и здравствует!`);
    const balance = db.getCoins(guildId, userId);
    if (balance < PRICES.revive) {
      return message.reply(
        `💀 Возрождение стоит ${coins(PRICES.revive)}, у тебя ${coins(balance)}.\n` +
        `Не хватает ${coins(PRICES.revive - balance)}. Заработай командой \`!работать\``
      );
    }
    const newName = args[0] || randomCatName();
    db.spendCoins(guildId, userId, username, PRICES.revive, 'revive');
    pet = db.createPet(guildId, newName);
    return message.reply(`🐣 **${username}** потратил(а) ${coins(PRICES.revive)} и возродил(а) питомца!\nДобро пожаловать, **${newName}**! 🎉`);
  }

  const careCommands = ['покормить','корм','feed','погладить','гладить','stroke','играть','play'];
  if (pet.is_dead && careCommands.includes(cmd)) {
    const feeders = db.getTopFeeders(guildId);
    await sendCard(message, pet, feeders);
    return message.channel.send(`💀 Питомец мёртв. Возродить: \`!возродить [имя]\` (стоит ${coins(PRICES.revive)})`);
  }

  switch (cmd) {

    case 'статус': case 'status': case 'питомец': case 'кот': case 'cat': {
      const feeders = db.getTopFeeders(guildId);
      await sendCard(message, pet, feeders);
      break;
    }

    case 'покормить': case 'корм': case 'feed': {
      const balance = db.getCoins(guildId, userId);
      if (balance < PRICES.feed)
        return message.reply(`🪙 Кормёжка стоит ${coins(PRICES.feed)}, у тебя ${coins(balance)}. Заработай: \`!работать\``);
      const cdRow = db.getCooldown(guildId, userId, 'feed');
      const rem   = checkCooldown(cdRow?.last_used, COOLDOWNS.feed);
      if (rem > 0) return message.reply(`⏰ Подожди ещё **${formatCooldown(rem)}**!`);

      const gain = Math.floor(Math.random() * 10) + 15;
      db.spendCoins(guildId, userId, username, PRICES.feed, 'feed_pet');
      db.updatePet(guildId, { hunger: Math.min(100, pet.hunger + gain) });
      db.setCooldown(guildId, userId, 'feed');
      db.recordAction(guildId, userId, username, 'feed');
      pet = db.getPet(guildId);

      await message.reply(
        `${pick(FEED_REACTIONS)} **${username}** покормил(а) **${pet.name}**! (−${coins(PRICES.feed)}, баланс: ${coins(db.getCoins(guildId,userId))})\n` +
        `Сытость: +${gain} → ${pet.hunger}/100`
      );
      if (getMood(pet) === 'happy' && Math.random() > 0.4) await message.channel.send(pick(PURR_MESSAGES));
      break;
    }

    case 'погладить': case 'гладить': case 'stroke': {
      if (pet.hunger < 20) return message.reply(`😿 **${pet.name}** слишком голоден... Сначала накорми: \`!покормить\``);
      const balance = db.getCoins(guildId, userId);
      if (balance < PRICES.pet) return message.reply(`🪙 Погладить стоит ${coins(PRICES.pet)}, у тебя ${coins(balance)}.`);
      const cdRow = db.getCooldown(guildId, userId, 'pet');
      const rem   = checkCooldown(cdRow?.last_used, COOLDOWNS.pet);
      if (rem > 0) return message.reply(`🐾 **${pet.name}** ещё не соскучился! Подожди **${formatCooldown(rem)}**.`);

      const gain = Math.floor(Math.random() * 8) + 10;
      db.spendCoins(guildId, userId, username, PRICES.pet, 'pet_cat');
      db.updatePet(guildId, { happiness: Math.min(100, pet.happiness + gain) });
      db.setCooldown(guildId, userId, 'pet');
      db.recordAction(guildId, userId, username, 'pet');

      await message.reply(
        `${pick(PET_REACTIONS)} **${username}** погладил(а) **${pet.name}**! (−${coins(PRICES.pet)}, баланс: ${coins(db.getCoins(guildId,userId))})\n` +
        `Настроение: +${gain} → ${db.getPet(guildId).happiness}/100`
      );
      break;
    }

    case 'играть': case 'play': {
      if (pet.hunger < 30) return message.reply(`😿 Слишком голоден для игры! \`!покормить\``);
      const balance = db.getCoins(guildId, userId);
      if (balance < PRICES.play) return message.reply(`🪙 Поиграть стоит ${coins(PRICES.play)}, у тебя ${coins(balance)}.`);
      const cdRow = db.getCooldown(guildId, userId, 'play');
      const rem   = checkCooldown(cdRow?.last_used, COOLDOWNS.play);
      if (rem > 0) return message.reply(`😴 **${pet.name}** устал! Подожди **${formatCooldown(rem)}**.`);

      const happGain   = Math.floor(Math.random() * 12) + 15;
      const hungerLoss = Math.floor(Math.random() * 5)  + 5;
      db.spendCoins(guildId, userId, username, PRICES.play, 'play_with_pet');
      db.updatePet(guildId, { happiness: Math.min(100, pet.happiness + happGain), hunger: Math.max(0, pet.hunger - hungerLoss) });
      db.setCooldown(guildId, userId, 'play');
      db.recordAction(guildId, userId, username, 'play');

      await message.reply(
        `🎾 **${pet.name}** ${pick(PLAY_GAMES)} с **${username}**! (−${coins(PRICES.play)}, баланс: ${coins(db.getCoins(guildId,userId))})\n` +
        `+${happGain} 😊  |  −${hungerLoss} 🍖`
      );
      break;
    }

    case 'работать': case 'work': case 'earn': {
      const cdRow = db.getCooldown(guildId, userId, 'work');
      const rem   = checkCooldown(cdRow?.last_used, COOLDOWNS.work);
      if (rem > 0) return message.reply(`😓 Ты уже работал(а)! Отдохни ещё **${formatCooldown(rem)}**.`);

      const earned = Math.floor(Math.random() * (REWARDS.work_max - REWARDS.work_min + 1)) + REWARDS.work_min;
      const event  = pick(WORK_EVENTS);
      db.addCoins(guildId, userId, username, earned, 'work');
      db.setCooldown(guildId, userId, 'work');

      await message.reply(`${event.emoji} **${username}** ${event.text} и заработал(а) ${coins(earned)}!\nБаланс: ${coins(db.getCoins(guildId,userId))}`);
      break;
    }

    case 'ежедневно': case 'daily': case 'бонус': {
      const cdRow = db.getCooldown(guildId, userId, 'daily');
      const rem   = checkCooldown(cdRow?.last_used, COOLDOWNS.daily);
      if (rem > 0) return message.reply(`🎁 Ежедневная награда уже получена! Следующая через **${formatCooldown(rem)}**.`);

      db.addCoins(guildId, userId, username, REWARDS.daily, 'daily');
      db.setCooldown(guildId, userId, 'daily');

      await message.reply(`🎁 Ежедневная награда: +${coins(REWARDS.daily)}!\nБаланс: ${coins(db.getCoins(guildId,userId))}`);
      break;
    }

    case 'кошелёк': case 'баланс': case 'wallet': case 'balance': case 'монеты': {
      const target = message.mentions.users.first();
      const tId    = target ? target.id : userId;
      const tName  = target ? (target.displayName || target.username) : username;
      if (target) db.ensureWallet(guildId, tId, tName);

      const wallet = db.getWallet(guildId, tId);
      if (!wallet) return message.reply(`У **${tName}** ещё нет кошелька.`);

      const history   = db.getHistory(guildId, tId, 5);
      const reasonMap = {
        work:'💼 работа', daily:'🎁 ежедневно', feed_pet:'🍖 кормёжка',
        play_with_pet:'🎾 игра', pet_cat:'🐾 поглаживание', transfer:'↔️ перевод',
        reward:'⭐ награда', revive:'💀 возрождение',
      };
      const histLines = history.map(t => {
        const sign  = t.to_id === tId ? '+' : '-';
        const color = sign === '+' ? '🟢' : '🔴';
        return `${color} ${sign}${t.amount} — ${reasonMap[t.reason] ?? t.reason}`;
      });

      const lines = [
        `## 💰 Кошелёк ${tName}`,
        `Баланс: ${coins(wallet.coins)}`,
        `Всего заработано: **${wallet.total_earned} 🪙**`,
      ];
      if (histLines.length > 0) lines.push('', '**Последние транзакции:**', ...histLines);
      lines.push('', `*Цены: корм=${PRICES.feed}🪙 · гладить=${PRICES.pet}🪙 · играть=${PRICES.play}🪙 · возродить=${PRICES.revive}🪙*`);

      await message.reply(lines.join('\n'));
      break;
    }

    case 'перевести': case 'дать': case 'transfer': case 'send': case 'give': {
      const target = message.mentions.users.first();
      if (!target) return message.reply('Укажи получателя: `!перевести @user 100`');
      if (target.bot) return message.reply('Нельзя переводить монеты ботам 🤖');

      const amount = parseInt(args[1] ?? args[0]);
      if (!amount || amount <= 0 || isNaN(amount)) return message.reply('Укажи сумму: `!перевести @user 100`');
      if (amount > 1_000_000) return message.reply('Максимальный перевод: 1 000 000 🪙');

      const toName = target.displayName || target.username;
      const result = db.transferCoins(guildId, userId, username, target.id, toName, amount);

      if (!result.ok) {
        if (result.reason === 'not_enough')
          return message.reply(`❌ Не хватает! Нужно ${coins(amount)}, у тебя ${coins(db.getCoins(guildId,userId))}.`);
        if (result.reason === 'self')
          return message.reply('😅 Нельзя переводить монеты самому себе.');
      }

      await message.reply(
        `💸 **${username}** → **${toName}**: ${coins(amount)}\n` +
        `Твой баланс: ${coins(db.getCoins(guildId,userId))}  |  Баланс ${toName}: ${coins(db.getCoins(guildId,target.id))}`
      );
      break;
    }

    case 'богатые': case 'топмонет': case 'richlist': case 'топбаланс': {
      const list = db.getRichList(guildId, 10);
      if (list.length === 0) return message.reply('Ещё никто не зарабатывал монеты! `!работать`');
      const medals = ['🥇', '🥈', '🥉'];
      const lines = list.map((w, i) =>
        `${medals[i] ?? `${i+1}.`} **${w.username}** — ${w.coins} 🪙 (всего заработано: ${w.total_earned})`
      );
      await message.reply(`## 💰 Богатейшие на сервере\n${lines.join('\n')}`);
      break;
    }

    case 'топ': case 'top': case 'лидеры': {
      const feeders = db.getTopFeeders(guildId, 10);
      if (feeders.length === 0) return message.reply('Ещё никто не ухаживал! `!покормить`');
      const medals = ['🥇', '🥈', '🥉'];
      const lines = feeders.map((f, i) =>
        `${medals[i] ?? `${i+1}.`} **${f.username}** — ${f.score} очков  (🍖${f.feed_count} · 🐾${f.pet_count} · 🎾${f.play_count})`
      );
      await message.reply(`## 👑 Лучшие смотрители **${pet.name}**\n${lines.join('\n')}`);
      break;
    }

    case 'переименовать': case 'rename': {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply('🔒 Переименовывать питомца может только администратор сервера.');
      }
      if (!args[0]) return message.reply('Укажи имя: `!переименовать Барсик`');
      const newName = args.slice(0, 3).join(' ').slice(0, 32);
      const old = pet.name;
      db.updatePet(guildId, { name: newName });
      await message.reply(`✏️ **${old}** → **${newName}**`);
      break;
    }

    case 'помощь': case 'help': case 'команды': {
      await message.reply([
        '## 🐱 Тамагочи сервера — Команды',
        '',
        '**💼 Заработок**',
        `💼 \`!работать\` — Заработать ${REWARDS.work_min}–${REWARDS.work_max} 🪙 *(кд: 1 ч)*`,
        `🎁 \`!ежедневно\` — Бонус +${REWARDS.daily} 🪙 *(раз в 24 ч)*`,
        '',
        '**🐱 Уход за питомцем**',
        `🍖 \`!покормить\` — −${PRICES.feed} 🪙 *(кд: 15 мин)*`,
        `🐾 \`!погладить\` — −${PRICES.pet} 🪙 *(кд: 10 мин)*`,
        `🎾 \`!играть\` — −${PRICES.play} 🪙 *(кд: 20 мин)*`,
        `💀 \`!возродить [имя]\` — −${PRICES.revive} 🪙 *(если умер)*`,
        '',
        '**💰 Экономика**',
        '💰 `!баланс [@user]` — Кошелёк + история транзакций',
        '💸 `!перевести @user 100` — Перевод монет',
        '📊 `!богатые` — Топ богачей',
        '',
        '**📊 Прочее**',
        '🐱 `!статус` — Карточка питомца',
        '👑 `!топ` — Лучшие смотрители',
        '✏️ `!переименовать Имя` — Переименовать',
      ].join('\n'));
      break;
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Не задан DISCORD_TOKEN в .env');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
