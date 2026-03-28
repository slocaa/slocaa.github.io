import { MAPS, pathLength, posOnPath } from './maps.js';
import { TOWER_TYPES, getTowerStats, getUpgradeCost } from './towers.js';
import { ENEMY_TYPES, generateWaves } from './enemies.js';
import { drawMap, drawTower, drawEnemy, drawProjectile, drawEffect, roundRect } from './render.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = 1060, H = 640; // logical size
canvas.width = W; canvas.height = H;
const MAP_W = 780;
const SIDE_X = MAP_W;
const SIDE_W = W - MAP_W;

// Hi-DPI support — render at native resolution, scale CSS
let dpr = 1;
function applyDPR() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

// ═══ STATE ═══
let state = 'menu';
let currentMap = null, mapIndex = 0;
let money = 0, lives = 0, wave = 0, score = 0;
let waveActive = false, waveTimer = 0, spawnQueue = [];
let enemies = [], towers = [], projectiles = [], effects = [];
let selectedTower = null, placingType = null;
let mouseX = 0, mouseY = 0;
let waves = [], totalPathLen = 0;
let gameSpeed = 1, paused = false, autoWave = false;
let lastPlaced = null;
let draggingTower = null, dragOrigX = 0, dragOrigY = 0;
let hoveredTowerIdx = -1;
const SELL_PCT = 0.6;

// ═══ MENU ═══
function drawMenu() {
  // Dark clean background
  ctx.fillStyle = '#0f1923'; ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#fff'; ctx.font = '900 32px Nunito'; ctx.textAlign = 'center';
  ctx.fillText('TOWER DEFENSE', W/2, 80);

  // Subtitle
  ctx.font = '400 13px Nunito'; ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillText('Select a map', W/2, 105);

  // Map cards — compact, clean
  MAPS.forEach((m, i) => {
    const x = 160 + i * 260, y = 140, w = 220, h = 260;
    const hovered = mouseX>=x && mouseX<=x+w && mouseY>=y && mouseY<=y+h;
    const sel = mapIndex === i;

    // Card
    ctx.fillStyle = sel ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)';
    roundRect(ctx, x, y, w, h, 14); ctx.fill();
    if (sel || hovered) {
      ctx.strokeStyle = sel ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5; roundRect(ctx, x, y, w, h, 14); ctx.stroke();
    }

    // Map preview
    ctx.save();
    ctx.beginPath(); roundRect(ctx, x+14, y+14, w-28, 100, 8); ctx.clip();
    ctx.fillStyle = m.groundColors[0]; ctx.fillRect(x+14, y+14, w-28, 100);
    ctx.strokeStyle = m.pathColor; ctx.lineWidth = 4; ctx.lineCap='round'; ctx.lineJoin='round';
    const sx=(w-28)/MAP_W, sy2=100/H;
    ctx.beginPath(); ctx.moveTo(x+14+m.path[0][0]*sx, y+14+m.path[0][1]*sy2);
    for (let j=1;j<m.path.length;j++) ctx.lineTo(x+14+m.path[j][0]*sx, y+14+m.path[j][1]*sy2);
    ctx.stroke(); ctx.restore();

    // Name
    ctx.fillStyle='#fff'; ctx.font='800 15px Nunito'; ctx.textAlign='center';
    ctx.fillText(m.name, x+w/2, y+136);

    // Difficulty stars
    ctx.font='600 11px Nunito'; ctx.fillStyle='rgba(255,255,255,0.3)';
    const filled = Math.ceil(m.difficulty*2);
    ctx.fillText('★'.repeat(filled)+'☆'.repeat(Math.max(0,5-filled)), x+w/2, y+155);

    // Stats — minimal
    ctx.font='600 11px Nunito'; ctx.fillStyle='rgba(255,255,255,0.35)';
    ctx.fillText(m.lives+' lives  ·  $'+m.startMoney, x+w/2, y+178);

    // Play button
    const btnY = y+h-48;
    ctx.fillStyle = sel ? '#43a047' : 'rgba(255,255,255,0.05)';
    roundRect(ctx, x+30, btnY, w-60, 34, 8); ctx.fill();
    ctx.fillStyle = sel ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.font = '700 12px Nunito';
    ctx.fillText('PLAY', x+w/2, btnY+22);
  });

  // Hint at bottom
  ctx.font = '400 11px Nunito'; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.textAlign = 'center';
  ctx.fillText('Click a map to select, then PLAY', W/2, H-30);
}

// ═══ CORE GAME LOGIC ═══
function startGame(mi) {
  mapIndex=mi; currentMap=MAPS[mi]; money=currentMap.startMoney; lives=currentMap.lives;
  wave=0; waveActive=false; enemies=[]; towers=[]; projectiles=[]; effects=[];
  selectedTower=null; placingType=null; spawnQueue=[]; lastPlaced=null;
  waves=generateWaves(currentMap.difficulty); totalPathLen=pathLength(currentMap.path);
  state='playing'; score=0; gameSpeed=1; paused=false; autoWave=false; draggingTower=null;
}

function startWave() {
  if (wave>=waves.length){state='victory';return;}
  const w=waves[wave]; spawnQueue=[]; let delay=0;
  for (const g of w.groups) for (let i=0;i<g.count;i++) {
    spawnQueue.push({type:g.type,time:delay,hpMult:w.hpMult}); delay+=g.delay;
  }
  waveTimer=0; waveActive=true;
}

function spawnEnemy(type,hpMult) {
  const d=ENEMY_TYPES[type];
  enemies.push({type,x:0,y:0,dist:0,hp:d.hp*hpMult,maxHp:d.hp*hpMult,
    speed:d.speed,baseSpeed:d.speed,reward:d.reward,color:d.color,radius:d.radius,
    shieldHp:d.shield?d.shield*hpMult:0,regenRate:d.regen||0,
    slowTimer:0,slowAmount:0,poisonTimer:0,poisonDmg:0,alive:true});
}

function canPlace(x,y,ignoreIdx) {
  if (x<20||x>MAP_W-20||y<20||y>H-20) return false;
  for (let i=1;i<currentMap.path.length;i++) {
    if (distSeg(x,y,currentMap.path[i-1][0],currentMap.path[i-1][1],currentMap.path[i][0],currentMap.path[i][1])<30) return false;
  }
  for (let i=0;i<towers.length;i++) {
    if (i===ignoreIdx) continue;
    const dx=towers[i].x-x,dy=towers[i].y-y;
    if (dx*dx+dy*dy<30*30) return false;
  }
  return true;
}

function distSeg(px,py,ax,ay,bx,by) {
  const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2));
  const cx=ax+t*dx,cy=ay+t*dy;
  return Math.sqrt((px-cx)**2+(py-cy)**2);
}

function placeTower(id,x,y) {
  const s=getTowerStats(id,0);
  if (money<s.cost||!canPlace(x,y)) return false;
  money-=s.cost;
  towers.push({typeId:id,x,y,level:0,cooldown:0,kills:0,targeting:'first'});
  lastPlaced={index:towers.length-1,time:performance.now()};
  effects.push({type:'text',x,y:y-20,text:'Placed!',color:'#43a047',alpha:1});
  return true;
}

function undoPlace() {
  if (!lastPlaced||performance.now()-lastPlaced.time>3000) {lastPlaced=null;return;}
  const t=towers[lastPlaced.index]; if (!t){lastPlaced=null;return;}
  money+=getTowerStats(t.typeId,t.level).cost;
  effects.push({type:'text',x:t.x,y:t.y-20,text:'Undone',color:'#FF9800',alpha:1});
  towers.splice(lastPlaced.index,1);
  if (selectedTower===lastPlaced.index) selectedTower=null;
  lastPlaced=null;
}

// ═══ COMBAT ═══
function getTargets(tower,stats) {
  let t=enemies.filter(e=>{if(!e.alive)return false;const dx=e.x-tower.x,dy=e.y-tower.y;return dx*dx+dy*dy<=stats.range**2;});
  if (!t.length) return [];
  switch(tower.targeting){
    case'first':t.sort((a,b)=>b.dist-a.dist);break;
    case'last':t.sort((a,b)=>a.dist-b.dist);break;
    case'strong':t.sort((a,b)=>b.hp-a.hp);break;
    case'weak':t.sort((a,b)=>a.hp-b.hp);break;
  }
  return t;
}

function updateTowers(dt) {
  for (const tw of towers) {
    const s=getTowerStats(tw.typeId,tw.level); tw.cooldown-=dt;
    if (tw.cooldown>0) continue;
    const tgts=getTargets(tw,s); if (!tgts.length) continue;
    tw.cooldown=1/s.fireRate;
    let n=1;
    if (s.special==='multishot') n=2;
    if (s.special==='chain') n=s.chainCount||3;
    for (let i=0;i<Math.min(n,tgts.length);i++) {
      projectiles.push({x:tw.x,y:tw.y,tx:tgts[i].x,ty:tgts[i].y,target:tgts[i],
        speed:300,damage:s.damage,color:s.type.color,special:s.special,
        splashRadius:s.splashRadius||0,slowAmount:s.slowAmount||0,slowDuration:s.slowDuration||0,
        poisonDmg:s.poisonDmg||0,poisonDur:s.poisonDur||0,towerRef:tw});
    }
  }
}

function updateProjectiles(dt) {
  for (let i=projectiles.length-1;i>=0;i--) {
    const p=projectiles[i];
    if (p.target&&p.target.alive){p.tx=p.target.x;p.ty=p.target.y;}
    const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.sqrt(dx*dx+dy*dy);
    if (d<8){applyHit(p);projectiles.splice(i,1);continue;}
    const sp=p.speed*dt;p.x+=(dx/d)*sp;p.y+=(dy/d)*sp;
    if (p.x<-50||p.x>W+50||p.y<-50||p.y>H+50) projectiles.splice(i,1);
  }
}

function applyHit(p) {
  effects.push({type:'hit',x:p.tx,y:p.ty,color:p.color,alpha:1});
  if (p.special==='splash'||p.special==='explosive') {
    const r=p.splashRadius||40;
    effects.push({type:'explosion',x:p.tx,y:p.ty,radius:r,color:p.color,alpha:1});
    for (const e of enemies) {if(!e.alive)continue;if((e.x-p.tx)**2+(e.y-p.ty)**2<=r*r) dmgEnemy(e,p.damage*0.6,p.towerRef);}
  }
  if (p.target&&p.target.alive) {
    dmgEnemy(p.target,p.damage,p.towerRef);
    if (p.special==='slow'||p.special==='freeze'){p.target.slowTimer=p.slowDuration;p.target.slowAmount=p.slowAmount;if(p.special==='freeze'){p.target.slowTimer=0.8;p.target.slowAmount=1;}}
    if (p.special==='poison'||p.special==='chain'){p.target.poisonTimer=p.poisonDur;p.target.poisonDmg=p.poisonDmg;}
  }
}

function dmgEnemy(e,dmg,tw) {
  effects.push({type:'text',x:e.x+(Math.random()-.5)*8,y:e.y-e.radius-4,text:Math.round(dmg)+'',color:'#fff',alpha:1});
  if (e.shieldHp>0){const a=Math.min(e.shieldHp,dmg);e.shieldHp-=a;dmg-=a;}
  e.hp-=dmg;
  if (e.hp<=0){e.alive=false;money+=e.reward;score+=e.reward;if(tw)tw.kills=(tw.kills||0)+1;
    effects.push({type:'text',x:e.x,y:e.y-14,text:'+$'+e.reward,color:'#ffd700',alpha:1});}
}

// ═══ UPDATE ═══
function update(dt) {
  if (paused) return; dt*=gameSpeed;
  if (waveActive&&spawnQueue.length>0) {
    waveTimer+=dt;
    while(spawnQueue.length>0&&spawnQueue[0].time<=waveTimer){const s=spawnQueue.shift();spawnEnemy(s.type,s.hpMult);}
  }
  if (waveActive&&spawnQueue.length===0&&enemies.every(e=>!e.alive)) {
    waveActive=false;wave++;
    if (wave>=waves.length) state='victory';
    else if (autoWave) setTimeout(startWave,600);
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    let sm=1; if(e.slowTimer>0){sm=1-e.slowAmount;e.slowTimer-=dt;}
    if (e.poisonTimer>0){e.hp-=e.poisonDmg*dt;e.poisonTimer-=dt;
      if(e.hp<=0){e.alive=false;money+=e.reward;score+=e.reward;effects.push({type:'text',x:e.x,y:e.y-10,text:'+$'+e.reward,color:'#9C27B0',alpha:1});}}
    if (e.regenRate>0&&e.hp<e.maxHp) e.hp=Math.min(e.maxHp,e.hp+e.regenRate*dt);
    e.dist+=e.baseSpeed*sm*dt;
    const pos=posOnPath(currentMap.path,e.dist);e.x=pos.x;e.y=pos.y;
    if (e.dist>=totalPathLen){e.alive=false;lives--;effects.push({type:'text',x:e.x,y:e.y,text:'-1 ❤️',color:'#e53935',alpha:1});if(lives<=0)state='gameover';}
  }
  enemies=enemies.filter(e=>e.alive||e.hp>0);
  updateTowers(dt);updateProjectiles(dt);
  for (let i=effects.length-1;i>=0;i--){effects[i].alpha-=dt*1.5;if(effects[i].alpha<=0)effects.splice(i,1);}
}

// ═══ DRAW SIDEBAR (BTD6-style) ═══
function drawSidebar() {
  ctx.fillStyle = '#151e2a';
  ctx.fillRect(SIDE_X, 0, SIDE_W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(SIDE_X, 0, 1, H);

  let sy = 12;

  // Money & Lives
  ctx.fillStyle = '#1b2736'; roundRect(ctx, SIDE_X+10, sy, SIDE_W-20, 44, 8); ctx.fill();
  ctx.font = '800 16px Nunito'; ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd700'; ctx.fillText('$'+money, SIDE_X+18, sy+20);
  ctx.fillStyle = '#e53935'; ctx.font = '700 12px Nunito';
  ctx.fillText('\u2764\uFE0F '+lives, SIDE_X+18, sy+38);
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '600 10px Nunito';
  ctx.fillText('Score '+score, SIDE_X+SIDE_W-18, sy+38);
  sy += 52;

  // Wave bar
  ctx.font = '700 10px Nunito'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('WAVE '+(wave+1)+' / '+waves.length, SIDE_X+SIDE_W/2, sy+10);
  var barX=SIDE_X+14, barW=SIDE_W-28;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, barX, sy+16, barW, 4, 2); ctx.fill();
  ctx.fillStyle = '#43a047';
  roundRect(ctx, barX, sy+16, barW*(wave/Math.max(waves.length,1)), 4, 2); ctx.fill();
  sy += 28;

  // Send wave
  if (!waveActive && wave<waves.length) {
    ctx.fillStyle = '#43a047'; roundRect(ctx, SIDE_X+10, sy, SIDE_W-20, 28, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 10px Nunito'; ctx.textAlign = 'center';
    ctx.fillText(autoWave ? '\u23E9 AUTO' : '\u25B6 SEND WAVE', SIDE_X+SIDE_W/2, sy+18);
  } else if (waveActive) {
    ctx.fillStyle = 'rgba(255,152,0,0.12)'; roundRect(ctx, SIDE_X+10, sy, SIDE_W-20, 28, 6); ctx.fill();
    ctx.fillStyle = '#FF9800'; ctx.font = '600 10px Nunito'; ctx.textAlign = 'center';
    ctx.fillText('\u2694\uFE0F WAVE IN PROGRESS', SIDE_X+SIDE_W/2, sy+18);
  }
  sy += 34;

  // Controls
  var cX = SIDE_X+10, bW = 38, gg = 4;
  ctx.fillStyle = paused ? '#e53935' : '#1b2736';
  roundRect(ctx, cX, sy, bW, 24, 5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '600 10px Nunito'; ctx.textAlign = 'center';
  ctx.fillText(paused?'\u25B6':'\u23F8', cX+bW/2, sy+16);
  [1,2,3].forEach(function(s,i) {
    var bx=cX+bW+gg+(bW+gg)*i;
    ctx.fillStyle = gameSpeed===s ? '#FF9800' : '#1b2736';
    roundRect(ctx, bx, sy, bW, 24, 5); ctx.fill();
    ctx.fillStyle = gameSpeed===s ? '#fff' : 'rgba(255,255,255,0.4)';
    ctx.font = '700 9px Nunito'; ctx.fillText(s+'\u00D7', bx+bW/2, sy+16);
  });
  var aX=cX+(bW+gg)*4;
  ctx.fillStyle = autoWave ? '#43a047' : '#1b2736';
  roundRect(ctx, aX, sy, bW+8, 24, 5); ctx.fill();
  ctx.fillStyle = autoWave ? '#fff' : 'rgba(255,255,255,0.35)';
  ctx.font = '600 8px Nunito'; ctx.fillText('AUTO', aX+23, sy+16);
  sy += 32;

  // Undo
  if (lastPlaced && performance.now()-lastPlaced.time<3000) {
    var rem=Math.ceil((3000-(performance.now()-lastPlaced.time))/1000);
    ctx.fillStyle='rgba(255,152,0,0.1)'; roundRect(ctx,SIDE_X+10,sy,SIDE_W-20,20,5); ctx.fill();
    ctx.fillStyle='#FF9800'; ctx.font='600 9px Nunito'; ctx.textAlign='center';
    ctx.fillText('\u21A9 UNDO (Z) '+rem+'s', SIDE_X+SIDE_W/2, sy+14); sy+=26;
  }

  // Wave preview
  if (!waveActive && wave<waves.length) {
    ctx.font='600 8px Nunito'; ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,0.25)';
    ctx.fillText('NEXT:', SIDE_X+14, sy+10);
    var ox=SIDE_X+48;
    for (var gi=0;gi<waves[wave].groups.length;gi++) {
      var grp=waves[wave].groups[gi];
      var def=ENEMY_TYPES[grp.type];
      ctx.fillStyle=def.color; ctx.beginPath(); ctx.arc(ox, sy+7, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='600 8px Nunito'; ctx.textAlign='left';
      ctx.fillText('\u00D7'+grp.count, ox+6, sy+10); ox+=40;
      if (ox>SIDE_X+SIDE_W-20) break;
    }
    sy+=20;
  }

  // Divider
  sy += 4;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(SIDE_X+14, sy, SIDE_W-28, 1);
  sy += 8;

  // TOWER SHOP
  ctx.font = '700 10px Nunito'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('TOWERS', SIDE_X+16, sy+10); sy += 18;

  TOWER_TYPES.forEach(function(t, i) {
    var bx = SIDE_X+10, by = sy, bww = SIDE_W-20, bh = 52;
    var stats = t.levels[0];
    var afford = money >= stats.cost;
    var active = placingType === t.id;

    ctx.fillStyle = active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
    roundRect(ctx, bx, by, bww, bh, 8); ctx.fill();
    ctx.strokeStyle = active ? t.color : afford ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
    ctx.lineWidth = active ? 2 : 1;
    roundRect(ctx, bx, by, bww, bh, 8); ctx.stroke();

    ctx.fillStyle = t.color+'22'; roundRect(ctx, bx+6, by+6, 40, 40, 6); ctx.fill();
    ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t.icon, bx+26, by+33);

    ctx.textAlign = 'left';
    ctx.fillStyle = afford ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.font = '700 12px Nunito'; ctx.fillText(t.name, bx+52, by+20);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '400 9px Nunito';
    ctx.fillText(t.desc, bx+52, by+33);

    ctx.fillStyle = afford ? '#ffd700' : 'rgba(255,255,255,0.2)';
    ctx.font = '800 11px Nunito'; ctx.textAlign = 'right';
    ctx.fillText('$'+stats.cost, bx+bww-10, by+20);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '600 9px Nunito';
    ctx.fillText(''+(i+1), bx+bww-10, by+35);

    sy += bh + 4;
  });

  // SELECTED TOWER PANEL
  if (selectedTower !== null && selectedTower < towers.length) {
    var t = towers[selectedTower];
    var s = getTowerStats(t.typeId, t.level);
    var uc = getUpgradeCost(t.typeId, t.level);
    var sv = Math.floor(s.cost * SELL_PCT);

    sy += 6;
    ctx.fillStyle = '#1b2736'; roundRect(ctx, SIDE_X+10, sy, SIDE_W-20, uc?170:140, 10); ctx.fill();

    ctx.font = '800 14px Nunito'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(s.type.icon+' '+s.type.name, SIDE_X+20, sy+20);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '600 10px Nunito';
    ctx.fillText('Level '+(t.level+1)+' \u00B7 '+t.kills+' kills', SIDE_X+20, sy+36);

    var statY = sy+50;
    var statData = [['DMG',s.damage],['RNG',s.range],['SPD',s.fireRate.toFixed(1)+'/s']];
    statData.forEach(function(sd,i) {
      var sx2 = SIDE_X+20+i*75;
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '600 8px Nunito'; ctx.textAlign = 'left';
      ctx.fillText(sd[0], sx2, statY);
      ctx.fillStyle = '#fff'; ctx.font = '700 12px Nunito';
      ctx.fillText(''+sd[1], sx2, statY+14);
    });
    if (s.special) {
      ctx.fillStyle = s.type.color; ctx.font = '600 10px Nunito'; ctx.textAlign = 'left';
      ctx.fillText('\u26A1 '+s.special.toUpperCase(), SIDE_X+20, statY+32);
    }

    var tgtY = statY+46;
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '600 8px Nunito'; ctx.textAlign = 'left';
    ctx.fillText('TARGET', SIDE_X+20, tgtY);
    ['first','last','strong','weak'].forEach(function(m,i) {
      var tbx = SIDE_X+20+i*55;
      ctx.fillStyle = t.targeting===m ? '#2196F3' : 'rgba(255,255,255,0.06)';
      roundRect(ctx, tbx, tgtY+4, 50, 18, 4); ctx.fill();
      ctx.fillStyle = t.targeting===m ? '#fff' : 'rgba(255,255,255,0.35)';
      ctx.font = '600 8px Nunito'; ctx.textAlign = 'center';
      ctx.fillText(m.toUpperCase(), tbx+25, tgtY+16);
    });

    var btnY = tgtY+30;
    if (uc) {
      ctx.fillStyle = money>=uc ? '#43a047' : 'rgba(255,255,255,0.06)';
      roundRect(ctx, SIDE_X+20, btnY, 110, 28, 6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 10px Nunito'; ctx.textAlign = 'center';
      ctx.fillText('\u2B06 UPGRADE $'+uc, SIDE_X+75, btnY+18);
    }
    ctx.fillStyle = '#c62828'; roundRect(ctx, SIDE_X+140, btnY, 100, 28, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 10px Nunito'; ctx.textAlign = 'center';
    ctx.fillText('SELL $'+sv, SIDE_X+190, btnY+18);
  }
}


// ═══ PATH ARROWS ═══
function drawPathArrows() {
  if (waveActive) return;
  const path=currentMap.path, t=performance.now()/1000;
  ctx.fillStyle='rgba(255,255,255,0.2)';
  for (let i=1;i<path.length;i++) {
    const ax=path[i-1][0],ay=path[i-1][1],bx=path[i][0],by=path[i][1];
    const dx=bx-ax,dy=by-ay,len=Math.sqrt(dx*dx+dy*dy);
    for (let j=0;j<Math.floor(len/50);j++) {
      const f=((j/(len/50))+t*0.15)%1;
      ctx.save(); ctx.translate(ax+dx*f,ay+dy*f);
      ctx.rotate(Math.atan2(dy,dx));
      ctx.beginPath(); ctx.moveTo(5,0); ctx.lineTo(-3,-3); ctx.lineTo(-3,3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}

// ═══ MAIN DRAW ═══
function draw() {
  ctx.clearRect(0,0,W,H);
  if (state==='menu'){drawMenu();return;}

  // Game area
  ctx.save(); ctx.beginPath(); ctx.rect(0,0,MAP_W,H); ctx.clip();
  drawMap(ctx,currentMap,MAP_W,H);
  drawPathArrows();

  // Tower hover detection
  hoveredTowerIdx = -1;
  if (!placingType && !draggingTower) {
    for (let i=0;i<towers.length;i++) {
      const dx=towers[i].x-mouseX,dy=towers[i].y-mouseY;
      if (dx*dx+dy*dy<20*20) {hoveredTowerIdx=i;break;}
    }
  }

  towers.forEach((t,i) => {
    if (draggingTower===i) return;
    const s=getTowerStats(t.typeId,t.level);
    drawTower(ctx,t,s,selectedTower===i,hoveredTowerIdx===i);
  });

  for (const e of enemies) if(e.alive) drawEnemy(ctx,e);
  for (const p of projectiles) drawProjectile(ctx,p);
  for (const fx of effects) drawEffect(ctx,fx);

  // Placement preview
  if (placingType && mouseX<MAP_W) {
    const s=getTowerStats(placingType,0);
    const ok=canPlace(mouseX,mouseY);
    ctx.globalAlpha=0.4;
    ctx.strokeStyle=ok?'#43a047':'#e53935'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(mouseX,mouseY,s.range,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle=ok?s.type.color:'#e53935';
    ctx.beginPath(); ctx.arc(mouseX,mouseY,14,0,Math.PI*2); ctx.fill();
    ctx.font='14px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.fillText(s.type.icon,mouseX,mouseY);
    ctx.textBaseline='alphabetic';
    ctx.globalAlpha=1;
  }

  // Drag preview
  if (draggingTower!==null && mouseX<MAP_W) {
    const t=towers[draggingTower],s=getTowerStats(t.typeId,t.level);
    const ok=canPlace(mouseX,mouseY,draggingTower);
    ctx.globalAlpha=0.4;
    ctx.strokeStyle=ok?'#2196F3':'#e53935'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(mouseX,mouseY,s.range,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle=ok?s.type.color:'#e53935';
    ctx.beginPath(); ctx.arc(mouseX,mouseY,14,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
  }

  // Paused overlay
  if (paused) {
    ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(0,0,MAP_W,H);
    ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font='900 32px Nunito'; ctx.textAlign='center';
    ctx.fillText('PAUSED',MAP_W/2,H/2);
    ctx.font='400 13px Nunito'; ctx.fillStyle='rgba(255,255,255,0.3)';
    ctx.fillText('Press SPACE to resume',MAP_W/2,H/2+28);
  }
  ctx.restore();

  // Sidebar
  drawSidebar();

  // End screens
  if (state==='gameover'||state==='victory') {
    ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#fff'; ctx.font='900 36px Nunito'; ctx.textAlign='center';
    ctx.fillText(state==='victory'?'🏆 VICTORY':'💀 GAME OVER',W/2,H/2-40);
    ctx.font='600 16px Nunito'; ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.fillText('Score: '+score+'  ·  Waves: '+wave+'/'+waves.length,W/2,H/2);
    ctx.fillStyle='#43a047'; roundRect(ctx,W/2-70,H/2+20,140,42,10); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='800 15px Nunito'; ctx.fillText('MENU',W/2,H/2+46);
  }
}

// ═══ INPUT ═══
canvas.addEventListener('mousemove', e => {
  const r=canvas.getBoundingClientRect();
  mouseX=(e.clientX-r.left)*(W/r.width); mouseY=(e.clientY-r.top)*(H/r.height);
});

canvas.addEventListener('mousedown', e => {
  if (state!=='playing') return;
  const r=canvas.getBoundingClientRect();
  const cx=(e.clientX-r.left)*(W/r.width), cy=(e.clientY-r.top)*(H/r.height);
  if (selectedTower!==null&&!placingType&&cx<MAP_W) {
    const t=towers[selectedTower],dx=t.x-cx,dy=t.y-cy;
    if (dx*dx+dy*dy<20*20){draggingTower=selectedTower;dragOrigX=t.x;dragOrigY=t.y;}
  }
});

canvas.addEventListener('mouseup', () => {
  if (draggingTower!==null) {
    const t=towers[draggingTower],s=getTowerStats(t.typeId,t.level);
    const cost=Math.floor(s.cost*0.15);
    if (canPlace(mouseX,mouseY,draggingTower)&&mouseX<MAP_W&&money>=cost) {
      money-=cost; t.x=mouseX; t.y=mouseY;
      effects.push({type:'text',x:mouseX,y:mouseY-20,text:'Moved -$'+cost,color:'#2196F3',alpha:1});
    } else { t.x=dragOrigX; t.y=dragOrigY; }
    draggingTower=null;
  }
});

canvas.addEventListener('click', e => {
  const r=canvas.getBoundingClientRect();
  const cx=(e.clientX-r.left)*(W/r.width), cy=(e.clientY-r.top)*(H/r.height);

  if (state==='menu') {
    MAPS.forEach((m,i) => {
      const x=160+i*260,y=140,w=220,h=260;
      if (cx>=x&&cx<=x+w&&cy>=y+h-48&&cy<=y+h-14) startGame(i);
      if (cx>=x&&cx<=x+w&&cy>=y&&cy<=y+h) mapIndex=i;
    });
    return;
  }
  if (state==='gameover'||state==='victory') {
    if (cx>W/2-70&&cx<W/2+70&&cy>H/2+20&&cy<H/2+62) state='menu'; return;
  }

  // ── Sidebar clicks ──
  if (cx >= SIDE_X) {
    // Send wave button
    let sy2 = 114;
    if (!waveActive&&wave<waves.length&&cy>sy2&&cy<sy2+32) { startWave(); return; }
    sy2 += 38;
    // Pause
    if (cy>sy2&&cy<sy2+28) {
      if (cx<SIDE_X+52) { paused=!paused; return; }
      [1,2,3].forEach((s,i) => { if(cx>SIDE_X+10+48+48*i&&cx<SIDE_X+10+48+48*i+42) gameSpeed=s; });
      if (cx>SIDE_X+10+48*4) { autoWave=!autoWave; return; }
      return;
    }
    sy2 += 38;
    // Undo
    if (lastPlaced&&performance.now()-lastPlaced.time<3000&&cy>sy2&&cy<sy2+24) { undoPlace(); return; }
    if (lastPlaced&&performance.now()-lastPlaced.time<3000) sy2+=30;
    // Wave preview skip
    if (!waveActive&&wave<waves.length) sy2+=52;
    // Tower shop
    sy2 += 18;
    TOWER_TYPES.forEach((t,i) => {
      const by=sy2+i*56;
      if (cy>by&&cy<by+52&&cx>SIDE_X+10&&cx<SIDE_X+SIDE_W-10) {
        if (money>=t.levels[0].cost) { placingType=placingType===t.id?null:t.id; selectedTower=null; }
      }
    });

    // Selected tower panel buttons
    if (selectedTower!==null&&selectedTower<towers.length) {
      const t=towers[selectedTower],s=getTowerStats(t.typeId,t.level);
      const uc=getUpgradeCost(t.typeId,t.level);
      // Approximate button positions (targeting + upgrade/sell)
      // Targeting
      ['first','last','strong','weak'].forEach((m,i) => {
        const bx=SIDE_X+20+i*55, tgtY=sy2+TOWER_TYPES.length*56+120;
        if (cy>tgtY&&cy<tgtY+22&&cx>bx&&cx<bx+50) t.targeting=m;
      });
      const btnY2=sy2+TOWER_TYPES.length*56+154;
      if (uc&&cy>btnY2&&cy<btnY2+28&&cx>SIDE_X+20&&cx<SIDE_X+130) {
        if (money>=uc){money-=uc;t.level++;effects.push({type:'text',x:t.x,y:t.y-20,text:'Upgraded!',color:'#43a047',alpha:1});}
        return;
      }
      if (cy>btnY2&&cy<btnY2+28&&cx>SIDE_X+140&&cx<SIDE_X+240) {
        money+=Math.floor(s.cost*SELL_PCT);
        effects.push({type:'text',x:t.x,y:t.y-20,text:'Sold!',color:'#e53935',alpha:1});
        towers.splice(selectedTower,1); selectedTower=null; return;
      }
    }
    return;
  }

  // ── Game area clicks ──
  if (placingType&&cx<MAP_W) { placeTower(placingType,cx,cy); return; }
  placingType=null; selectedTower=null;
  for (let i=0;i<towers.length;i++) {
    const dx=towers[i].x-cx,dy=towers[i].y-cy;
    if (dx*dx+dy*dy<20*20){selectedTower=i;return;}
  }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault(); placingType=null; selectedTower=null; draggingTower=null;
});

// ═══ HOTKEYS ═══
window.addEventListener('keydown', e => {
  if (state!=='playing') return;
  if (e.key>='1'&&e.key<='5') {
    const i=+e.key-1;
    if (i<TOWER_TYPES.length&&money>=TOWER_TYPES[i].levels[0].cost){placingType=TOWER_TYPES[i].id;selectedTower=null;}
  }
  if (e.key==='Escape'){placingType=null;selectedTower=null;draggingTower=null;}
  if (e.key==='z'||e.key==='Z') undoPlace();
  if (e.key===' '){e.preventDefault();paused=!paused;}
  if (e.key==='n'||e.key==='N'){if(!waveActive&&wave<waves.length)startWave();}
});

// ═══ LOOP ═══
let lastTime=0;
function loop(now){
  const dt=Math.min((now-lastTime)/1000,0.05);lastTime=now;
  if(state==='playing')update(dt);
  draw();
  requestAnimationFrame(loop);
}

function resize(){
  applyDPR();
  const a=W/H;let cw=innerWidth,ch=innerHeight;
  if(cw/ch>a)cw=ch*a;else ch=cw/a;
  canvas.style.width=cw+'px';canvas.style.height=ch+'px';
}
window.addEventListener('resize',resize);resize();
requestAnimationFrame(loop);
