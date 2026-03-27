import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

RectAreaLightUniformsLib.init();

// ═══ RENDERER — max quality, no pixelation ═══
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio); // full native resolution — no pixelation
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020204);
scene.fog = new THREE.FogExp2(0x020204, 0.008);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 1.65, 0);

// ═══ POST-PROCESSING — bloom for orb glow ═══
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.4, 0.85);
composer.addPass(bloom);

// ═══ ROOM GEOMETRY ═══
const CELL = 12;   // room cell size
const CEIL_H = 5.5;
const GRID = 11;   // rooms in each direction (11x11 = 121 rooms visible)
const HALF = Math.floor(GRID / 2);

// Mirror wall material — high metalness, low roughness
function mirrorMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x888899,
    metalness: 0.98,
    roughness: 0.02,
    side: THREE.DoubleSide
  });
}

// Ceiling material
const ceilMat = new THREE.MeshStandardMaterial({
  color: 0x111116,
  metalness: 0.6,
  roughness: 0.25
});

// Light panel material (emissive)
const panelMat = new THREE.MeshStandardMaterial({
  color: 0xfff8ee,
  emissive: 0xfff0dd,
  emissiveIntensity: 2.0
});

// Wall segment with panel grid lines
function createWall(w, h) {
  return new THREE.PlaneGeometry(w, h);
}

// ═══ BUILD ROOM GRID ═══
// We build a grid of rooms around the player and reposition them as the player moves
const wallGeo = createWall(CELL, CEIL_H);
const floorGeo = new THREE.PlaneGeometry(CELL, CELL);
const ceilGeo = new THREE.PlaneGeometry(CELL, CELL);
const panelGeo = new THREE.PlaneGeometry(1.2, 1.2);

const rooms = []; // array of {group, cx, cz}

for (let gx = -HALF; gx <= HALF; gx++) {
  for (let gz = -HALF; gz <= HALF; gz++) {
    const g = new THREE.Group();

    // Floor — reflective mirror
    const floor = new Reflector(floorGeo.clone(), {
      clipBias: 0.003,
      textureWidth: 512,
      textureHeight: 512,
      color: 0x111118
    });
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    g.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(ceilGeo.clone(), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = CEIL_H;
    g.add(ceil);

    // 4 light panels on ceiling
    for (let lx = -1; lx <= 1; lx += 2) {
      for (let lz = -1; lz <= 1; lz += 2) {
        const p = new THREE.Mesh(panelGeo.clone(), panelMat);
        p.rotation.x = Math.PI / 2;
        p.position.set(lx * 2.5, CEIL_H - 0.01, lz * 2.5);
        g.add(p);
      }
    }

    // 4 walls
    // +X wall
    const w1 = new THREE.Mesh(wallGeo.clone(), mirrorMat());
    w1.position.set(CELL / 2, CEIL_H / 2, 0);
    w1.rotation.y = -Math.PI / 2;
    g.add(w1);
    // -X wall
    const w2 = new THREE.Mesh(wallGeo.clone(), mirrorMat());
    w2.position.set(-CELL / 2, CEIL_H / 2, 0);
    w2.rotation.y = Math.PI / 2;
    g.add(w2);
    // +Z wall
    const w3 = new THREE.Mesh(wallGeo.clone(), mirrorMat());
    w3.position.set(0, CEIL_H / 2, CELL / 2);
    w3.rotation.y = Math.PI;
    g.add(w3);
    // -Z wall
    const w4 = new THREE.Mesh(wallGeo.clone(), mirrorMat());
    w4.position.set(0, CEIL_H / 2, -CELL / 2);
    g.add(w4);

    g.position.set(gx * CELL, 0, gz * CELL);
    scene.add(g);
    rooms.push({ group: g, gx, gz });
  }
}

// ═══ LIGHTING ═══
// Rect area lights per visible area
const aLight = new THREE.AmbientLight(0x222233, 0.4);
scene.add(aLight);

// Central area lights
for (let lx = -2; lx <= 2; lx++) {
  for (let lz = -2; lz <= 2; lz++) {
    const rl = new THREE.RectAreaLight(0xffeedd, 6, 2.0, 2.0);
    rl.position.set(lx * CELL, CEIL_H - 0.05, lz * CELL);
    rl.rotation.x = Math.PI;
    scene.add(rl);
  }
}

// A couple of point lights that follow the player for local illumination
const pLight1 = new THREE.PointLight(0xffeedd, 3, 20, 1.5);
pLight1.castShadow = true;
pLight1.shadow.mapSize.set(1024, 1024);
scene.add(pLight1);

const pLight2 = new THREE.PointLight(0x8888ff, 1.5, 25, 1.5);
scene.add(pLight2);

// ═══ ORBS — equally spaced grid ═══
const ORB_SPACING = 8; // distance between orbs
const ORB_GRID = 7;    // 7x7 = 49 orbs visible
const ORB_HALF = Math.floor(ORB_GRID / 2);

const orbGeo = new THREE.SphereGeometry(0.22, 48, 48);
const orbGroup = new THREE.Group();
scene.add(orbGroup);

let goldOrb = null;
let orbList = []; // {mesh, light, isGold, basePos, phase}
let round = 1;
let won = false;

function goldMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffaa00,
    emissiveIntensity: 1.2,
    metalness: 0.95,
    roughness: 0.05
  });
}

function decoyMat(i) {
  const hue = (i * 0.137 + 0.05) % 1.0;
  const c = new THREE.Color().setHSL(hue, 0.6, 0.45);
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: 0.5,
    metalness: 0.6,
    roughness: 0.15,
    transparent: true,
    opacity: 0.9
  });
}

function spawnOrbs() {
  // Clear
  while (orbGroup.children.length) {
    const c = orbGroup.children[0];
    orbGroup.remove(c);
  }
  for (const o of orbList) {
    if (o.light) scene.remove(o.light);
  }
  orbList = [];

  // Pick random gold position in the grid
  const goldGX = Math.floor(Math.random() * ORB_GRID) - ORB_HALF;
  const goldGZ = Math.floor(Math.random() * ORB_GRID) - ORB_HALF;

  let idx = 0;
  for (let ox = -ORB_HALF; ox <= ORB_HALF; ox++) {
    for (let oz = -ORB_HALF; oz <= ORB_HALF; oz++) {
      const isGold = (ox === goldGX && oz === goldGZ);
      const mat = isGold ? goldMat() : decoyMat(idx);
      const mesh = new THREE.Mesh(orbGeo, mat);

      const wx = camera.position.x + ox * ORB_SPACING;
      const wz = camera.position.z + oz * ORB_SPACING;
      const wy = 1.5 + Math.sin(ox * 3.7 + oz * 2.3) * 0.8;

      mesh.position.set(wx, wy, wz);
      mesh.castShadow = true;
      orbGroup.add(mesh);

      // Point light per orb
      const lc = isGold ? 0xffd700 : mat.color.getHex();
      const li = new THREE.PointLight(lc, isGold ? 3 : 1, 6, 2);
      li.position.copy(mesh.position);
      scene.add(li);

      const entry = {
        mesh, light: li, isGold,
        baseX: wx, baseY: wy, baseZ: wz,
        phase: Math.random() * Math.PI * 2
      };
      orbList.push(entry);
      if (isGold) goldOrb = entry;
      idx++;
    }
  }
}

spawnOrbs();

// ═══ PLAYER ═══
let yaw = 0, pitch = 0;
const keys = {};
let started = false, tStart = 0;

window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });

let locked = false;
window.addEventListener('mousemove', e => {
  if (!started || !locked) return;
  yaw += e.movementX * 0.0018;
  pitch -= e.movementY * 0.0018;
  pitch = Math.max(-1.4, Math.min(1.4, pitch));
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
});

document.getElementById('go').addEventListener('click', () => {
  canvas.requestPointerLock();
  started = true;
  tStart = performance.now();
  document.getElementById('S').classList.add('gone');
});

// Raycaster for clicking orbs
const raycaster = new THREE.Raycaster();
raycaster.far = 25;

canvas.addEventListener('click', () => {
  if (!started) return;
  if (!locked) { try { canvas.requestPointerLock(); } catch (e) {} return; }
  if (won) return;

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(orbGroup.children);

  if (hits.length > 0) {
    const hitMesh = hits[0].object;
    const entry = orbList.find(o => o.mesh === hitMesh);
    if (!entry) return;

    if (entry.isGold) {
      // Correct!
      entry.mesh.visible = false;
      entry.light.intensity = 0;
      won = true;

      document.getElementById('flash').classList.add('on');
      setTimeout(() => document.getElementById('flash').classList.remove('on'), 350);

      const h = document.getElementById('hint');
      h.textContent = '✓ Round ' + round + ' cleared!';
      h.style.color = 'rgba(100,255,150,.95)';
      h.style.opacity = '1';
      document.getElementById('sbox').textContent = 'Round ' + round + ' cleared!';

      setTimeout(() => {
        h.style.opacity = '0';
        round++;
        won = false;
        spawnOrbs();
        tStart = performance.now();
        document.getElementById('sbox').textContent = 'Round ' + round + ' — Find the GOLD orb';
      }, 2200);
    } else {
      // Wrong
      entry.mesh.visible = false;
      entry.light.intensity = 0;
      const h = document.getElementById('hint');
      h.textContent = '✗ Wrong orb!';
      h.style.color = 'rgba(255,80,80,.95)';
      h.style.opacity = '1';
      setTimeout(() => { h.style.opacity = '0'; }, 1100);
    }
  }
});

// ═══ RESIZE ═══
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
});

// ═══ INFINITE ROOM REPOSITIONING ═══
// As the player moves, shift room tiles so they always surround the player
function updateRooms() {
  const pcx = Math.round(camera.position.x / CELL);
  const pcz = Math.round(camera.position.z / CELL);

  for (const r of rooms) {
    r.group.position.x = (r.gx + pcx) * CELL;
    r.group.position.z = (r.gz + pcz) * CELL;
  }
}

// ═══ GAME LOOP ═══
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

  // Movement — infinite, no bounds
  if (started && !won) {
    const sp = 5.0 * dt;
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = Math.sin(yaw);

    if (keys.KeyW) { camera.position.x += fx * sp; camera.position.z += fz * sp; }
    if (keys.KeyS) { camera.position.x -= fx * sp; camera.position.z -= fz * sp; }
    if (keys.KeyA) { camera.position.x -= rx * sp; camera.position.z -= rz * sp; }
    if (keys.KeyD) { camera.position.x += rx * sp; camera.position.z += rz * sp; }

    const el = (performance.now() - tStart) / 1000;
    const mn = Math.floor(el / 60), sc = Math.floor(el % 60);
    document.getElementById('tbox').textContent = mn + ':' + (sc < 10 ? '0' : '') + sc;
  }

  // Camera rotation
  camera.rotation.order = 'YXZ';
  camera.rotation.y = -yaw;
  camera.rotation.x = pitch;

  // Lights follow player
  pLight1.position.set(camera.position.x, CEIL_H - 0.3, camera.position.z);
  pLight2.position.set(camera.position.x + 3, 2, camera.position.z + 3);

  // Reposition room tiles for infinite effect
  updateRooms();

  // Animate orbs
  for (const o of orbList) {
    if (!o.mesh.visible) continue;
    o.mesh.position.y = o.baseY + Math.sin(t * 1.5 + o.phase) * 0.15;
    o.mesh.rotation.y = t * 0.4 + o.phase;
    o.light.position.copy(o.mesh.position);

    if (o.isGold) {
      o.mesh.material.emissiveIntensity = 0.8 + 0.5 * Math.sin(t * 3);
      o.light.intensity = 2 + Math.sin(t * 3) * 1.5;
    }
  }

  // Render with bloom
  composer.render();
}

animate();
