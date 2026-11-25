/* Droplabs shared 3D Molten Chrome & Smoked Amber Glass hero backdrop (Three.js r128). */
(function () {
  'use strict';

  var pulseBoost = 0;
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  window.DroplabsPulse3D = function (amount) {
    pulseBoost = Math.min(1.5, pulseBoost + (amount || 0.7));
  };

  window.addEventListener('pointermove', function (e) {
    pointer.tx = (e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
    pointer.ty = (e.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
  }, { passive: true });

  function initThreeBackground() {
    var canvas = document.getElementById('bg3dCanvas');
    if (!canvas || typeof THREE === 'undefined') return;

    var isPhone = window.matchMedia('(max-width: 639px)').matches;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dprCap = isPhone ? 1.35 : 1.75;
    var ribbonScale = isPhone ? 0.6 : 1;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: !isPhone,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch (err) {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.outputEncoding = THREE.sRGBEncoding;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.1, 10.5);

    function createStudioEnvMap() {
      var envCanvas = document.createElement('canvas');
      envCanvas.width = 1024;
      envCanvas.height = 512;
      var ctx = envCanvas.getContext('2d');

      var baseGrad = ctx.createLinearGradient(0, 0, 0, 512);
      baseGrad.addColorStop(0.0, '#0a090e');
      baseGrad.addColorStop(0.45, '#120e15');
      baseGrad.addColorStop(0.7, '#1a1114');
      baseGrad.addColorStop(1.0, '#050508');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, 1024, 512);

      var topStrip = ctx.createLinearGradient(0, 40, 0, 145);
      topStrip.addColorStop(0, 'rgba(255,255,255,0)');
      topStrip.addColorStop(0.4, 'rgba(255,252,248,0.98)');
      topStrip.addColorStop(0.65, 'rgba(235,230,240,0.85)');
      topStrip.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = topStrip;
      ctx.fillRect(80, 40, 864, 105);

      var amberGlow = ctx.createRadialGradient(780, 270, 10, 780, 270, 260);
      amberGlow.addColorStop(0, 'rgba(255, 178, 120, 1.0)');
      amberGlow.addColorStop(0.35, 'rgba(225, 118, 72, 0.85)');
      amberGlow.addColorStop(0.7, 'rgba(130, 54, 48, 0.35)');
      amberGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = amberGlow;
      ctx.fillRect(460, 0, 564, 512);

      var roseGlow = ctx.createRadialGradient(210, 320, 10, 210, 320, 240);
      roseGlow.addColorStop(0, 'rgba(255, 150, 178, 0.92)');
      roseGlow.addColorStop(0.35, 'rgba(218, 78, 126, 0.65)');
      roseGlow.addColorStop(0.75, 'rgba(92, 32, 62, 0.25)');
      roseGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = roseGlow;
      ctx.fillRect(0, 60, 480, 452);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillRect(140, 225, 320, 14);
      ctx.fillStyle = 'rgba(255, 218, 190, 0.88)';
      ctx.fillRect(580, 185, 290, 18);

      ctx.fillStyle = 'rgba(4, 3, 7, 0.95)';
      ctx.fillRect(0, 165, 1024, 24);
      ctx.fillRect(0, 390, 1024, 38);

      var tex = new THREE.CanvasTexture(envCanvas);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.encoding = THREE.sRGBEncoding;

      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      var envRT = pmrem.fromEquirectangular(tex);
      tex.dispose();
      pmrem.dispose();
      return envRT.texture;
    }

    var envMap = createStudioEnvMap();
    scene.environment = envMap;

    var keyLight = new THREE.DirectionalLight(0xfff5ec, 2.4);
    keyLight.position.set(6, 7, 6);
    scene.add(keyLight);

    var amberLight = new THREE.PointLight(0xff8e52, 4.2, 24);
    amberLight.position.set(5.5, 1.5, 4.5);
    scene.add(amberLight);

    var roseLight = new THREE.PointLight(0xe83b84, 3.2, 24);
    roseLight.position.set(-5.5, -2.5, 4.0);
    scene.add(roseLight);

    var rimLight = new THREE.DirectionalLight(0xd8e4ff, 1.8);
    rimLight.position.set(-5, 6, -5);
    scene.add(rimLight);

    var sculptureGroup = new THREE.Group();
    scene.add(sculptureGroup);

    var chromeMat = new THREE.MeshPhysicalMaterial({
      color: 0xe6e4ea,
      metalness: 1.0,
      roughness: 0.055,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMap: envMap,
      envMapIntensity: 1.65
    });

    var smokedAmberGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8744d,
      emissive: 0x260d0a,
      emissiveIntensity: 0.5,
      metalness: 0.35,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      transparent: true,
      opacity: 0.82,
      envMap: envMap,
      envMapIntensity: 1.85
    });

    var roseGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x9b4d68,
      emissive: 0x1c0814,
      emissiveIntensity: 0.45,
      metalness: 0.42,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.72,
      envMap: envMap,
      envMapIntensity: 1.7
    });

    function createLiquidRibbon(controlPoints, tubularSegs, radialSegs, baseRadius, taperFn, material) {
      var curve = new THREE.CatmullRomCurve3(controlPoints);
      var geo = new THREE.TubeGeometry(curve, tubularSegs, baseRadius, radialSegs, false);
      var pos = geo.attributes.position;

      for (var i = 0; i <= tubularSegs; i++) {
        var t = i / tubularSegs;
        var center = curve.getPointAt(t);
        var scale = taperFn(t);
        for (var j = 0; j <= radialSegs; j++) {
          var idx = i * (radialSegs + 1) + j;
          var angle = (j / radialSegs) * Math.PI * 2;
          var vx = pos.getX(idx) - center.x;
          var vy = pos.getY(idx) - center.y;
          var vz = pos.getZ(idx) - center.z;
          var ridge = 1.0 + 0.34 * Math.cos(angle * 2 + t * 7.0);
          pos.setXYZ(idx, center.x + vx * scale * ridge, center.y + vy * scale * ridge, center.z + vz * scale * ridge);
        }
      }
      geo.computeVertexNormals();
      return { mesh: new THREE.Mesh(geo, material) };
    }

    var chromeRibbon = createLiquidRibbon(
      [
        new THREE.Vector3(-9.5, -0.4, -1.6),
        new THREE.Vector3(-5.8, -2.1, 0.4),
        new THREE.Vector3(-1.4, -2.55, 1.3),
        new THREE.Vector3(2.4, -1.1, 0.8),
        new THREE.Vector3(5.2, 1.4, -0.2),
        new THREE.Vector3(8.8, 4.6, -1.4)
      ],
      Math.round(84 * ribbonScale), Math.round(18 * ribbonScale), 0.74,
      function (t) { return 0.35 + Math.sin(t * Math.PI) * 0.95 + Math.sin(t * Math.PI * 3.0) * 0.14; },
      chromeMat
    );
    sculptureGroup.add(chromeRibbon.mesh);

    var amberRibbon = createLiquidRibbon(
      [
        new THREE.Vector3(-9.2, -1.6, -0.9),
        new THREE.Vector3(-4.6, -3.15, 0.9),
        new THREE.Vector3(0.4, -2.85, 0.2),
        new THREE.Vector3(3.8, -0.3, 1.35),
        new THREE.Vector3(6.4, 2.3, 0.5),
        new THREE.Vector3(9.6, 5.1, -0.8)
      ],
      Math.round(78 * ribbonScale), Math.round(16 * ribbonScale), 0.68,
      function (t) { return 0.3 + Math.sin(t * Math.PI) * 0.88 + Math.cos(t * Math.PI * 4.0) * 0.12; },
      smokedAmberGlassMat
    );
    sculptureGroup.add(amberRibbon.mesh);

    var roseRibbon = createLiquidRibbon(
      [
        new THREE.Vector3(-8.4, 0.6, -2.5),
        new THREE.Vector3(-3.8, -1.5, -1.2),
        new THREE.Vector3(1.2, -1.75, -0.7),
        new THREE.Vector3(4.9, 0.45, -1.1),
        new THREE.Vector3(9.4, 0.35, -1.8)
      ],
      Math.round(64 * ribbonScale), Math.round(14 * ribbonScale), 0.52,
      function (t) { return 0.25 + Math.sin(t * Math.PI) * 0.78; },
      roseGlassMat
    );
    sculptureGroup.add(roseRibbon.mesh);

    var crestRibbon = createLiquidRibbon(
      [
        new THREE.Vector3(-5.2, -1.1, 1.0),
        new THREE.Vector3(-2.6, -0.5, 1.65),
        new THREE.Vector3(0.9, -0.75, 1.5),
        new THREE.Vector3(3.2, 1.35, 1.25),
        new THREE.Vector3(5.6, 3.6, 0.2)
      ],
      Math.round(56 * ribbonScale), Math.round(12 * ribbonScale), 0.26,
      function (t) { return Math.sin(t * Math.PI) * 0.92; },
      chromeMat
    );
    sculptureGroup.add(crestRibbon.mesh);

    var animatedRibbons = [
      { data: chromeRibbon, speed: 0.75, phase: 0.0 },
      { data: amberRibbon, speed: 0.62, phase: 1.7 },
      { data: roseRibbon, speed: 0.55, phase: 3.1 },
      { data: crestRibbon, speed: 0.9, phase: 4.5 }
    ];

    var dropletGeo = new THREE.SphereGeometry(1, 24, 24);
    var droplets = [];
    var dropletSeeds = [
      [-5.4, 0.35, 1.6, 0.15, true],
      [-4.2, -0.45, 2.0, 0.09, false],
      [-6.8, -2.55, 1.4, 0.12, true],
      [-2.8, -3.1, 1.5, 0.1, false],
      [2.7, 2.25, 1.4, 0.16, true],
      [3.6, 1.65, 2.0, 0.08, false],
      [4.8, -1.45, 1.7, 0.11, true],
      [6.1, 0.4, 1.9, 0.14, false],
      [1.3, 1.9, -0.4, 0.1, true],
      [-1.2, 2.3, -0.8, 0.11, false],
      [-7.2, 1.2, 0.2, 0.13, true],
      [7.0, 3.1, 0.6, 0.12, true],
      [0.2, -3.45, 1.2, 0.09, true],
      [-3.4, 1.55, 0.5, 0.07, false],
      [5.5, 2.8, 1.5, 0.07, true],
      [-0.6, -1.4, 2.2, 0.06, false]
    ];

    dropletSeeds.forEach(function (seed, idx) {
      var x = seed[0], y = seed[1], z = seed[2], r = seed[3], isChrome = seed[4];
      var m = new THREE.Mesh(dropletGeo, isChrome ? chromeMat : smokedAmberGlassMat);
      m.position.set(x, y, z);
      m.scale.set(r * 1.12, r * 0.92, r);
      sculptureGroup.add(m);
      droplets.push({ mesh: m, bx: x, by: y, bz: z, speed: 0.6 + (idx % 5) * 0.22, phase: idx * 0.9 });
    });

    function resize() {
      var hero = document.getElementById('top');
      var w = hero ? hero.clientWidth : window.innerWidth;
      var h = hero ? hero.clientHeight : window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();

      var mobile = w < 640;
      sculptureGroup.scale.setScalar(mobile ? 0.68 : 1.0);
      sculptureGroup.position.set(mobile ? 0.2 : 0, mobile ? -0.3 : 0.15, 0);
    }

    resize();
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });

    var rafId = null;
    var running = false;
    var externalPause = false;
    var lastFrameAt = 0;
    var elapsed = 0;
    var frameInterval = 1000 / 30;

    function animate(now) {
      rafId = requestAnimationFrame(animate);
      if (frameInterval && now - lastFrameAt < frameInterval - 1) return;
      var dt = lastFrameAt ? Math.min((now - lastFrameAt) / 1000, 0.1) : 1 / 60;
      lastFrameAt = now;
      elapsed += dt;
      var t = elapsed;

      pointer.x += (pointer.tx - pointer.x) * 0.055;
      pointer.y += (pointer.ty - pointer.y) * 0.055;
      pulseBoost *= 0.95;

      camera.position.x = pointer.x * 1.35 + Math.sin(t * 0.22) * 0.28;
      camera.position.y = -pointer.y * 0.9 + Math.cos(t * 0.18) * 0.2 + 0.1;
      camera.lookAt(0, -0.1, 0);

      sculptureGroup.rotation.y = pointer.x * 0.2 + Math.sin(t * 0.28) * 0.06;
      sculptureGroup.rotation.x = pointer.y * 0.12 + Math.cos(t * 0.24) * 0.04;

      amberLight.position.x = 5.2 + Math.sin(t * 0.55) * 1.8;
      amberLight.position.y = 1.4 + Math.cos(t * 0.45) * 1.5;
      amberLight.intensity = 4.2 + pulseBoost * 3.8;

      roseLight.position.x = -5.0 + Math.cos(t * 0.48) * 1.8;
      roseLight.position.y = -2.0 + Math.sin(t * 0.4) * 1.4;
      roseLight.intensity = 3.2 + pulseBoost * 4.2;

      var energy = 1.0 + pulseBoost * 0.85;
      for (var r = 0; r < animatedRibbons.length; r++) {
        var item = animatedRibbons[r];
        var m = item.data.mesh;
        var sp = t * item.speed + item.phase;
        m.rotation.z = Math.sin(sp * 0.65) * 0.045 * energy;
        m.rotation.x = Math.cos(sp * 0.5) * 0.06 * energy;
        m.position.y = Math.sin(sp * 0.8) * 0.14 * energy;
        m.position.z = Math.cos(sp * 0.55) * 0.16 * energy;
      }

      for (var i = 0; i < droplets.length; i++) {
        var d = droplets[i];
        d.mesh.position.y = d.by + Math.sin(t * d.speed + d.phase) * 0.24;
        d.mesh.position.x = d.bx + Math.cos(t * d.speed * 0.7 + d.phase) * 0.16;
        d.mesh.rotation.x = t * 0.5 + d.phase;
        d.mesh.rotation.y = t * 0.65 + d.phase;
      }

      renderer.render(scene, camera);
    }

    function startLoop() {
      if (running || reduceMotion || externalPause) return;
      running = true;
      lastFrameAt = 0;
      rafId = requestAnimationFrame(animate);
    }

    function stopLoop() {
      if (!running) return;
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    window.DroplabsSet3DPaused = function (paused) {
      externalPause = !!paused;
      if (externalPause) stopLoop();
      else if (heroVisible && !document.hidden) startLoop();
    };

    var heroVisible = true;
    var heroSection = document.getElementById('top');
    if (heroSection && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        heroVisible = entries[0].isIntersecting;
        if (heroVisible && !document.hidden) startLoop();
        else stopLoop();
      }, { threshold: 0.01 }).observe(heroSection);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopLoop();
      else if (heroVisible) startLoop();
    });

    if (reduceMotion) {
      renderer.render(scene, camera);
    } else {
      startLoop();
    }
  }

  window.addEventListener('load', initThreeBackground);
})();
