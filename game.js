import { MAPS, pathLength, posOnPath } from './maps.js';
import { TOWER_TYPES, getTowerStats, getUpgradeCost } from './towers.js';
import { ENEMY_TYPES, generateWaves } from './enemies.js';
import { drawMap, drawTower, drawEnemy, drawProjectile, drawEffect } from './render.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = 960, H = 640;
canvas.width = W; canvas.height = H;

// ═══ GAME STATE ═══
let state = 'menu';
let currentMap = null, mapIndex = 0;
let money = 0, lives = 0, wave = 0, score = 0;
let waveActive = false, waveTimer = 0, spawnQueue = [];
let enemies = [], towers = [], projectiles = [], effects = [];
let selectedTower = null, placingType = null;
let mouseX = 0, mouseY = 0;
let waves = [], totalPathLen = 0;
let gameSpeed = 1, paused = false;
let autoWave = false;
let lastPlaced = null; // {index, time} for undo
let draggingTower = null; // index of tower being dragged
let dragOrigX = 0, dragOrigY = 0;
const SELL_REFUND = 0.6;
const DRAG_COST_MULT = 0.15; // 15% of tower cost to reposition

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

  MAPS.forEach((m, i) => {
    const x = 120 + i * 260, y = 180, w = 220, h = 280;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = mapIndex === i ? '#fff' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = mapIndex === i ? 2 : 1;
    roundRect(ctx, x, y, w, h, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = m.groundColors[0];
    roundRect(ctx, x+10, y+10, w-20, 120, 8); ctx.fill();
    ctx.save();
    ctx.beginPath(); roundRect(ctx, x+10, y+10, w-20, 120, 8); ctx.clip();
    ctx.strokeStyle = m.pathColor; ctx.lineWidth = 4; ctx.beginPath();
    const sx = (w-20)/W, sy = 120/H;
    ctx.moveTo(x+10+m.path[0][0]*sx, y+10+m.path[0][1]*sy);
    for (let j = 1; j < m.path.length; j++) ctx.lineTo(x+10+m.path[j][0]*sx, y+10+m.path[j][1]*sy);
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(m.name, x+w/2, y+155);
    ctx.font = '12px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Difficulty: ' + '★'.repeat(Math.ceil(m.difficulty*2)), x+w/2, y+178);
    ctx.fillText('Lives: ' + m.lives, x+w/2, y+198);
    ctx.fillText('Start $' + m.startMoney, x+w/2, y+218);
    ctx.fillStyle = mapIndex === i ? '#4CAF50' : 'rgba(255,255,255,0.1)';
    roundRect(ctx, x+40, y+235, w-80, 32, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('PLAY', x+w/2, y+255);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

// ═══ START / SPAWN ═══
function startGame(mi) {
  mapIndex = mi; currentMap = MAPS[mi];
  money = currentMap.startMoney; lives = currentMap.lives;
  wave = 0; waveActive = false; enemies = []; towers = [];
  projectiles = []; effects = []; selectedTower = null;
  placingType = null; spawnQueue = []; lastPlaced = null;
  waves = generateWaves(currentMap.difficulty);
  totalPathLen = pathLength(currentMap.path);
  state = 'playing'; score = 0; gameSpeed = 1; paused = false; autoWave = false;
  draggingTower = null;
}

function startWave() {
  if (wave >= waves.length) { state = 'victory'; return; }
  const w = waves[wave]; spawnQueue = []; let delay = 0;
  for (const group of w.groups) {
    for (let i = 0; i < group.count; i++) {
      spawnQueue.push({ type: group.type, time: delay, hpMult: w.hpMult });
      delay += group.delay;
    }
  }
  waveTimer = 0; waveActive = true;
}

function spawnEnemy(type, hpMult) {
  const def = ENEMY_TYPES[type];
  enemies.push({
    type, x:0, y:0, dist:0,
    hp: def.hp*hpMult, maxHp: def.hp*hpMult,
    speed: def.speed, baseSpeed: def.speed,
    reward: def.reward, color: def.color, radius: def.radius,
    shieldHp: def.shield ? def.shield*hpMult : 0,
    regenRate: def.regen || 0,
    slowTimer:0, slowAmount:0, poisonTimer:0, poisonDmg:0, alive:true
  });
}

// ═══ TOWER PLACEMENT & UNDO ═══
function canPlace(x, y, ignoreIdx) {
  for (let i = 1; i < currentMap.path.length; i++) {
    const ax=currentMap.path[i-1][0],ay=currentMap.path[i-1][1];
    const bx=currentMap.path[i][0],by=currentMap.path[i][1];
    if (distToSeg(x,y,ax,ay,bx,by) < 30) return false;
  }
  for (let i = 0; i < towers.length; i++) {
    if (i === ignoreIdx) continue;
    const dx=towers[i].x-x, dy=towers[i].y-y;
    if (dx*dx+dy*dy < 30*30) return false;
  }
  if (x<20||x>W-20||y<20||y>H-20) return false;
  return true;
}

function distToSeg(px,py,ax,ay,bx,by) {
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
  let t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));
  const cx=ax+t*dx,cy=ay+t*dy;
  return Math.sqrt((px-cx)*(px-cx)+(py-cy)*(py-cy));
}

function placeTower(typeId, x, y) {
  const stats = getTowerStats(typeId, 0);
  if (money < stats.cost || !canPlace(x, y)) return false;
  money -= stats.cost;
  towers.push({ typeId, x, y, level:0, cooldown:0, kills:0, targeting:'first' });
  lastPlaced = { index: towers.length-1, time: performance.now() };
  effects.push({type:'text',x,y:y-20,text:'Placed!',color:'#4CAF50',alpha:1});
  return true;
}

function undoLastPlace() {
  if (!lastPlaced) return;
  if (performance.now() - lastPlaced.time > 3000) { lastPlaced = null; return; }
  const t = towers[lastPlaced.index];
  if (!t) { lastPlaced = null; return; }
  const stats = getTowerStats(t.typeId, t.level);
  money += stats.cost;
  effects.push({type:'text',x:t.x,y:t.y-20,text:'Undone!',color:'#FF9800',alpha:1});
  towers.splice(lastPlaced.index, 1);
  if (selectedTower === lastPlaced.index) selectedTower = null;
  lastPlaced = null;
}

// ═══ TARGETING ═══
function getTargets(tower, stats) {
  let inRange = enemies.filter(e => {
    if (!e.alive) return false;
    const dx=e.x-tower.x, dy=e.y-tower.y;
    return dx*dx+dy*dy <= stats.range*stats.range;
  });
  if (inRange.length === 0) return [];
  switch (tower.targeting) {
    case 'first': inRange.sort((a,b) => b.dist - a.dist); break;
    case 'last': inRange.sort((a,b) => a.dist - b.dist); break;
    case 'strong': inRange.sort((a,b) => b.hp - a.hp); break;
    case 'weak': inRange.sort((a,b) => a.hp - b.hp); break;
  }
  return inRange;
}

// ═══ COMBAT ═══
function updateTowers(dt) {
  for (const tower of towers) {
    const stats = getTowerStats(tower.typeId, tower.level);
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;
    const targets = getTargets(tower, stats);
    if (targets.length === 0) continue;
    tower.cooldown = 1 / stats.fireRate;
    let hitCount = 1;
    if (stats.special === 'multishot') hitCount = 2;
    if (stats.special === 'chain') hitCount = stats.chainCount || 3;
    for (let i = 0; i < Math.min(hitCount, targets.length); i++) {
      const tgt = targets[i];
      projectiles.push({
        x:tower.x, y:tower.y, tx:tgt.x, ty:tgt.y, target:tgt,
        speed:300, damage:stats.damage, color:stats.type.color,
        special:stats.special, splashRadius:stats.splashRadius||0,
        slowAmount:stats.slowAmount||0, slowDuration:stats.slowDuration||0,
        poisonDmg:stats.poisonDmg||0, poisonDur:stats.poisonDur||0,
        towerRef: tower
      });
    }
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length-1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.target && p.target.alive) { p.tx=p.target.x; p.ty=p.target.y; }
    const dx=p.tx-p.x, dy=p.ty-p.y, dist=Math.sqrt(dx*dx+dy*dy);
    if (dist < 8) { applyHit(p); projectiles.splice(i,1); continue; }
    const spd=p.speed*dt; p.x+=(dx/dist)*spd; p.y+=(dy/dist)*spd;
    if (p.x<-50||p.x>W+50||p.y<-50||p.y>H+50) projectiles.splice(i,1);
  }
}

function applyHit(proj) {
  effects.push({type:'hit',x:proj.tx,y:proj.ty,color:proj.color,alpha:1});
  if (proj.special==='splash'||proj.special==='explosive') {
    const r=proj.splashRadius||40;
    effects.push({type:'explosion',x:proj.tx,y:proj.ty,radius:r,color:proj.color,alpha:1});
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx=e.x-proj.tx,dy=e.y-proj.ty;
      if (dx*dx+dy*dy<=r*r) damageEnemy(e, proj.damage*0.6, proj.towerRef);
    }
  }
  if (proj.target && proj.target.alive) {
    damageEnemy(proj.target, proj.damage, proj.towerRef);
    if (proj.special==='slow'||proj.special==='freeze') {
      proj.target.slowTimer=proj.slowDuration; proj.target.slowAmount=proj.slowAmount;
      if (proj.special==='freeze') { proj.target.slowTimer=0.8; proj.target.slowAmount=1.0; }
    }
    if (proj.special==='poison'||proj.special==='chain') {
      proj.target.poisonTimer=proj.poisonDur; proj.target.poisonDmg=proj.poisonDmg;
    }
  }
}

function damageEnemy(enemy, dmg, towerRef) {
  // Damage numbers
  effects.push({type:'text',x:enemy.x+(Math.random()-0.5)*10,y:enemy.y-enemy.radius-5,
    text:Math.round(dmg)+'',color:'#fff',alpha:1});
  if (enemy.shieldHp > 0) {
    const absorbed=Math.min(enemy.shieldHp,dmg); enemy.shieldHp-=absorbed; dmg-=absorbed;
  }
  enemy.hp -= dmg;
  if (enemy.hp <= 0) {
    enemy.alive = false; money += enemy.reward; score += enemy.reward;
    if (towerRef) towerRef.kills = (towerRef.kills||0) + 1;
    effects.push({type:'text',x:enemy.x,y:enemy.y-15,text:'+$'+enemy.reward,color:'#ffd700',alpha:1});
  }
}

// ═══ UPDATE ═══
function update(dt) {
  if (paused) return;
  dt *= gameSpeed;

  if (waveActive && spawnQueue.length > 0) {
    waveTimer += dt;
    while (spawnQueue.length > 0 && spawnQueue[0].time <= waveTimer) {
      const s = spawnQueue.shift(); spawnEnemy(s.type, s.hpMult);
    }
  }
  if (waveActive && spawnQueue.length === 0 && enemies.every(e => !e.alive)) {
    waveActive = false; wave++;
    if (wave >= waves.length) state = 'victory';
    else if (autoWave) setTimeout(startWave, 800);
  }

  for (const e of enemies) {
    if (!e.alive) continue;
    let speedMult = 1;
    if (e.slowTimer > 0) { speedMult = 1-e.slowAmount; e.slowTimer -= dt; }
    if (e.poisonTimer > 0) {
      e.hp -= e.poisonDmg*dt; e.poisonTimer -= dt;
      if (e.hp <= 0) {
        e.alive=false; money+=e.reward; score+=e.reward;
        effects.push({type:'text',x:e.x,y:e.y-10,text:'+$'+e.reward,color:'#9C27B0',alpha:1});
      }
    }
    if (e.regenRate > 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp+e.regenRate*dt);
    e.dist += e.baseSpeed*speedMult*dt;
    const pos = posOnPath(currentMap.path, e.dist); e.x=pos.x; e.y=pos.y;
    if (e.dist >= totalPathLen) {
      e.alive=false; lives--;
      effects.push({type:'text',x:e.x,y:e.y,text:'-1 ❤️',color:'#F44336',alpha:1});
      if (lives <= 0) state = 'gameover';
    }
  }
  enemies = enemies.filter(e => e.alive || e.hp > 0);
  updateTowers(dt); updateProjectiles(dt);
  for (let i = effects.length-1; i >= 0; i--) {
    effects[i].alpha -= dt*1.5; if (effects[i].alpha <= 0) effects.splice(i,1);
  }
}

// ═══ PATH DIRECTION ARROWS ═══
function drawPathArrows() {
  if (waveActive) return;
  const path = currentMap.path;
  const t = performance.now()/1000;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 1; i < path.length; i++) {
    const ax=path[i-1][0],ay=path[i-1][1],bx=path[i][0],by=path[i][1];
    const dx=bx-ax, dy=by-ay, len=Math.sqrt(dx*dx+dy*dy);
    const nx=dx/len, ny=dy/len;
    const count = Math.floor(len / 50);
    for (let j = 0; j < count; j++) {
      const frac = ((j/count) + t*0.15) % 1.0;
      const px = ax+dx*frac, py = ay+dy*frac;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(ny, nx));
      ctx.beginPath();
      ctx.moveTo(6,0); ctx.lineTo(-4,-4); ctx.lineTo(-4,4); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

// ═══ WAVE PREVIEW ═══
function drawWavePreview() {
  if (waveActive || wave >= waves.length) return;
  const w = waves[wave];
  const px = 10, py = 42;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, px, py, 280, 28, 6); ctx.fill();
  ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Next:', px+6, py+18);
  let ox = px + 40;
  for (const group of w.groups) {
    const def = ENEMY_TYPES[group.type];
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(ox, py+14, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('×'+group.count, ox+8, py+18);
    ox += 50;
    if (ox > 270) break;
  }
}

// ═══ DRAW HUD ═══
function drawHUD() {
  // Top bar
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, 36);
  ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd700'; ctx.fillText('$' + money, 12, 24);
  ctx.fillStyle = '#F44336'; ctx.fillText('❤️ ' + lives, 110, 24);
  ctx.fillStyle = '#fff'; ctx.fillText('Wave ' + (wave+1) + '/' + waves.length, 200, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('Score: ' + score, 340, 24);

  // Speed buttons: 1x 2x 3x
  const speeds = [1,2,3];
  speeds.forEach((s, i) => {
    const bx = W - 110 + i*30;
    ctx.fillStyle = gameSpeed === s ? '#FF9800' : 'rgba(255,255,255,0.1)';
    roundRect(ctx, bx, 6, 26, 24, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(s+'x', bx+13, 22);
  });

  // Pause
  ctx.fillStyle = paused ? '#F44336' : 'rgba(255,255,255,0.1)';
  roundRect(ctx, W-140, 6, 26, 24, 4); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(paused ? '▶' : '⏸', W-127, 22);

  // Auto-wave toggle
  ctx.fillStyle = autoWave ? '#4CAF50' : 'rgba(255,255,255,0.1)';
  roundRect(ctx, W-200, 6, 50, 24, 4); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif';
  ctx.fillText(autoWave ? 'AUTO ON' : 'AUTO', W-175, 22);

  // Next wave button
  if (!waveActive && state === 'playing' && !autoWave) {
    ctx.fillStyle = '#4CAF50';
    roundRect(ctx, W-270, 6, 60, 24, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif';
    ctx.fillText('NEXT', W-240, 22);
  }

  // Undo indicator
  if (lastPlaced && performance.now()-lastPlaced.time < 3000) {
    const remain = Math.ceil((3000-(performance.now()-lastPlaced.time))/1000);
    ctx.fillStyle = 'rgba(255,152,0,0.2)';
    roundRect(ctx, 460, 6, 70, 24, 4); ctx.fill();
    ctx.fillStyle = '#FF9800'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('UNDO ('+remain+'s)', 495, 22);
  }

  // Paused overlay
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 36, W, H-96);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('PAUSED', W/2, H/2);
  }

  drawWavePreview();

  // ═══ TOWER SHOP — bottom bar ═══
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, H-60, W, 60);
  TOWER_TYPES.forEach((t, i) => {
    const x = 20 + i*100, y = H-50;
    const stats = t.levels[0]; const canAfford = money >= stats.cost;
    const hovering = !placingType && mouseX >= x && mouseX <= x+90 && mouseY >= y && mouseY <= y+44;
    ctx.fillStyle = placingType === t.id ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = canAfford ? t.color : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = placingType === t.id ? 2 : 1;
    roundRect(ctx, x, y, 90, 44, 6); ctx.fill(); ctx.stroke();
    ctx.font = '16px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(t.icon, x+6, y+20);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = canAfford ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.fillText(t.name, x+26, y+17);
    ctx.fillStyle = canAfford ? '#ffd700' : 'rgba(255,255,255,0.2)';
    ctx.font = '10px sans-serif';
    ctx.fillText('$' + stats.cost, x+26, y+32);
    // Hotkey hint
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '9px sans-serif';
    ctx.fillText((i+1)+'', x+80, y+12);

    // Range preview on hover
    if (hovering && !placingType) {
      ctx.save(); ctx.globalAlpha = 0.12;
      ctx.strokeStyle = t.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mouseX, Math.min(mouseY, H-70), stats.range, 0, Math.PI*2);
      ctx.stroke(); ctx.restore();
    }
  });

  // ═══ SELECTED TOWER PANEL ═══
  if (selectedTower !== null && selectedTower < towers.length) {
    const t = towers[selectedTower];
    const stats = getTowerStats(t.typeId, t.level);
    const upgCost = getUpgradeCost(t.typeId, t.level);
    const sellVal = Math.floor(stats.cost * SELL_REFUND);
    const panelH = upgCost ? 175 : 140;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundRect(ctx, W-210, 50, 200, panelH, 8); ctx.fill();

    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(stats.type.icon+' '+stats.type.name+' Lv.'+(t.level+1), W-198, 72);
    ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('DMG: '+stats.damage+'  RNG: '+stats.range, W-198, 90);
    ctx.fillText('SPD: '+stats.fireRate.toFixed(1)+'/s  Kills: '+(t.kills||0), W-198, 106);
    if (stats.special) ctx.fillText('Special: '+stats.special, W-198, 122);

    // Targeting priority
    const modes = ['first','last','strong','weak'];
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '9px sans-serif';
    ctx.fillText('Target:', W-198, 138);
    modes.forEach((m, i) => {
      const bx = W-155+i*38;
      ctx.fillStyle = t.targeting===m ? '#2196F3' : 'rgba(255,255,255,0.08)';
      roundRect(ctx, bx, 130, 34, 16, 3); ctx.fill();
      ctx.fillStyle = t.targeting===m ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(m, bx+17, 141);
    });
    ctx.textAlign = 'left';

    const btnY = 152;
    if (upgCost) {
      ctx.fillStyle = money>=upgCost ? '#4CAF50' : 'rgba(255,255,255,0.1)';
      roundRect(ctx, W-198, btnY, 90, 24, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('UPGRADE $'+upgCost, W-153, btnY+16);
    }
    // Sell with refund shown
    ctx.fillStyle = '#F44336';
    roundRect(ctx, W-100, btnY, 80, 24, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SELL $'+sellVal, W-60, btnY+16);
    // Drag hint
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Drag to move (costs 15%)', W-110, btnY+42);
  }

  // Placement preview
  if (placingType) {
    const stats = getTowerStats(placingType, 0);
    const ok = canPlace(mouseX, mouseY) && mouseY > 36 && mouseY < H-60;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = ok ? '#4CAF50' : '#F44336'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mouseX, mouseY, stats.range, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = ok ? stats.type.color : '#F44336';
    ctx.beginPath(); ctx.arc(mouseX, mouseY, 14, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Drag preview
  if (draggingTower !== null) {
    const t = towers[draggingTower];
    const stats = getTowerStats(t.typeId, t.level);
    const ok = canPlace(mouseX, mouseY, draggingTower) && mouseY > 36 && mouseY < H-60;
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = ok ? '#2196F3' : '#F44336'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mouseX, mouseY, stats.range, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = ok ? stats.type.color : '#F44336';
    ctx.beginPath(); ctx.arc(mouseX, mouseY, 14, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ═══ DRAW ═══
function draw() {
  ctx.clearRect(0, 0, W, H);
  if (state === 'menu') { drawMenu(); return; }
  drawMap(ctx, currentMap, W, H);
  drawPathArrows();
  towers.forEach((t, i) => {
    const stats = getTowerStats(t.typeId, t.level);
    if (draggingTower === i) return; // don't draw at original pos while dragging
    drawTower(ctx, t, stats, selectedTower === i);
  });
  const tm = performance.now() / 1000;
  for (const e of enemies) { if (e.alive) drawEnemy(ctx, e, tm); }
  for (const p of projectiles) drawProjectile(ctx, p);
  for (const fx of effects) drawEffect(ctx, fx);
  drawHUD();

  if (state==='gameover'||state==='victory') {
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#fff'; ctx.font='bold 32px sans-serif'; ctx.textAlign='center';
    ctx.fillText(state==='victory'?'VICTORY!':'GAME OVER', W/2, H/2-30);
    ctx.font='16px sans-serif'; ctx.fillStyle='rgba(255,255,255,0.6)';
    ctx.fillText('Score: '+score+'  Waves: '+wave+'/'+waves.length, W/2, H/2+10);
    ctx.fillStyle='#4CAF50'; roundRect(ctx,W/2-60,H/2+30,120,36,8); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 14px sans-serif';
    ctx.fillText('MENU', W/2, H/2+53);
  }
}

// ═══ INPUT ═══
canvas.addEventListener('mousemove', e => {
  const rect=canvas.getBoundingClientRect();
  mouseX=(e.clientX-rect.left)*(W/rect.width);
  mouseY=(e.clientY-rect.top)*(H/rect.height);
  if (draggingTower !== null) {
    // Visual feedback handled in draw
  }
});

canvas.addEventListener('mousedown', e => {
  if (state !== 'playing') return;
  const rect=canvas.getBoundingClientRect();
  const cx=(e.clientX-rect.left)*(W/rect.width);
  const cy=(e.clientY-rect.top)*(H/rect.height);
  // Start drag on selected tower
  if (selectedTower !== null && !placingType && cy > 36 && cy < H-60) {
    const t = towers[selectedTower];
    const dx=t.x-cx, dy=t.y-cy;
    if (dx*dx+dy*dy < 20*20) {
      draggingTower = selectedTower;
      dragOrigX = t.x; dragOrigY = t.y;
    }
  }
});

canvas.addEventListener('mouseup', e => {
  if (draggingTower !== null) {
    const t = towers[draggingTower];
    const stats = getTowerStats(t.typeId, t.level);
    const moveCost = Math.floor(stats.cost * DRAG_COST_MULT);
    if (canPlace(mouseX, mouseY, draggingTower) && mouseY>36 && mouseY<H-60 && money>=moveCost) {
      money -= moveCost;
      t.x = mouseX; t.y = mouseY;
      effects.push({type:'text',x:mouseX,y:mouseY-20,text:'Moved -$'+moveCost,color:'#2196F3',alpha:1});
    } else {
      t.x = dragOrigX; t.y = dragOrigY;
    }
    draggingTower = null;
  }
});

canvas.addEventListener('click', e => {
  const rect=canvas.getBoundingClientRect();
  const cx=(e.clientX-rect.left)*(W/rect.width);
  const cy=(e.clientY-rect.top)*(H/rect.height);

  if (state==='menu') {
    MAPS.forEach((m,i) => {
      const x=120+i*260, y=180;
      if (cx>=x&&cx<=x+220&&cy>=y+235&&cy<=y+267) startGame(i);
      if (cx>=x&&cx<=x+220&&cy>=y&&cy<=y+280) mapIndex=i;
    });
    return;
  }
  if (state==='gameover'||state==='victory') {
    if (cx>W/2-60&&cx<W/2+60&&cy>H/2+30&&cy<H/2+66) state='menu';
    return;
  }

  // Speed buttons
  const speeds=[1,2,3];
  speeds.forEach((s,i) => {
    const bx=W-110+i*30;
    if (cx>bx&&cx<bx+26&&cy>6&&cy<30) gameSpeed=s;
  });
  // Pause
  if (cx>W-140&&cx<W-114&&cy>6&&cy<30) { paused=!paused; return; }
  // Auto-wave
  if (cx>W-200&&cx<W-150&&cy>6&&cy<30) { autoWave=!autoWave; return; }
  // Next wave
  if (!waveActive&&!autoWave&&cx>W-270&&cx<W-210&&cy>6&&cy<30) { startWave(); return; }
  // Undo
  if (lastPlaced&&performance.now()-lastPlaced.time<3000&&cx>460&&cx<530&&cy>6&&cy<30) {
    undoLastPlace(); return;
  }

  // Tower shop
  if (cy > H-60) {
    TOWER_TYPES.forEach((t,i) => {
      const x=20+i*100;
      if (cx>=x&&cx<=x+90&&cy>=H-50) {
        if (money>=t.levels[0].cost) {
          placingType = placingType===t.id ? null : t.id;
          selectedTower = null;
        }
      }
    });
    return;
  }

  // Selected tower panel buttons
  if (selectedTower !== null && selectedTower < towers.length) {
    const t = towers[selectedTower];
    const stats = getTowerStats(t.typeId, t.level);
    const upgCost = getUpgradeCost(t.typeId, t.level);
    const btnY = 152;
    // Upgrade
    if (upgCost&&cx>W-198&&cx<W-108&&cy>btnY&&cy<btnY+24) {
      if (money>=upgCost) { money-=upgCost; t.level++;
        effects.push({type:'text',x:t.x,y:t.y-20,text:'Upgraded!',color:'#4CAF50',alpha:1});
      } return;
    }
    // Sell
    if (cx>W-100&&cx<W-20&&cy>btnY&&cy<btnY+24) {
      money += Math.floor(stats.cost*SELL_REFUND);
      effects.push({type:'text',x:t.x,y:t.y-20,text:'Sold!',color:'#F44336',alpha:1});
      towers.splice(selectedTower,1); selectedTower=null; return;
    }
    // Targeting buttons
    const modes=['first','last','strong','weak'];
    modes.forEach((m,i) => {
      const bx=W-155+i*38;
      if (cx>bx&&cx<bx+34&&cy>130&&cy<146) t.targeting=m;
    });
  }

  // Place tower
  if (placingType && cy>36 && cy<H-60) {
    placeTower(placingType, cx, cy); return;
  }

  // Select tower
  placingType=null; selectedTower=null;
  for (let i=0; i<towers.length; i++) {
    const dx=towers[i].x-cx, dy=towers[i].y-cy;
    if (dx*dx+dy*dy<20*20) { selectedTower=i; return; }
  }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault(); placingType=null; selectedTower=null; draggingTower=null;
});

// ═══ HOTKEYS ═══
window.addEventListener('keydown', e => {
  if (state !== 'playing') return;
  if (e.key >= '1' && e.key <= '5') {
    const i = parseInt(e.key)-1;
    if (i < TOWER_TYPES.length && money >= TOWER_TYPES[i].levels[0].cost) {
      placingType = TOWER_TYPES[i].id; selectedTower = null;
    }
  }
  if (e.key === 'Escape') { placingType=null; selectedTower=null; draggingTower=null; }
  if (e.key === 'z' || e.key === 'Z') undoLastPlace();
  if (e.key === ' ') { e.preventDefault(); paused=!paused; }
  if (e.key === 'n' || e.key === 'N') { if (!waveActive) startWave(); }
});

// ═══ LOOP ═══
let lastTime = 0;
function loop(now) {
  const dt = Math.min((now-lastTime)/1000, 0.05); lastTime = now;
  if (state === 'playing') update(dt);
  draw();
  requestAnimationFrame(loop);
}

function resize() {
  const aspect = W/H;
  let cw=innerWidth, ch=innerHeight;
  if (cw/ch > aspect) cw=ch*aspect; else ch=cw/aspect;
  canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
}
window.addEventListener('resize', resize); resize();
requestAnimationFrame(loop);
