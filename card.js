const { createCanvas, registerFont } = require('canvas');

// Регистрируем системные шрифты — без этого canvas рисует квадратики
const FONTS_DIR = '/usr/share/fonts/truetype/dejavu';
try {
  registerFont(`${FONTS_DIR}/DejaVuSans.ttf`,      { family: 'UI', weight: 'normal', style: 'normal' });
  registerFont(`${FONTS_DIR}/DejaVuSans-Bold.ttf`, { family: 'UI', weight: 'bold',   style: 'normal' });
} catch (e) {
  // Если шрифты не найдены (например, в продакшне) — продолжаем без регистрации
  console.warn('Шрифты не найдены, текст может отображаться некорректно:', e.message);
}
const { getMood, getMoodText, formatAge, xpToNext } = require('./engine');

// ─── Палитра ──────────────────────────────────────────────────────────────────
const C = {
  bg0:      '#0a0a14',
  bg1:      '#12121f',
  surface:  '#1c1c2e',
  surface2: '#26263a',
  border:   '#2e2e50',
  accent:   '#7c3aed',
  accentDim:'rgba(124,58,237,0.15)',

  text:     '#e8e8f4',
  textDim:  '#6b6b8a',
  textMid:  '#9999cc',

  green:    '#4ade80',
  yellow:   '#fbbf24',
  red:      '#f87171',
  pink:     '#f472b6',
  purple:   '#a78bfa',

  catFur:      '#e8c07a',
  catFurHappy: '#f4a261',
  catFurSad:   '#8888aa',
  catFurSick:  '#b8d4a0',
  catFurDead:  '#55556a',
  catEarInner: '#e88eb4',
  catNose:     '#e88eb4',
  catEye:      '#1a1a2e',
  catWhisker:  'rgba(220,220,240,0.55)',
};

// ─── Утилиты ──────────────────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function barColor(value) {
  if (value > 60) return C.green;
  if (value > 30) return C.yellow;
  return C.red;
}

// ─── Рисование котика ─────────────────────────────────────────────────────────
function drawCat(ctx, cx, cy, s, mood) {
  const furColor = {
    happy:   C.catFurHappy,
    sad:     C.catFurSad,
    sick:    C.catFurSick,
    dead:    C.catFurDead,
    hungry:  C.catFur,
    neutral: C.catFur,
  }[mood] ?? C.catFur;

  // Тень
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.52, s * 0.38, s * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Тело
  ctx.fillStyle = furColor;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
  ctx.fill();

  // Уши (левое, правое)
  const ears = [
    [cx - s*0.26, cy - s*0.33, cx - s*0.43, cy - s*0.64, cx - s*0.08, cy - s*0.42],
    [cx + s*0.26, cy - s*0.33, cx + s*0.43, cy - s*0.64, cx + s*0.08, cy - s*0.42],
  ];
  for (const [ax,ay,bx,by,cx2,cy2] of ears) {
    ctx.fillStyle = furColor;
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx2,cy2); ctx.closePath(); ctx.fill();
  }

  // Внутренность ушей
  const innerEars = [
    [cx - s*0.27, cy - s*0.36, cx - s*0.38, cy - s*0.57, cx - s*0.13, cy - s*0.44],
    [cx + s*0.27, cy - s*0.36, cx + s*0.38, cy - s*0.57, cx + s*0.13, cy - s*0.44],
  ];
  ctx.fillStyle = C.catEarInner;
  for (const [ax,ay,bx,by,cx2,cy2] of innerEars) {
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx2,cy2); ctx.closePath(); ctx.fill();
  }

  // Глаза
  const eyeL = [cx - s*0.14, cy - s*0.05];
  const eyeR = [cx + s*0.14, cy - s*0.05];

  if (mood === 'dead') {
    // X-глаза
    ctx.save();
    ctx.strokeStyle = C.catEye;
    ctx.lineWidth = s * 0.045;
    ctx.lineCap = 'round';
    for (const [ex, ey] of [eyeL, eyeR]) {
      const r = s * 0.07;
      ctx.beginPath(); ctx.moveTo(ex-r, ey-r); ctx.lineTo(ex+r, ey+r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex+r, ey-r); ctx.lineTo(ex-r, ey+r); ctx.stroke();
    }
    ctx.restore();
  } else if (mood === 'happy') {
    // Закрытые ^-глаза (дуги)
    ctx.save();
    ctx.strokeStyle = C.catEye;
    ctx.lineWidth = s * 0.055;
    ctx.lineCap = 'round';
    for (const [ex, ey] of [eyeL, eyeR]) {
      ctx.beginPath();
      ctx.arc(ex, ey + s*0.02, s*0.09, Math.PI, 0);
      ctx.stroke();
    }
    ctx.restore();
  } else if (mood === 'sad') {
    // Грустные опущенные глаза
    ctx.fillStyle = C.catEye;
    ctx.beginPath(); ctx.ellipse(eyeL[0], eyeL[1], s*0.07, s*0.09, -0.25, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eyeR[0], eyeR[1], s*0.07, s*0.09,  0.25, 0, Math.PI*2); ctx.fill();
    // Блики
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(eyeL[0]+s*0.03, eyeL[1]-s*0.03, s*0.023, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeR[0]+s*0.03, eyeR[1]-s*0.03, s*0.023, 0, Math.PI*2); ctx.fill();
  } else {
    // Нормальные глаза
    ctx.fillStyle = C.catEye;
    ctx.beginPath(); ctx.ellipse(eyeL[0], eyeL[1], s*0.078, s*0.105, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eyeR[0], eyeR[1], s*0.078, s*0.105, 0, 0, Math.PI*2); ctx.fill();
    // Зрачки
    ctx.fillStyle = '#0e0e1e';
    ctx.beginPath(); ctx.ellipse(eyeL[0], eyeL[1], s*0.038, s*0.085, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eyeR[0], eyeR[1], s*0.038, s*0.085, 0, 0, Math.PI*2); ctx.fill();
    // Блики
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(eyeL[0]+s*0.03, eyeL[1]-s*0.04, s*0.024, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeR[0]+s*0.03, eyeR[1]-s*0.04, s*0.024, 0, Math.PI*2); ctx.fill();
  }

  // Нос
  ctx.fillStyle = C.catNose;
  ctx.beginPath();
  ctx.moveTo(cx,            cy + s*0.06);
  ctx.lineTo(cx - s*0.04,  cy + s*0.02);
  ctx.lineTo(cx + s*0.04,  cy + s*0.02);
  ctx.closePath();
  ctx.fill();

  // Рот
  ctx.save();
  ctx.strokeStyle = 'rgba(80,40,40,0.8)';
  ctx.lineWidth = s * 0.025;
  ctx.lineCap = 'round';

  if (mood === 'happy') {
    // Широкая улыбка
    ctx.beginPath(); ctx.arc(cx - s*0.08, cy + s*0.17, s*0.08,  0,     Math.PI * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + s*0.08, cy + s*0.17, s*0.08,  Math.PI*0.1, Math.PI); ctx.stroke();
  } else if (mood === 'sad' || mood === 'hungry' || mood === 'sick') {
    // Грустный рот
    ctx.beginPath(); ctx.arc(cx, cy + s*0.28, s*0.1, Math.PI*1.1, -0.1); ctx.stroke();
  } else if (mood === 'dead') {
    ctx.beginPath(); ctx.moveTo(cx - s*0.1, cy + s*0.17); ctx.lineTo(cx + s*0.1, cy + s*0.17); ctx.stroke();
  } else {
    // Нейтральный W-рот
    ctx.beginPath(); ctx.arc(cx - s*0.07, cy + s*0.14, s*0.05, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + s*0.07, cy + s*0.14, s*0.05, 0, Math.PI); ctx.stroke();
  }
  ctx.restore();

  // Усы
  ctx.save();
  ctx.strokeStyle = C.catWhisker;
  ctx.lineWidth = 1.4;
  const wy = cy + s * 0.07;
  // Левые
  ctx.beginPath(); ctx.moveTo(cx - s*0.52, wy - s*0.06); ctx.lineTo(cx - s*0.09, wy);       ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - s*0.52, wy + s*0.05); ctx.lineTo(cx - s*0.09, wy + s*0.04); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - s*0.50, wy + s*0.16); ctx.lineTo(cx - s*0.09, wy + s*0.09); ctx.stroke();
  // Правые
  ctx.beginPath(); ctx.moveTo(cx + s*0.52, wy - s*0.06); ctx.lineTo(cx + s*0.09, wy);       ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + s*0.52, wy + s*0.05); ctx.lineTo(cx + s*0.09, wy + s*0.04); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + s*0.50, wy + s*0.16); ctx.lineTo(cx + s*0.09, wy + s*0.09); ctx.stroke();
  ctx.restore();

  // Пятнышко (для cute)
  if (mood !== 'dead') {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = C.catEarInner;
    ctx.beginPath(); ctx.arc(cx + s*0.22, cy + s*0.15, s*0.12, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ─── Полоска характеристик ────────────────────────────────────────────────────
function drawStatBar(ctx, x, y, label, value) {
  const BAR_W = 270;
  const BAR_H = 22;
  const pct = Math.max(0, Math.min(1, value / 100));
  const color = barColor(value);

  // Лейбл + значение
  ctx.font = '500 13px "UI"';
  ctx.fillStyle = C.textDim;
  ctx.fillText(label, x, y - 7);

  ctx.font = 'bold 13px "UI"';
  ctx.fillStyle = C.text;
  ctx.fillText(`${value}`, x + BAR_W + 10, y + 14);

  // Фон бара
  ctx.fillStyle = C.surface2;
  rrect(ctx, x, y, BAR_W, BAR_H, 7);
  ctx.fill();

  // Заполнение
  if (pct > 0) {
    const fillW = Math.max(BAR_H, pct * BAR_W); // минимальная ширина = радиус*2
    const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
    grad.addColorStop(0, color + 'bb');
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    rrect(ctx, x, y, fillW, BAR_H, 7);
    ctx.fill();

    // Блик
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#fff';
    rrect(ctx, x, y, fillW, BAR_H / 2, 7);
    ctx.fill();
    ctx.restore();
  }

  // Обводка
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  rrect(ctx, x, y, BAR_W, BAR_H, 7);
  ctx.stroke();
}

// ─── Основная функция рендера ──────────────────────────────────────────────────
async function renderPetCard(pet, topFeeders) {
  const W = 660, H = 330;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const mood = getMood(pet);
  const moodText = getMoodText(mood);

  // ── Фон ──────────────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, C.bg0);
  bgGrad.addColorStop(1, C.bg1);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Декоративные круги на фоне
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = C.accent;
  ctx.beginPath(); ctx.arc(110, 155, 145, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 0.03;
  ctx.beginPath(); ctx.arc(580, 60, 120, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(580, 310, 80, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // ── Внешняя рамка ────────────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = 'rgba(124,58,237,0.35)';
  ctx.lineWidth = 1.5;
  rrect(ctx, 6, 6, W-12, H-12, 18);
  ctx.stroke();
  ctx.restore();

  // ── Разделитель лево/право ───────────────────────────────────────────────────
  const divX = 240;
  const linearDiv = ctx.createLinearGradient(0, 20, 0, H - 20);
  linearDiv.addColorStop(0,   'rgba(124,58,237,0)');
  linearDiv.addColorStop(0.3, 'rgba(124,58,237,0.3)');
  linearDiv.addColorStop(0.7, 'rgba(124,58,237,0.3)');
  linearDiv.addColorStop(1,   'rgba(124,58,237,0)');
  ctx.fillStyle = linearDiv;
  ctx.fillRect(divX, 20, 1, H - 40);

  // ════════════════════════════════════════════════════════════════════
  // ЛЕВАЯ ЧАСТЬ — котик
  // ════════════════════════════════════════════════════════════════════
  drawCat(ctx, 118, 148, 100, mood);

  // Настроение (подпись под котом)
  const moodColor = {
    happy:   C.green,
    sad:     '#aaa8cc',
    hungry:  C.red,
    sick:    C.yellow,
    dead:    C.textDim,
    neutral: C.textMid,
  }[mood] ?? C.textMid;

  ctx.font = 'bold 14px "UI"';
  ctx.fillStyle = moodColor;
  ctx.textAlign = 'center';
  ctx.fillText(moodText, 118, H - 42);

  // Восклицательный пузырёк если критически голоден
  if (pet.hunger < 15 && !pet.is_dead) {
    ctx.save();
    ctx.fillStyle = C.red;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    // Пузырёк
    ctx.beginPath();
    rrect(ctx, 155, 65, 55, 24, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('Голоден!', 182, 81);
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════════════
  // ПРАВАЯ ЧАСТЬ — информация
  // ════════════════════════════════════════════════════════════════════
  ctx.textAlign = 'left';
  const rx = divX + 20;

  // Имя питомца
  ctx.font = 'bold 24px "UI"';
  ctx.fillStyle = C.text;
  ctx.fillText(pet.name, rx, 50);

  // Значок уровня
  const nameW = ctx.measureText(pet.name).width;
  const badgeX = rx + nameW + 14;
  ctx.fillStyle = C.accentDim;
  rrect(ctx, badgeX, 30, 70, 26, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(124,58,237,0.5)';
  ctx.lineWidth = 1;
  rrect(ctx, badgeX, 30, 70, 26, 7);
  ctx.stroke();
  ctx.font = 'bold 12px "UI"';
  ctx.fillStyle = C.purple;
  ctx.fillText(`Ур. ${pet.level}`, badgeX + 12, 48);

  // Возраст
  ctx.font = '13px "UI"';
  ctx.fillStyle = C.textDim;
  ctx.fillText(`Возраст: ${formatAge(pet.age_ticks)}`, rx, 75);

  // XP бар (маленький)
  const xpPct = pet.xp / 100;
  const xpW = 200;
  ctx.fillStyle = C.surface2;
  rrect(ctx, rx, 84, xpW, 6, 3);
  ctx.fill();
  if (xpPct > 0) {
    ctx.fillStyle = C.purple;
    rrect(ctx, rx, 84, xpW * xpPct, 6, 3);
    ctx.fill();
  }
  ctx.font = '11px "UI"';
  ctx.fillStyle = C.textDim;
  ctx.fillText(`XP: ${pet.xp}/100`, rx + xpW + 8, 92);

  // ── Характеристики ───────────────────────────────────────────────────────────
  const statY = 118;
  const statGap = 62;
  drawStatBar(ctx, rx, statY,           'Сытость',    pet.hunger);
  drawStatBar(ctx, rx, statY + statGap, 'Настроение', pet.happiness);
  drawStatBar(ctx, rx, statY + statGap*2, 'Здоровье', pet.health);

  // ── Нижняя полоска — топ кормильцев ─────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  rrect(ctx, 14, H - 36, W - 28, 28, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  rrect(ctx, 14, H - 36, W - 28, 28, 8);
  ctx.stroke();

  ctx.font = '12px "UI"';
  ctx.fillStyle = C.textDim;
  ctx.textAlign = 'left';
  ctx.fillText('Топ:', 26, H - 17);

  if (topFeeders.length === 0) {
    ctx.fillStyle = C.textDim;
    ctx.fillText('ещё никто не ухаживал...', 70, H - 17);
  } else {
    const medals = ['#fbbf24', '#9ca3af', '#d97706'];
    let fx = 70;
    topFeeders.forEach((f, i) => {
      const label = `${f.username} (${f.score})`;
      ctx.fillStyle = medals[i] ?? C.textMid;
      ctx.font = i === 0 ? 'bold 12px "UI"' : '12px "UI"';
      ctx.fillText(label, fx, H - 17);
      fx += ctx.measureText(label).width + 18;
      if (i < topFeeders.length - 1 && fx < W - 60) {
        ctx.fillStyle = C.border;
        ctx.fillText('·', fx - 10, H - 17);
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // ОВЕРЛЕЙ СМЕРТИ
  // ════════════════════════════════════════════════════════════════════
  if (pet.is_dead) {
    ctx.save();
    ctx.fillStyle = 'rgba(5,5,10,0.75)';
    ctx.fillRect(0, 0, W, H);

    // Рамка смерти
    ctx.strokeStyle = 'rgba(248,113,113,0.4)';
    ctx.lineWidth = 2;
    rrect(ctx, 6, 6, W-12, H-12, 18);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 30px "UI"';
    ctx.fillStyle = C.red;
    ctx.fillText('ПИТОМЕЦ УМЕР', W/2, H/2 - 12);

    ctx.font = '15px "UI"';
    ctx.fillStyle = C.textDim;
    ctx.fillText('!возродить [имя] — чтобы завести нового', W/2, H/2 + 20);
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

module.exports = { renderPetCard };
