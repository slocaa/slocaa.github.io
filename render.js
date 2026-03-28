// ═══ RENDERING ═══

export function drawMap(ctx, map, W, H) {
  // Background
  ctx.fillStyle = map.groundColors[0];
  ctx.fillRect(0, 0, W, H);

  // Ground texture patches
  for (let i = 0; i < 40; i++) {
    const x = (i * 137.5 + 50) % W;
    const y = (i * 89.3 + 30) % H;
    ctx.fillStyle = map.groundColors[i % map.groundColors.length];
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(x, y, 20 + (i % 3) * 15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Path
  const path = map.path;
  ctx.strokeStyle = map.pathColor;
  ctx.lineWidth = 36;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  ctx.stroke();

  // Path border
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 40;
  ctx.beginPath();
  ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  ctx.stroke();

  // Redraw path on top
  ctx.strokeStyle = map.pathColor;
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  ctx.stroke();

  // Start/end markers
  ctx.fillStyle = '#4CAF50';
  ctx.beginPath();
  ctx.arc(path[0][0], path[0][1], 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('START', path[0][0], path[0][1] - 20);

  const end = path[path.length - 1];
  ctx.fillStyle = '#F44336';
  ctx.beginPath();
  ctx.arc(end[0], end[1], 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText('BASE', end[0], end[1] - 20);
}

export function drawTower(ctx, tower, stats, selected) {
  const x = tower.x, y = tower.y;

  // Range circle if selected
  if (selected) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, stats.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fill();
  }

  // Base
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(x, y + 2, 16, 0, Math.PI * 2);
  ctx.fill();

  // Tower body
  ctx.fillStyle = stats.type.color;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();

  // Inner highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(x - 3, y - 3, 6, 0, Math.PI * 2);
  ctx.fill();

  // Level pips
  for (let i = 0; i <= tower.level; i++) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - 6 + i * 6, y + 10, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Icon
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stats.type.icon, x, y - 1);
}

export function drawEnemy(ctx, enemy, t) {
  const x = enemy.x, y = enemy.y;
  const r = enemy.radius;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + r + 2, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = enemy.color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Shield visual
  if (enemy.shieldHp > 0) {
    ctx.strokeStyle = 'rgba(52,152,219,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Regen visual
  if (enemy.regenRate > 0) {
    ctx.fillStyle = 'rgba(46,204,113,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Slow visual
  if (enemy.slowTimer > 0) {
    ctx.strokeStyle = 'rgba(33,150,243,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Poison visual
  if (enemy.poisonTimer > 0) {
    ctx.fillStyle = 'rgba(156,39,176,0.4)';
    ctx.beginPath();
    ctx.arc(x + r * 0.5, y - r * 0.5, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // HP bar
  if (enemy.hp < enemy.maxHp) {
    const bw = r * 2.5;
    const bh = 3;
    const bx = x - bw / 2;
    const by = y - r - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, bh);
    const pct = enemy.hp / enemy.maxHp;
    ctx.fillStyle = pct > 0.5 ? '#4CAF50' : pct > 0.25 ? '#FF9800' : '#F44336';
    ctx.fillRect(bx, by, bw * pct, bh);
  }
}

export function drawProjectile(ctx, proj) {
  ctx.fillStyle = proj.color || '#fff';
  ctx.beginPath();
  ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

export function drawEffect(ctx, fx) {
  ctx.globalAlpha = fx.alpha;
  if (fx.type === 'explosion') {
    ctx.strokeStyle = fx.color || '#FF9800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.radius * (1 - fx.alpha), 0, Math.PI * 2);
    ctx.stroke();
  } else if (fx.type === 'hit') {
    ctx.fillStyle = fx.color || '#fff';
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, 5 * fx.alpha, 0, Math.PI * 2);
    ctx.fill();
  } else if (fx.type === 'text') {
    ctx.fillStyle = fx.color || '#ffd700';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fx.text, fx.x, fx.y - (1 - fx.alpha) * 20);
  }
  ctx.globalAlpha = 1;
}
