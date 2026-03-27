(function () {
  "use strict";

  // ═══ SCENE SETUP ═══
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050508);
  scene.fog = new THREE.FogExp2(0x050508, 0.012);

  var camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 1.6, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.appendChild(renderer.domElement);

  // ═══ MIRROR ROOM ═══
  // We create a large room with reflective walls using CubeCamera for real reflections
  var roomW = 14, roomH = 6, roomD = 20;

  // CubeCamera for reflections
  var cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
    format: THREE.RGBFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
  });
  var cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
  scene.add(cubeCamera);

  // Mirror material
  var mirrorMat = new THREE.MeshStandardMaterial({
    color: 0xaaaacc,
    metalness: 0.97,
    roughness: 0.03,
    envMap: cubeRenderTarget.texture,
    envMapIntensity: 1.5
  });

  // Floor — dark polished
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x111118,
    metalness: 0.8,
    roughness: 0.1,
    envMap: cubeRenderTarget.texture,
    envMapIntensity: 1.0
  });

  // Ceiling
  var ceilMat = new THREE.MeshStandardMaterial({
    color: 0x181820,
    metalness: 0.5,
    roughness: 0.3,
    envMap: cubeRenderTarget.texture,
    envMapIntensity: 0.5
  });

  // Build room walls
  function makeWall(w, h, mat, pos, rotY, rotX) {
    var geo = new THREE.PlaneGeometry(w, h);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (rotY) mesh.rotation.y = rotY;
    if (rotX) mesh.rotation.x = rotX;
    scene.add(mesh);
    return mesh;
  }

  // Floor & ceiling
  makeWall(roomW, roomD, floorMat, [0, 0, 0], 0, -Math.PI / 2);
  makeWall(roomW, roomD, ceilMat, [0, roomH, 0], 0, Math.PI / 2);
  // Left & right walls
  makeWall(roomD, roomH, mirrorMat, [-roomW / 2, roomH / 2, 0], Math.PI / 2, 0);
  makeWall(roomD, roomH, mirrorMat, [roomW / 2, roomH / 2, 0], -Math.PI / 2, 0);
  // Front & back walls
  makeWall(roomW, roomH, mirrorMat, [0, roomH / 2, -roomD / 2], 0, 0);
  makeWall(roomW, roomH, mirrorMat, [0, roomH / 2, roomD / 2], Math.PI, 0);

  // ═══ LIGHTING ═══
  // Ceiling light strips
  var light1 = new THREE.RectAreaLight(0xffeedd, 8, 1.5, roomD * 0.7);
  light1.position.set(3, roomH - 0.05, 0);
  light1.rotation.x = Math.PI;
  scene.add(light1);

  var light2 = new THREE.RectAreaLight(0xffeedd, 8, 1.5, roomD * 0.7);
  light2.position.set(-3, roomH - 0.05, 0);
  light2.rotation.x = Math.PI;
  scene.add(light2);

  // Light panel meshes (visible glowing rectangles on ceiling)
  var panelGeo = new THREE.PlaneGeometry(1.5, roomD * 0.7);
  var panelMat = new THREE.MeshBasicMaterial({ color: 0xfff5e6, transparent: true, opacity: 0.9 });
  var panel1 = new THREE.Mesh(panelGeo, panelMat);
  panel1.position.set(3, roomH - 0.02, 0);
  panel1.rotation.x = Math.PI / 2;
  scene.add(panel1);
  var panel2 = new THREE.Mesh(panelGeo, panelMat);
  panel2.position.set(-3, roomH - 0.02, 0);
  panel2.rotation.x = Math.PI / 2;
  scene.add(panel2);

  // Ambient fill
  scene.add(new THREE.AmbientLight(0x222233, 0.3));

  // Point lights for extra depth
  var pl1 = new THREE.PointLight(0x6688ff, 2, 15);
  pl1.position.set(0, 4, 5);
  scene.add(pl1);
  var pl2 = new THREE.PointLight(0xff6644, 1.5, 15);
  pl2.position.set(0, 4, -5);
  scene.add(pl2);

  // ═══ ORBS ═══
  var orbGroup = new THREE.Group();
  scene.add(orbGroup);

  var NUM_DECOYS = 8;
  var orbData = [];
  var goldIndex = -1;

  function randomInRoom() {
    return {
      x: (Math.random() - 0.5) * (roomW - 3),
      y: 0.8 + Math.random() * (roomH - 2.5),
      z: (Math.random() - 0.5) * (roomD - 3)
    };
  }

  function spawnOrbs() {
    // Clear old
    while (orbGroup.children.length) orbGroup.remove(orbGroup.children[0]);
    orbData = [];

    goldIndex = Math.floor(Math.random() * (NUM_DECOYS + 1));

    for (var i = 0; i <= NUM_DECOYS; i++) {
      var isGold = i === goldIndex;
      var geo = new THREE.SphereGeometry(0.2, 32, 32);
      var mat;

      if (isGold) {
        mat = new THREE.MeshStandardMaterial({
          color: 0xffd700,
          emissive: 0xffa000,
          emissiveIntensity: 0.8,
          metalness: 0.9,
          roughness: 0.1,
          envMap: cubeRenderTarget.texture,
          envMapIntensity: 1.0
        });
      } else {
        // Decoy — various colors, slightly transparent
        var hue = Math.random();
        var col = new THREE.Color().setHSL(hue, 0.7, 0.5);
        mat = new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.4,
          metalness: 0.5,
          roughness: 0.2,
          transparent: true,
          opacity: 0.85,
          envMap: cubeRenderTarget.texture,
          envMapIntensity: 0.5
        });
      }

      var mesh = new THREE.Mesh(geo, mat);
      var pos = randomInRoom();
      mesh.position.set(pos.x, pos.y, pos.z);
      orbGroup.add(mesh);

      // Point light on each orb
      var orbLight = new THREE.PointLight(
        isGold ? 0xffd700 : mat.color.getHex(),
        isGold ? 2 : 0.8,
        5
      );
      orbLight.position.copy(mesh.position);
      scene.add(orbLight);

      orbData.push({
        mesh: mesh,
        light: orbLight,
        gold: isGold,
        baseY: pos.y,
        phase: Math.random() * Math.PI * 2,
        collected: false
      });
    }
  }

  spawnOrbs();

  // ═══ PLAYER CONTROLS ═══
  var yaw = 0, pitch = 0;
  var keys = {};
  var started = false, won = false, round = 1;
  var tStart = 0;

  window.addEventListener("keydown", function (e) { keys[e.code] = true; });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });

  var locked = false;
  window.addEventListener("mousemove", function (e) {
    if (!started || !locked) return;
    yaw += e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
  });

  document.addEventListener("pointerlockchange", function () {
    locked = document.pointerLockElement === renderer.domElement;
  });

  // Start
  document.getElementById("go").addEventListener("click", function () {
    renderer.domElement.requestPointerLock();
    started = true;
    tStart = performance.now();
    document.getElementById("start").classList.add("gone");
  });

  // Click to collect
  var raycaster = new THREE.Raycaster();
  raycaster.far = 20;

  renderer.domElement.addEventListener("click", function () {
    if (!started) return;
    if (!locked) {
      renderer.domElement.requestPointerLock();
      return;
    }
    if (won) return;

    // Raycast from center of screen
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    var hits = raycaster.intersectObjects(orbGroup.children);

    if (hits.length > 0) {
      var hitMesh = hits[0].object;
      // Find which orb
      for (var i = 0; i < orbData.length; i++) {
        if (orbData[i].mesh === hitMesh && !orbData[i].collected) {
          if (orbData[i].gold) {
            // Correct!
            orbData[i].collected = true;
            hitMesh.visible = false;
            orbData[i].light.intensity = 0;
            won = true;

            document.getElementById("flash").classList.add("on");
            setTimeout(function () { document.getElementById("flash").classList.remove("on"); }, 300);

            var hint = document.getElementById("hint");
            hint.textContent = "✓ ESCAPED — Round " + round + " complete!";
            hint.style.opacity = "1";
            hint.style.color = "rgba(100,255,150,.9)";

            document.getElementById("scorebox").textContent = "Round " + round + " cleared!";

            // Next round after delay
            setTimeout(function () {
              hint.style.opacity = "0";
              round++;
              NUM_DECOYS = Math.min(NUM_DECOYS + 2, 25);
              spawnOrbs();
              won = false;
              tStart = performance.now();
              document.getElementById("scorebox").textContent = "Round " + round + " — Find the GOLD orb (" + (NUM_DECOYS + 1) + " orbs)";
            }, 2500);
          } else {
            // Wrong orb!
            orbData[i].collected = true;
            hitMesh.visible = false;
            orbData[i].light.intensity = 0;

            var hint = document.getElementById("hint");
            hint.textContent = "✗ Wrong orb!";
            hint.style.opacity = "1";
            hint.style.color = "rgba(255,80,80,.9)";
            setTimeout(function () { hint.style.opacity = "0"; }, 1200);
          }
          break;
        }
      }
    }
  });

  // ═══ RESIZE ═══
  window.addEventListener("resize", function () {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ═══ GAME LOOP ═══
  var frameCount = 0;

  function animate() {
    requestAnimationFrame(animate);
    var t = performance.now() / 1000;

    // Player movement
    if (started && !won) {
      var speed = 0.08;
      var fwdX = Math.sin(yaw), fwdZ = -Math.cos(yaw);
      var rgtX = Math.cos(yaw), rgtZ = Math.sin(yaw);

      if (keys.KeyW) { camera.position.x += fwdX * speed; camera.position.z += fwdZ * speed; }
      if (keys.KeyS) { camera.position.x -= fwdX * speed; camera.position.z -= fwdZ * speed; }
      if (keys.KeyA) { camera.position.x -= rgtX * speed; camera.position.z -= rgtZ * speed; }
      if (keys.KeyD) { camera.position.x += rgtX * speed; camera.position.z += rgtZ * speed; }

      // Clamp to room
      var mx = roomW / 2 - 0.5, mz = roomD / 2 - 0.5;
      camera.position.x = Math.max(-mx, Math.min(mx, camera.position.x));
      camera.position.z = Math.max(-mz, Math.min(mz, camera.position.z));

      // Timer
      var el = (performance.now() - tStart) / 1000;
      var mn = Math.floor(el / 60), sc = Math.floor(el % 60);
      document.getElementById("timerbox").textContent = mn + ":" + (sc < 10 ? "0" : "") + sc;
    }

    // Camera rotation
    camera.rotation.order = "YXZ";
    camera.rotation.y = -yaw;
    camera.rotation.x = pitch;

    // Bob orbs
    for (var i = 0; i < orbData.length; i++) {
      if (orbData[i].collected) continue;
      var o = orbData[i];
      o.mesh.position.y = o.baseY + Math.sin(t * 1.5 + o.phase) * 0.15;
      o.mesh.rotation.y = t * 0.5 + o.phase;
      o.light.position.copy(o.mesh.position);

      // Gold orb pulses brighter
      if (o.gold) {
        o.mesh.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 3);
        o.light.intensity = 1.5 + Math.sin(t * 3) * 0.8;
      }
    }

    // Update cube camera for reflections every few frames (perf)
    frameCount++;
    if (frameCount % 3 === 0) {
      // Hide orbs temporarily for cleaner reflection
      cubeCamera.position.copy(camera.position);
      cubeCamera.update(renderer, scene);
    }

    renderer.render(scene, camera);
  }

  animate();
})();
