import { MAPS, pathLength, posOnPath } from './maps.js';
import { TOWER_TYPES, getTowerStats, getUpgradeCost } from './towers.js';
import { ENEMY_TYPES, generateWaves } from './enemies.js';
import { drawMap, drawTower, drawEnemy, drawProjectile, drawEffect } from './render.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = 960, H = 640;
canvas.width = W;
canvas.height = H;

// ═══ GAME STATE ═══
let state = 'menu'; // menu, playing, gameover, victory
let currentMap = null;
let mapIndex = 0;
let money = 0;
let lives = 0;
let wave = 0;
let waveActive = false;
let waveTimer = 0;
let spawnQueue = [];
let enemies = [];
let towers = [];
let projectiles = [];
let effects = [];
let selectedTower = null;
let placingType = null;
let mouseX = 0, mouseY = 0;
let waves = [];
let totalPathLen = 0;
let gameSpeed = 1;
let score = 0;

// ═══ MENU ═══
function drawMenu() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TOWER DEFENSE', W/2, 100);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('Select a map to begin', W/2, 135);

  MAPS.forEach((map, i) => {
    const x = 120 + i * 260;
    const y = 180;
    const w = 220, h = 280;

    // Card
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = mapIndex === i ? '#fff' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = mapIndex === i ? 2 : 1;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();

    // Map preview
    ctx.fillStyle = map.groundColors[0];
    roundRect(ctx, x + 10, y + 10, w - 20, 120, 8);
    ctx.fill();

    // Mini path
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x + 10, y + 10, w - 20, 120, 8);
    ctx.clip();
    ctx.strokeStyle = map.pathColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const sx = (w - 20) / W, sy = 120 / H;
    ctx.moveTo(x + 10 + map.path[0][0] * sx, y + 10 + map.path[0][1] * sy);
    for (let j = 1; j < map.path.length; j++) {
      ctx.lineTo(x + 10 + map.path[j][0] * sx, y + 10 + map.path[j][1] * sy);
    }
    ctx.stroke();
    ctx.restore();

    // Info
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(map.name, x + w/2, y + 155);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Difficulty: ' + '★'.repeat(Math.ceil(map.difficulty * 2)), x + w/2, y + 178);
    ctx.fillText('Lives: ' + map.lives, x + w/2, y + 198);
    ctx.fillText('Start $' + map.startMoney, x + w/2, y + 218);

    // Play button
    ctx.fillStyle = mapIndex === i ? '#4CAF50' : 'rgba(255,255,255,0.1)';
    roundRect(ctx, x + 40, y + 235, w - 80, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('PLAY', x + w/2, y + 255);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ═══ START GAME ═══
function startGame(mi) {
  mapIndex = mi;
  currentMap = MAPS[mi];
  money = currentMap.startMoney;
  lives = currentMap.lives;
  wave = 0;
  waveActive = false;
  enemies = [];
  towers = [];
  projectiles = [];
  effects = [];
  selectedTower = null;
  placingType = null;
  spawnQueue = [];
  waves = generateWaves(currentMap.difficulty);
  totalPathLen = pathLength(currentMap.path);
  state = 'playing';
  score = 0;
  gameSpeed = 1;
}

// ═══ SPAWN WAVE ═══
function startWave() {
  if (wave >= waves.length) { state = 'victory'; return; }
  const w = waves[wave];
  spawnQueue = [];
  let delay = 0;
  for (const group of w.groups) {
    for (let i = 0; i < group.count; i++) {
      spawnQueue.push({ type: group.type, time: delay, hpMult: w.hpMult });
      delay += group.delay;
    }
  }
  waveTimer = 0;
  waveActive = true;
}

function spawnEnemy(type, hpMult) {
  const def = ENEMY_TYPES[type];
  enemies.push({
    type, x: 0, y: 0, dist: 0,
    hp: def.hp * hpMult, maxHp: def.hp * hpMult,
    speed: def.speed, baseSpeed: def.speed,
    reward: def.reward, color: def.color, radius: def.radius,
    shieldHp: def.shield ? def.shield * hpMult : 0,
    regenRate: def.regen || 0,
    slowTimer: 0, slowAmount: 0,
    poisonTimer: 0, poisonDmg: 0,
    alive: true
  });
}

// ═══ TOWER PLACEMENT ═══
function canPlace(x, y) {
  // Not on path
  for (let i = 1; i < currentMap.path.length; i++) {
    const ax = currentMap.path[i-1][0], ay = currentMap.path[i-1][1];
    const bx = currentMap.path[i][0], by = currentMap.path[i][1];
    const dist = distToSegment(x, y, ax, ay, bx, by);
    if (dist < 30) return false;
  }
  // Not on other towers
  for (const t of towers) {
    const dx = t.x - x, dy = t.y - y;
    if (dx*dx + dy*dy < 30*30) return false;
  }
  // In bounds
  if (x < 20 || x > W - 20 || y < 20 || y > H - 20) return false;
  return true;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx*dx + dy*dy;
  let t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2));
  const cx = ax + t*dx, cy = ay + t*dy;
  return Math.sqrt((px-cx)*(px-cx) + (py-cy)*(py-cy));
}

function placeTower(typeId, x, y) {
  const stats = getTowerStats(typeId, 0);
  if (money < stats.cost) return false;
  if (!canPlace(x, y)) return false;
  money -= stats.cost;
  towers.push({ typeId, x, y, level: 0, cooldown: 0 });
  effects.push({ type:'text', x, y: y-20, text:'Placed!', color:'#4CAF50', alpha:1 });
  return true;
}

// ═══ COMBAT LOGIC ═══
function updateTowers(dt) {
  for (const tower of towers) {
    const stats = getTowerStats(tower.typeId, tower.level);
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;

    // Find target(s)
    let targets = enemies.filter(e => {
      if (!e.alive) return false;
      const dx = e.x - tower.x, dy = e.y - tower.y;
      return dx*dx + dy*dy <= stats.range * stats.range;
    }).sort((a, b) => b.dist - a.dist); // prioritize furthest along path

    if (targets.length === 0) continue;

    tower.cooldown = 1 / stats.fireRate;

    // How many targets to hit
    let hitCount = 1;
    if (stats.special === 'multishot') hitCount = 2;
    if (stats.special === 'chain') hitCount = stats.chainCount || 3;

    for (let i = 0; i < Math.min(hitCount, targets.length); i++) {
      const target = targets[i];
      projectiles.push({
        x: tower.x, y: tower.y,
        tx: target.x, ty: target.y,
        target: target,
        speed: 300,
        damage: stats.damage,
        color: stats.type.color,
        special: stats.special,
        splashRadius: stats.splashRadius || 0,
        slowAmount: stats.slowAmount || 0,
        slowDuration: stats.slowDuration || 0,
        poisonDmg: stats.poisonDmg || 0,
        poisonDur: stats.poisonDur || 0
      });
    }
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    // Move toward target
    if (p.target && p.target.alive) {
      p.tx = p.target.x;
      p.ty = p.target.y;
    }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 8) {
      // Hit!
      applyHit(p);
      projectiles.splice(i, 1);
      continue;
    }
    const spd = p.speed * dt;
    p.x += (dx/dist) * spd;
    p.y += (dy/dist) * spd;

    // Remove if off screen
    if (p.x < -50 || p.x > W+50 || p.y < -50 || p.y > H+50) {
      projectiles.splice(i, 1);
    }
  }
}

function applyHit(proj) {
  effects.push({ type:'hit', x:proj.tx, y:proj.ty, color:proj.color, alpha:1 });

  if (proj.special === 'splash' || proj.special === 'explosive') {
    // AoE damage
    const r = proj.splashRadius || 40;
    effects.push({ type:'explosion', x:proj.tx, y:proj.ty, radius:r, color:proj.color, alpha:1 });
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x - proj.tx, dy = e.y - proj.ty;
      if (dx*dx + dy*dy <= r*r) {
        damageEnemy(e, proj.damage * 0.6);
      }
    }
  }

  if (proj.target && proj.target.alive) {
    damageEnemy(proj.target, proj.damage);

    // Slow
    if (proj.special === 'slow' || proj.special === 'freeze') {
      proj.target.slowTimer = proj.slowDuration;
      proj.target.slowAmount = proj.slowAmount;
      if (proj.special === 'freeze') {
        proj.target.slowTimer = 0.8; // brief full stop
        proj.target.slowAmount = 1.0;
      }
    }

    // Poison
    if (proj.special === 'poison' || proj.special === 'chain') {
      proj.target.poisonTimer = proj.poisonDur;
      proj.target.poisonDmg = proj.poisonDmg;
    }
  }
}

function damageEnemy(enemy, dmg) {
  if (enemy.shieldHp > 0) {
    const absorbed = Math.min(enemy.shieldHp, dmg);
    enemy.shieldHp -= absorbed;
    dmg -= absorbed;
  }
  enemy.hp -= dmg;
  if (enemy.hp <= 0) {
    enemy.alive = false;
    money += enemy.reward;
    score += enemy.reward;
    effects.push({ type:'text', x:enemy.x, y:enemy.y-10, text:'+$'+enemy.reward, color:'#ffd700', alpha:1 });
  }
}

// ═══ UPDATE ═══
function update(dt) {
  dt *= gameSpeed;

  // Spawn queue
  if (waveActive && spawnQueue.length > 0) {
    waveTimer += dt;
    while (spawnQueue.length > 0 && spawnQueue[0].time <= waveTimer) {
      const s = spawnQueue.shift();
      spawnEnemy(s.type, s.hpMult);
    }
  }

  // Check wave complete
  if (waveActive && spawnQueue.length === 0 && enemies.every(e => !e.alive)) {
    waveActive = false;
    wave++;
    if (wave >= waves.length) state = 'victory';
  }

  // Move enemies
  for (const e of enemies) {
    if (!e.alive) continue;

    // Slow
    let speedMult = 1;
    if (e.slowTimer > 0) {
      speedMult = 1 - e.slowAmount;
      e.slowTimer -= dt;
    }

    // Poison
    if (e.poisonTimer > 0) {
      e.hp -= e.poisonDmg * dt;
      e.poisonTimer -= dt;
      if (e.hp <= 0) {
        e.alive = false;
        money += e.reward;
        score += e.reward;
        effects.push({ type:'text', x:e.x, y:e.y-10, text:'+$'+e.reward, color:'#9C27B0', alpha:1 });
      }
    }

    // Regen
    if (e.regenRate > 0 && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.regenRate * dt);
    }

    e.dist += e.baseSpeed * speedMult * dt;
    const pos = posOnPath(currentMap.path, e.dist);
    e.x = pos.x;
    e.y = pos.y;

    // Reached end
    if (e.dist >= totalPathLen) {
      e.alive = false;
      lives--;
      effects.push({ type:'text', x:e.x, y:e.y, text:'-1 ❤️', color:'#F44336', alpha:1 });
      if (lives <= 0) state = 'gameover';
    }
  }

  // Clean dead enemies
  enemies = enemies.filter(e => e.alive || e.hp > 0);

  updateTowers(dt);
  updateProjectiles(dt);

  // Effects
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].alpha -= dt * 1.5;
    if (effects[i].alpha <= 0) effects.splice(i, 1);
  }
}

// ═══ DRAW HUD ═══
function drawHUD() {
  // Top bar
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, 36);

  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('$' + money, 12, 24);

  ctx.fillStyle = '#F44336';
  ctx.fillText('❤️ ' + lives, 110, 24);

  ctx.fillStyle = '#fff';
  ctx.fillText('Wave ' + (wave + 1) + '/' + waves.length, 200, 24);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Score: ' + score, 340, 24);

  // Speed button
  ctx.fillStyle = gameSpeed === 2 ? '#FF9800' : 'rgba(255,255,255,0.15)';
  roundRect(ctx, W - 80, 6, 30, 24, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(gameSpeed + 'x', W - 65, 22);

  // Next wave button (if not active)
  if (!waveActive && state === 'playing') {
    ctx.fillStyle = '#4CAF50';
    roundRect(ctx, W - 160, 6, 70, 24, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('NEXT WAVE', W - 125, 22);
  }

  // Tower shop — bottom bar
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, H - 60, W, 60);

  TOWER_TYPES.forEach((t, i) => {
    const x = 20 + i * 100;
    const y = H - 50;
    const stats = t.levels[0];
    const canAfford = money >= stats.cost;

    ctx.fillStyle = placingType === t.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = canAfford ? t.color : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = placingType === t.id ? 2 : 1;
    roundRect(ctx, x, y, 90, 44, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t.icon, x + 6, y + 20);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = canAfford ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.fillText(t.name, x + 26, y + 17);

    ctx.fillStyle = canAfford ? '#ffd700' : 'rgba(255,255,255,0.2)';
    ctx.font = '10px sans-serif';
    ctx.fillText('$' + stats.cost, x + 26, y + 32);
  });

  // Selected tower info
  if (selectedTower !== null) {
    const t = towers[selectedTower];
    const stats = getTowerStats(t.typeId, t.level);
    const upgCost = getUpgradeCost(t.typeId, t.level);

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, W - 200, 50, 190, upgCost ? 130 : 100, 8);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(stats.type.icon + ' ' + stats.type.name + ' Lv.' + (t.level + 1), W - 188, 72);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('DMG: ' + stats.damage + '  RNG: ' + stats.range, W - 188, 92);
    ctx.fillText('SPD: ' + stats.fireRate.toFixed(1) + '/s', W - 188, 108);
    if (stats.special) ctx.fillText('Special: ' + stats.special, W - 188, 124);

    if (upgCost) {
      ctx.fillStyle = money >= upgCost ? '#4CAF50' : 'rgba(255,255,255,0.15)';
      roundRect(ctx, W - 188, 135, 80, 24, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('UPGRADE $' + upgCost, W - 148, 151);

      ctx.fillStyle = '#F44336';
      roundRect(ctx, W - 98, 135, 50, 24, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('SELL', W - 73, 151);
    }
  }

  // Placement preview
  if (placingType) {
    const stats = getTowerStats(placingType, 0);
    const ok = canPlace(mouseX, mouseY) && mouseY > 36 && mouseY < H - 60;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = ok ? '#4CAF50' : '#F44336';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, stats.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ok ? stats.type.color : '#F44336';
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ═══ DRAW ═══
function draw() {
  ctx.clearRect(0, 0, W, H);

  if (state === 'menu') { drawMenu(); return; }

  drawMap(ctx, currentMap, W, H);

  // Towers
  towers.forEach((t, i) => {
    const stats = getTowerStats(t.typeId, t.level);
    drawTower(ctx, t, stats, selectedTower === i);
  });

  // Enemies
  const t = performance.now() / 1000;
  for (const e of enemies) {
    if (e.alive) drawEnemy(ctx, e, t);
  }

  // Projectiles
  for (const p of projectiles) drawProjectile(ctx, p);

  // Effects
  for (const fx of effects) drawEffect(ctx, fx);

  drawHUD();

  // Game over / victory overlay
  if (state === 'gameover' || state === 'victory') {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state === 'victory' ? 'VICTORY!' : 'GAME OVER', W/2, H/2 - 30);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Score: ' + score + '  Waves: ' + wave + '/' + waves.length, W/2, H/2 + 10);
    ctx.fillStyle = '#4CAF50';
    roundRect(ctx, W/2 - 60, H/2 + 30, 120, 36, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('MENU', W/2, H/2 + 53);
  }
}

// ═══ INPUT ═══
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = W / rect.width, sy = H / rect.height;
  mouseX = (e.clientX - rect.left) * sx;
  mouseY = (e.clientY - rect.top) * sy;
});

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = W / rect.width, sy = H / rect.height;
  const cx = (e.clientX - rect.left) * sx;
  const cy = (e.clientY - rect.top) * sy;

  if (state === 'menu') {
    // Check map card clicks
    MAPS.forEach((map, i) => {
      const x = 120 + i * 260, y = 180;
      if (cx >= x && cx <= x + 220 && cy >= y + 235 && cy <= y + 267) {
        startGame(i);
      }
      if (cx >= x && cx <= x + 220 && cy >= y && cy <= y + 280) {
        mapIndex = i;
      }
    });
    return;
  }

  if (state === 'gameover' || state === 'victory') {
    if (cx > W/2 - 60 && cx < W/2 + 60 && cy > H/2 + 30 && cy < H/2 + 66) {
      state = 'menu';
    }
    return;
  }

  // Speed toggle
  if (cx > W - 80 && cx < W - 50 && cy < 30) {
    gameSpeed = gameSpeed === 1 ? 2 : 1;
    return;
  }

  // Next wave button
  if (!waveActive && cx > W - 160 && cx < W - 90 && cy < 30) {
    startWave();
    return;
  }

  // Tower shop
  if (cy > H - 60) {
    TOWER_TYPES.forEach((t, i) => {
      const x = 20 + i * 100;
      if (cx >= x && cx <= x + 90 && cy >= H - 50) {
        if (money >= t.levels[0].cost) {
          placingType = placingType === t.id ? null : t.id;
          selectedTower = null;
        }
      }
    });
    return;
  }

  // Upgrade/sell buttons
  if (selectedTower !== null) {
    const t = towers[selectedTower];
    const upgCost = getUpgradeCost(t.typeId, t.level);
    if (upgCost && cx > W - 188 && cx < W - 108 && cy > 135 && cy < 159) {
      if (money >= upgCost) {
        money -= upgCost;
        t.level++;
        effects.push({ type:'text', x:t.x, y:t.y-20, text:'Upgraded!', color:'#4CAF50', alpha:1 });
      }
      return;
    }
    // Sell
    if (cx > W - 98 && cx < W - 48 && cy > 135 && cy < 159) {
      const stats = getTowerStats(t.typeId, t.level);
      money += Math.floor(stats.cost * 0.6);
      effects.push({ type:'text', x:t.x, y:t.y-20, text:'Sold!', color:'#F44336', alpha:1 });
      towers.splice(selectedTower, 1);
      selectedTower = null;
      return;
    }
  }

  // Place tower
  if (placingType && cy > 36 && cy < H - 60) {
    if (placeTower(placingType, cx, cy)) {
      // Keep placing same type
    }
    return;
  }

  // Select tower
  placingType = null;
  selectedTower = null;
  for (let i = 0; i < towers.length; i++) {
    const dx = towers[i].x - cx, dy = towers[i].y - cy;
    if (dx*dx + dy*dy < 20*20) {
      selectedTower = i;
      return;
    }
  }
});

// Right click to cancel
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  placingType = null;
  selectedTower = null;
});

// ═══ GAME LOOP ═══
let lastTime = 0;
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (state === 'playing') update(dt);
  draw();
  requestAnimationFrame(loop);
}

// Scale canvas to fit window
function resize() {
  const aspect = W / H;
  let cw = innerWidth, ch = innerHeight;
  if (cw / ch > aspect) cw = ch * aspect;
  else ch = cw / aspect;
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
}
window.addEventListener('resize', resize);
resize();

requestAnimationFrame(loop);
