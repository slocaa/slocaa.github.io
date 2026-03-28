import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

// ═══ RENDERER ═══
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010103);
scene.fog = new THREE.FogExp2(0x010103, 0.015);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 1.65, 0);

// ═══ ROOM CONFIG ═══
const CELL = 12;
const CEIL_H = 5.0;
const GRID = 7;       // 7x7 = 49 rooms (way less than 121)
const HALF = Math.floor(GRID / 2);

// ═══ SHARED MATERIALS (reuse, don't recreate) ═══
const wallMat = new THREE.MeshStandardMaterial({
  color: 0x999aaa,
  metalness: 0.97,
  roughness: 0.03
});

const ceilMat = new THREE.MeshStandardMaterial({
  color: 0x0c0c10,
  metalness: 0.5,
  roughness: 0.3
});

// Light panels — subtle glow, NOT blinding
const panelMat = new THREE.MeshStandardMaterial({
  color: 0xeee8dd,
  emissive: 0xddd5c8,
  emissiveIntensity: 0.6  // was 2.0 — way too much
});

// ═══ SHARED GEOMETRY (create once, reuse) ═══
const wallGeo = new THREE.PlaneGeometry(CELL, CEIL_H);
const floorGeo = new THREE.PlaneGeometry(CELL, CELL);
const ceilGeo = new THREE.PlaneGeometry(CELL, CELL);
const panelGeo = new THREE.PlaneGeometry(0.8, 0.8);

// ═══ BUILD ROOMS ═══
// Only ONE reflector for the floor directly under the player
const reflectorFloor = new Reflector(new THREE.PlaneGeometry(CELL * GRID, CELL * GRID), {
  clipBias: 0.003,
  textureWidth: 512,
  textureHeight: 512,
  color: 0x080810
});
reflectorFloor.rotation.x = -Math.PI / 2;
reflectorFloor.position.y = 0.001;
scene.add(reflectorFloor);

const rooms = [];

for (let gx = -HALF; gx <= HALF; gx++) {
  for (let gz = -HALF; gz <= HALF; gz++) {
    const g = new THREE.Group();

    // Regular floor (dark, under the reflector)
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
      color: 0x060608, metalness: 0.8, roughness: 0.1
    }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.001;
    g.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = CEIL_H;
    g.add(ceil);

    // 4 small light panels on ceiling
    for (let lx = -1; lx <= 1; lx += 2) {
      for (let lz = -1; lz <= 1; lz += 2) {
        const p = new THREE.Mesh(panelGeo, panelMat);
        p.rotation.x = Math.PI / 2;
        p.position.set(lx * 2.8, CEIL_H - 0.01, lz * 2.8);
        g.add(p);
      }
    }

    // 4 walls — shared material
    const w1 = new THREE.Mesh(wallGeo, wallMat);
    w1.position.set(CELL / 2, CEIL_H / 2, 0);
    w1.rotation.y = -Math.PI / 2;
    g.add(w1);

    const w2 = new THREE.Mesh(wallGeo, wallMat);
    w2.position.set(-CELL / 2, CEIL_H / 2, 0);
    w2.rotation.y = Math.PI / 2;
    g.add(w2);

    const w3 = new THREE.Mesh(wallGeo, wallMat);
    w3.position.set(0, CEIL_H / 2, CELL / 2);
    w3.rotation.y = Math.PI;
    g.add(w3);

    const w4 = new THREE.Mesh(wallGeo, wallMat);
    w4.position.set(0, CEIL_H / 2, -CELL / 2);
    g.add(w4);

    g.position.set(gx * CELL, 0, gz * CELL);
    scene.add(g);
    rooms.push({ group: g, gx, gz });
  }
}

// ═══ LIGHTING — minimal, clean ═══
scene.add(new THREE.AmbientLight(0x222233, 0.5));

// Just 2 point lights that follow the player — no 25 rect area lights
const pLight1 = new THREE.PointLight(0xffeedd, 4, 30, 1.5);
scene.add(pLight1);
const pLight2 = new THREE.PointLight(0xffeedd, 3, 25, 1.5);
scene.add(pLight2);

// ═══ ORBS — actual spheres, properly lit ═══
const ORB_SPACING = 8;
const ORB_GRID = 5;  // 5x5 = 25 orbs (less = faster)
const ORB_HALF = Math.floor(ORB_GRID / 2);

// High-poly sphere so it's actually round
const orbGeo = new THREE.SphereGeometry(0.25, 64, 64);

const orbGroup = new THREE.Group();
scene.add(orbGroup);

let orbList = [];
let round = 1;
let won = false;

function spawnOrbs() {
  // Clear old
  for (const o of orbList) {
    orbGroup.remove(o.mesh);
    if (o.light) scene.remove(o.light);
    o.mesh.geometry.dispose();
    o.mesh.material.dispose();
  }
  orbList = [];

  const goldOX = Math.floor(Math.random() * ORB_GRID) - ORB_HALF;
  const goldOZ = Math.floor(Math.random() * ORB_GRID) - ORB_HALF;

  let idx = 0;
  for (let ox = -ORB_HALF; ox <= ORB_HALF; ox++) {
    for (let oz = -ORB_HALF; oz <= ORB_HALF; oz++) {
      const isGold = (ox === goldOX && oz === goldOZ);

      let mat;
      if (isGold) {
        mat = new THREE.MeshStandardMaterial({
          color: 0xffd700,
          emissive: 0xcc8800,
          emissiveIntensity: 0.4,
          metalness: 0.9,
          roughness: 0.08
        });
      } else {
        const hue = (idx * 0.137 + 0.05) % 1.0;
        const c = new THREE.Color().setHSL(hue, 0.5, 0.4);
        mat = new THREE.MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: 0.15,
          metalness: 0.7,
          roughness: 0.12
        });
      }

      const mesh = new THREE.Mesh(orbGeo.clone(), mat);
      const wx = camera.position.x + ox * ORB_SPACING;
      const wz = camera.position.z + oz * ORB_SPACING;
      const wy = 1.2 + Math.abs(Math.sin(ox * 2.1 + oz * 1.7)) * 1.5;

      mesh.position.set(wx, wy, wz);
      orbGroup.add(mesh);

      // Only gold orb gets a light — saves tons of GPU
      let light = null;
      if (isGold) {
        light = new THREE.PointLight(0xffd700, 1.5, 8, 2);
        light.position.copy(mesh.position);
        scene.add(light);
      }

      orbList.push({
        mesh, light, isGold,
        baseX: wx, baseY: wy, baseZ: wz,
        phase: Math.random() * Math.PI * 2
      });
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

document.getElementById('S').addEventListener('click', () => {
  started = true;
  tStart = performance.now();
  document.getElementById('S').classList.add('gone');
  setTimeout(() => { try { canvas.requestPointerLock(); } catch (e) {} }, 100);
});

// Raycaster
const raycaster = new THREE.Raycaster();
raycaster.far = 20;

canvas.addEventListener('click', () => {
  if (!started) return;
  if (!locked) { try { canvas.requestPointerLock(); } catch (e) {} return; }
  if (won) return;

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(orbGroup.children);

  if (hits.length > 0) {
    const entry = orbList.find(o => o.mesh === hits[0].object);
    if (!entry) return;

    if (entry.isGold) {
      entry.mesh.visible = false;
      if (entry.light) entry.light.intensity = 0;
      won = true;
      document.getElementById('flash').classList.add('on');
      setTimeout(() => document.getElementById('flash').classList.remove('on'), 350);
      const h = document.getElementById('hint');
      h.textContent = '\u2713 Round ' + round;
      h.style.color = 'rgba(100,255,150,.9)';
      h.style.opacity = '1';
      document.getElementById('sbox').textContent = round;
      setTimeout(() => {
        h.style.opacity = '0';
        round++;
        won = false;
        spawnOrbs();
        tStart = performance.now();
        document.getElementById('sbox').textContent = round;
      }, 2000);
    } else {
      entry.mesh.visible = false;
      const h = document.getElementById('hint');
      h.textContent = '\u2717 Wrong';
      h.style.color = 'rgba(255,80,80,.9)';
      h.style.opacity = '1';
      setTimeout(() => { h.style.opacity = '0'; }, 900);
    }
  }
});

// ═══ RESIZE ═══
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ═══ INFINITE ROOM REPOSITIONING ═══
function updateRooms() {
  const pcx = Math.round(camera.position.x / CELL);
  const pcz = Math.round(camera.position.z / CELL);
  for (const r of rooms) {
    r.group.position.x = (r.gx + pcx) * CELL;
    r.group.position.z = (r.gz + pcz) * CELL;
  }
  // Move the single reflector floor to follow player
  reflectorFloor.position.x = pcx * CELL;
  reflectorFloor.position.z = pcz * CELL;
}

// ═══ LOOP ═══
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.getElapsedTime();

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

  camera.rotation.order = 'YXZ';
  camera.rotation.y = -yaw;
  camera.rotation.x = pitch;

  // Lights follow player
  pLight1.position.set(camera.position.x, CEIL_H - 0.2, camera.position.z);
  pLight2.position.set(camera.position.x, 1.5, camera.position.z + 5);

  updateRooms();

  // Animate orbs
  for (const o of orbList) {
    if (!o.mesh.visible) continue;
    o.mesh.position.y = o.baseY + Math.sin(t * 1.2 + o.phase) * 0.12;
    o.mesh.rotation.y = t * 0.3 + o.phase;
    if (o.light) o.light.position.copy(o.mesh.position);
    if (o.isGold) {
      o.mesh.material.emissiveIntensity = 0.3 + 0.15 * Math.sin(t * 2.5);
      if (o.light) o.light.intensity = 1.2 + Math.sin(t * 2.5) * 0.5;
    }
  }

  // Direct render — no bloom pass (was causing the blowout)
  renderer.render(scene, camera);
}

animate();
