(() => {
"use strict";

const canvas = document.getElementById("c");
const gl = canvas.getContext("webgl");
if (!gl) { document.body.textContent = "WebGL required"; return; }

// ══════════════════════════════════════════════════
// FRAGMENT SHADER — Raymarched mirror room with
// reflective walls, glowing orbs, and infinite
// reflections that make reality hard to parse.
// ══════════════════════════════════════════════════

const FRAG = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec2 uCamRot; // yaw, pitch
uniform vec4 uOrbs[5]; // xyz = position, w = 1 if active
uniform float uCollectAnim; // flash on collect

#define MAX_STEPS 100
#define MAX_DIST 60.0
#define SURF 0.002
#define MAX_BOUNCES 6

mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}

// Room dimensions
const vec3 ROOM = vec3(6.0, 3.5, 8.0);

// Signed distance to the inside of a box (room)
float sdRoom(vec3 p) {
  vec3 d = abs(p) - ROOM;
  // We want the INSIDE, so negate
  return -min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// Distance to room walls (inverted box)
float mapRoom(vec3 p) {
  vec3 q = abs(p);
  // Distance to nearest wall from inside
  vec3 d = ROOM - q;
  return min(d.x, min(d.y, d.z));
}

// Orb distance
float sdOrb(vec3 p, vec3 center) {
  return length(p - center) - 0.2;
}

// Full scene
float mapScene(vec3 p, out int hitType) {
  float room = mapRoom(p);
  hitType = 0; // 0=room wall (mirror)

  float orbs = 1e10;
  for (int i = 0; i < 5; i++) {
    if (uOrbs[i].w > 0.5) {
      float od = sdOrb(p, uOrbs[i].xyz);
      if (od < orbs) orbs = od;
    }
  }

  if (orbs < room) {
    hitType = 1; // orb
    return orbs;
  }
  return room;
}

// Normal from distance field
vec3 getNormal(vec3 p) {
  int dummy;
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    mapScene(p+e.xyy, dummy) - mapScene(p-e.xyy, dummy),
    mapScene(p+e.yxy, dummy) - mapScene(p-e.yxy, dummy),
    mapScene(p+e.yyx, dummy) - mapScene(p-e.yyx, dummy)
  ));
}

// March a ray
float march(vec3 ro, vec3 rd, out int hitType) {
  float t = 0.0;
  hitType = -1;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    int ht;
    float d = mapScene(p, ht);
    if (d < SURF) { hitType = ht; return t; }
    if (t > MAX_DIST) break;
    t += d;
  }
  return -1.0;
}

// Orb glow — volumetric approximation
vec3 orbGlow(vec3 ro, vec3 rd) {
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    if (uOrbs[i].w < 0.5) continue;
    vec3 oc = uOrbs[i].xyz;
    // Closest approach of ray to orb center
    float t = max(dot(oc - ro, rd), 0.0);
    vec3 cp = ro + rd * t - oc;
    float dist = length(cp);
    // Glow intensity
    float g = 0.04 / (dist * dist + 0.01);
    // Pulsing
    float pulse = 0.7 + 0.3 * sin(uTime * 3.0 + float(i) * 1.5);
    // Color varies per orb
    vec3 col = 0.5 + 0.5 * cos(6.28 * (float(i) * 0.2 + vec3(0.0, 0.33, 0.67)));
    glow += col * g * pulse;
  }
  return glow;
}

// Mirror tint — slight color based on wall normal
vec3 mirrorTint(vec3 n) {
  vec3 an = abs(n);
  // Floor/ceiling slightly warm, walls slightly cool
  if (an.y > 0.9) return vec3(0.92, 0.90, 0.95);
  if (an.x > 0.9) return vec3(0.88, 0.90, 0.95);
  return vec3(0.90, 0.92, 0.96);
}

// Grid pattern on mirrors — subtle, like real mirror panels
float gridPattern(vec3 p, vec3 n) {
  vec3 an = abs(n);
  vec2 uv;
  if (an.y > 0.9) uv = p.xz;
  else if (an.x > 0.9) uv = p.yz;
  else uv = p.xy;

  vec2 grid = abs(fract(uv * 0.5) - 0.5);
  float line = min(grid.x, grid.y);
  return smoothstep(0.0, 0.02, line);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uRes * 0.5) / min(uRes.x, uRes.y);

  // Camera setup
  vec3 ro = uCamPos;
  vec3 fwd = vec3(sin(uCamRot.x)*cos(uCamRot.y), sin(uCamRot.y), -cos(uCamRot.x)*cos(uCamRot.y));
  vec3 right = normalize(cross(vec3(0,1,0), fwd));
  vec3 up = cross(fwd, right);
  vec3 rd = normalize(fwd + uv.x * right + uv.y * up);

  vec3 col = vec3(0.0);
  vec3 throughput = vec3(1.0); // How much light survives each bounce

  // Trace with reflections
  for (int bounce = 0; bounce < MAX_BOUNCES; bounce++) {
    int hitType;
    float t = march(ro, rd, hitType);

    // Accumulate orb glow along every ray segment
    col += throughput * orbGlow(ro, rd) * 0.3;

    if (t < 0.0) {
      // Missed — dark void (shouldn't happen inside room)
      col += throughput * vec3(0.01);
      break;
    }

    vec3 p = ro + rd * t;
    vec3 n = getNormal(p);

    if (hitType == 1) {
      // Hit an orb — bright emissive
      vec3 orbCol = 0.5 + 0.5 * cos(6.28 * (uTime * 0.1 + vec3(0.0, 0.33, 0.67)));
      col += throughput * orbCol * 2.0;
      break;
    }

    // Hit mirror wall
    // Subtle grid lines on the mirror panels
    float grid = gridPattern(p, n);
    vec3 tint = mirrorTint(n);

    // Edge darkening where panels meet
    col += throughput * tint * (1.0 - grid) * 0.03;

    // Reflect
    rd = reflect(rd, n);
    ro = p + n * 0.01; // Offset to avoid self-intersection

    // Each bounce absorbs a little light — mirrors aren't perfect
    throughput *= tint * 0.88;

    // Diminishing returns
    if (length(throughput) < 0.01) break;
  }

  // Collect flash effect
  col += vec3(0.2, 0.5, 1.0) * uCollectAnim * 0.3;

  // Vignette
  float vig = 1.0 - length(uv) * 0.4;
  col *= vig;

  // Tone map
  col = col / (1.0 + col);
  col = pow(col, vec3(0.9));

  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}`;

function mkShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error("Shader:", gl.getShaderInfoLog(s));
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
  console.error("Link:", gl.getProgramInfoLog(prog));
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
const aLoc = gl.getAttribLocation(prog, "a");
gl.enableVertexAttribArray(aLoc);
gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

const U = {};
["uRes","uTime","uCamPos","uCamRot","uCollectAnim"].forEach(n => U[n] = gl.getUniformLocation(prog, n));

// Orb uniforms (array)
const uOrbs = [];
for (let i = 0; i < 5; i++) uOrbs.push(gl.getUniformLocation(prog, `uOrbs[${i}]`));

// ══════════════════════════════════════
// GAME STATE
// ══════════════════════════════════════

const ROOM = { x: 6, y: 3.5, z: 8 };

// Player
let px = 0, py = 0, pz = 0; // position (y=0 is eye level)
let yaw = 0, pitch = 0;
let started = false;
let score = 0;
let totalOrbs = 5;
let timerStart = 0;
let collectAnim = 0;
let gameWon = false;

// Orbs — placed around the room
let orbs = [];

function spawnOrbs() {
  orbs = [];
  score = 0;
  gameWon = false;
  for (let i = 0; i < totalOrbs; i++) {
    orbs.push({
      x: (Math.random() - 0.5) * (ROOM.x * 2 - 1.5),
      y: (Math.random() - 0.5) * (ROOM.y * 2 - 1.5),
      z: (Math.random() - 0.5) * (ROOM.z * 2 - 1.5),
      active: true
    });
  }
}
spawnOrbs();

// Keys
const keys = {};
window.addEventListener("keydown", e => keys[e.code] = true);
window.addEventListener("keyup", e => keys[e.code] = false);

// Mouse look
window.addEventListener("mousemove", e => {
  if (!started) return;
  if (document.pointerLockElement !== canvas) return;
  yaw += e.movementX * 0.002;
  pitch -= e.movementY * 0.002;
  pitch = Math.max(-1.4, Math.min(1.4, pitch));
});

// Click to collect
canvas.addEventListener("click", () => {
  if (!started) return;
  tryCollect();
});

// Pointer lock
const startScreen = document.getElementById("start-screen");
startScreen.addEventListener("click", () => {
  canvas.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas && !started) {
    started = true;
    timerStart = performance.now();
    startScreen.classList.add("hidden");
  }
});

// ── Collect orb if looking at one ──
function tryCollect() {
  const fwd = [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  ];

  for (let i = 0; i < orbs.length; i++) {
    if (!orbs[i].active) continue;
    // Vector from player to orb
    const dx = orbs[i].x - px;
    const dy = orbs[i].y - py;
    const dz = orbs[i].z - pz;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist > 12) continue;

    // Dot product — are we looking at it?
    const dot = (dx*fwd[0] + dy*fwd[1] + dz*fwd[2]) / dist;
    if (dot > 0.92) { // ~23 degree cone
      orbs[i].active = false;
      score++;
      collectAnim = 1.0;
      document.getElementById("score-box").textContent = `✦ ${score} / ${totalOrbs}`;

      // Flash
      const flash = document.getElementById("collect-flash");
      flash.classList.add("show");
      setTimeout(() => flash.classList.remove("show"), 200);

      if (score >= totalOrbs) {
        gameWon = true;
        document.getElementById("msg").textContent = "🎉 ALL ORBS FOUND — click to play again";
        document.getElementById("msg").style.color = "rgba(100,200,255,.7)";
        // Allow restart
        setTimeout(() => {
          canvas.addEventListener("click", restart, { once: true });
        }, 500);
      }
      return;
    }
  }
}

function restart() {
  spawnOrbs();
  px = 0; py = 0; pz = 0;
  timerStart = performance.now();
  document.getElementById("score-box").textContent = `✦ 0 / ${totalOrbs}`;
  document.getElementById("msg").textContent = "WASD move · Mouse look · Click to collect orbs";
  document.getElementById("msg").style.color = "rgba(255,255,255,.3)";
}

// ══════════════════════════════════════
// RESIZE & RENDER LOOP
// ══════════════════════════════════════

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // Cap for perf
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);
resize();

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // ── Movement ──
  if (started && !gameWon) {
    const speed = 3.5 * dt;
    const fwdX = Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = Math.sin(yaw);

    if (keys["KeyW"]) { px += fwdX * speed; pz += fwdZ * speed; }
    if (keys["KeyS"]) { px -= fwdX * speed; pz -= fwdZ * speed; }
    if (keys["KeyA"]) { px -= rightX * speed; pz -= rightZ * speed; }
    if (keys["KeyD"]) { px += rightX * speed; pz += rightZ * speed; }

    // Clamp to room bounds (with margin)
    const margin = 0.3;
    px = Math.max(-ROOM.x + margin, Math.min(ROOM.x - margin, px));
    pz = Math.max(-ROOM.z + margin, Math.min(ROOM.z - margin, pz));
    // py stays at 0 (eye level)
  }

  // Timer
  if (started && !gameWon) {
    const elapsed = (now - timerStart) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    document.getElementById("timer-box").textContent = `⏱ ${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Collect animation decay
  collectAnim *= 0.92;

  // ── Render ──
  const t = now / 1000;

  gl.uniform2f(U.uRes, canvas.width, canvas.height);
  gl.uniform1f(U.uTime, t);
  gl.uniform3f(U.uCamPos, px, py, pz);
  gl.uniform2f(U.uCamRot, yaw, pitch);
  gl.uniform1f(U.uCollectAnim, collectAnim);

  // Upload orb positions
  for (let i = 0; i < 5; i++) {
    const o = orbs[i];
    // Orbs bob up and down gently
    const bobY = o.active ? Math.sin(t * 1.5 + i * 2.0) * 0.15 : 0;
    gl.uniform4f(uOrbs[i], o.x, o.y + bobY, o.z, o.active ? 1.0 : 0.0);
  }

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

})();
