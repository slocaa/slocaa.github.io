// ═══ POLISHED RENDERING ═══

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

export function drawMap(ctx, map, W, H) {
  // Clean gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, map.groundColors[0]);
  bgGrad.addColorStop(1, map.groundColors[1]);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid pattern for depth (clean, not grainy)
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  const path = map.path;

  // Path shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 46; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(path[0][0], path[0][1]+4);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]+4);
  ctx.stroke();

  // Path border
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 42;
  ctx.beginPath(); ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  ctx.stroke();

  // Path fill
  ctx.strokeStyle = map.pathColor; ctx.lineWidth = 36;
  ctx.beginPath(); ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  ctx.stroke();

  // Path inner highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  ctx.stroke();

  // Dashed center line
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  ctx.setLineDash([8, 14]);
  ctx.beginPath(); ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
  ctx.stroke(); ctx.setLineDash([]);

  // Start marker
  ctx.fillStyle = '#43a047';
  ctx.beginPath(); ctx.arc(path[0][0], path[0][1], 16, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(path[0][0], path[0][1], 16, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px Nunito'; ctx.textAlign = 'center';
  ctx.fillText('START', path[0][0], path[0][1]+3);

  // End marker
  const end = path[path.length-1];
  ctx.fillStyle = '#e53935';
  ctx.beginPath(); ctx.arc(end[0], end[1], 16, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(end[0], end[1], 16, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillText('BASE', end[0], end[1]+3);
}

export function drawTower(ctx, tower, stats, selected, hovered) {
  const x = tower.x, y = tower.y;

  // Range circle
  if (selected || hovered) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, stats.range);
    grad.addColorStop(0, 'rgba(255,255,255,0.02)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, stats.range, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = selected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, stats.range, 0, Math.PI*2); ctx.stroke();
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y+14, 12, 5, 0, 0, Math.PI*2); ctx.fill();

  // Base platform
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI*2); ctx.fill();

  // Tower body
  const bodyGrad = ctx.createRadialGradient(x-4, y-4, 2, x, y, 16);
  bodyGrad.addColorStop(0, lighten(stats.type.color, 40));
  bodyGrad.addColorStop(1, stats.type.color);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI*2); ctx.fill();

  // Outline
  ctx.strokeStyle = selected ? '#fff' : 'rgba(0,0,0,0.3)';
  ctx.lineWidth = selected ? 2 : 1;
  ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI*2); ctx.stroke();

  // Icon
  ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(stats.type.icon, x, y);
  ctx.textBaseline = 'alphabetic';

  // Level stars
  for (let i = 0; i <= tower.level; i++) {
    ctx.fillStyle = '#ffd700';
    ctx.font = '7px sans-serif';
    ctx.fillText('★', x - 5 + i*5, y + 12);
  }
}

function lighten(hex, amt) {
  let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.min(255, r+amt); g = Math.min(255, g+amt); b = Math.min(255, b+amt);
  return '#'+[r,g,b].map(c=>c.toString(16).padStart(2,'0')).join('');
}

export function drawEnemy(ctx, enemy) {
  const x = enemy.x, y = enemy.y, r = enemy.radius;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x, y+r+2, r*0.7, r*0.25, 0, 0, Math.PI*2); ctx.fill();

  // Body with gradient
  const grad = ctx.createRadialGradient(x-r*0.3, y-r*0.3, 1, x, y, r);
  grad.addColorStop(0, lighten(enemy.color, 50));
  grad.addColorStop(1, enemy.color);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();

  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke();

  // Shield ring
  if (enemy.shieldHp > 0) {
    ctx.strokeStyle = 'rgba(52,152,219,0.8)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r+3, 0, Math.PI*2); ctx.stroke();
  }

  // Regen sparkle
  if (enemy.regenRate > 0) {
    ctx.fillStyle = 'rgba(46,204,113,0.6)';
    ctx.beginPath(); ctx.arc(x+r*0.4, y-r*0.4, 2.5, 0, Math.PI*2); ctx.fill();
  }

  // Slow indicator
  if (enemy.slowTimer > 0) {
    ctx.strokeStyle = 'rgba(33,150,243,0.5)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([2,2]);
    ctx.beginPath(); ctx.arc(x, y, r+2, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Poison indicator
  if (enemy.poisonTimer > 0) {
    ctx.fillStyle = 'rgba(156,39,176,0.5)';
    ctx.beginPath(); ctx.arc(x-r*0.4, y-r*0.4, 2.5, 0, Math.PI*2); ctx.fill();
  }

  // HP bar
  if (enemy.hp < enemy.maxHp) {
    const bw = Math.max(r*2.5, 16), bh = 3;
    const bx = x-bw/2, by = y-r-7;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, bx-0.5, by-0.5, bw+1, bh+1, 2); ctx.fill();
    const pct = Math.max(0, enemy.hp/enemy.maxHp);
    const hpColor = pct > 0.6 ? '#4CAF50' : pct > 0.3 ? '#FF9800' : '#F44336';
    ctx.fillStyle = hpColor;
    roundRect(ctx, bx, by, bw*pct, bh, 1.5); ctx.fill();
  }
}

export function drawProjectile(ctx, proj) {
  // Trail
  ctx.fillStyle = proj.color || '#fff';
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(proj.x, proj.y, 5, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  // Core
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(proj.x, proj.y, 2.5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = proj.color || '#fff';
  ctx.beginPath(); ctx.arc(proj.x, proj.y, 2, 0, Math.PI*2); ctx.fill();
}

export function drawEffect(ctx, fx) {
  ctx.globalAlpha = Math.max(0, fx.alpha);
  if (fx.type === 'explosion') {
    const progress = 1 - fx.alpha;
    ctx.strokeStyle = fx.color || '#FF9800'; ctx.lineWidth = 2*(1-progress);
    ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius*progress, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = fx.color || '#FF9800'; ctx.globalAlpha *= 0.15;
    ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius*progress, 0, Math.PI*2); ctx.fill();
  } else if (fx.type === 'hit') {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(fx.x, fx.y, 4*fx.alpha, 0, Math.PI*2); ctx.fill();
  } else if (fx.type === 'text') {
    ctx.fillStyle = fx.color || '#ffd700';
    ctx.font = 'bold 11px Nunito'; ctx.textAlign = 'center';
    ctx.fillText(fx.text, fx.x, fx.y - (1-fx.alpha)*25);
  }
  ctx.globalAlpha = 1;
}
