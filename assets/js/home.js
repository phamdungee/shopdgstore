    const API_BASE = window.DG_API_BASE || window.SKYNET_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api');
    function formatMoney(v) { return `${Number(v || 0).toLocaleString('vi-VN')}đ`; }
    function getStoredUser() { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } }
    function clearAuthSession() { localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('isLoggedIn'); }

    function renderHeaderLoggedOut() {
      const t = document.getElementById('headerAuthActions');
      if (t) t.innerHTML = '<a class="btn-login" href="login.html"><i class="fa-solid fa-right-to-bracket"></i> <span class="btn-text">Đăng ký / Đăng nhập</span></a>';
    }

    function renderHeaderUser(user) {
      const t = document.getElementById('headerAuthActions');
      if (!t) return;
      
      const displayName = user.fullName || user.username || 'User';
      const initial = displayName.trim().charAt(0).toUpperCase() || 'U';
      const safeName = displayName;
      
      const adminLink = user.role === 'admin'
        ? `<a class="btn-nav-a" href="admin.html"><i class="fa-solid fa-gauge-high"></i> <span>Admin</span></a>`
        : '';
        
      t.innerHTML = `
        <div class="nav-user-container" style="display: flex; align-items: center; gap: 10px;">
          ${adminLink}
          <a class="nav-user" href="profile.html" title="Mở tài khoản">
            <span class="nav-av">${initial}</span>
            <span class="nav-uinfo">
              <strong>${safeName}</strong>
              <small>${formatMoney(user.balance)}</small>
            </span>
          </a>
          <button class="btn-out" onclick="handleHeaderLogout()" title="Đăng xuất">
            <i class="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      `;
    }

    async function syncHeaderAuth() {
      const token = localStorage.getItem('token');
      const cachedUser = getStoredUser();
      if (cachedUser) renderHeaderUser(cachedUser);
      if (!token) { if (!cachedUser) renderHeaderLoggedOut(); return; }
      try {
        const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false || !data.user) {
          clearAuthSession(); renderHeaderLoggedOut(); return;
        }
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('isLoggedIn', 'true');
        renderHeaderUser(data.user);
      } catch {
        if (!cachedUser) renderHeaderLoggedOut();
      }
    }
    function handleHeaderLogout() { clearAuthSession(); renderHeaderLoggedOut(); }

    // Theme Toggle Disabled (Defaulting to Dark Theme)
    localStorage.removeItem('theme');
    document.body.classList.remove('light-mode');

    // Mobile Nav Toggle
    const mobToggle = document.getElementById('mobToggle');
    const mobClose = document.getElementById('mobClose');
    const mobNav = document.getElementById('mobNav');
    if (mobToggle && mobNav) {
      mobToggle.addEventListener('click', () => mobNav.classList.add('open'));
    }
    if (mobClose && mobNav) {
      mobClose.addEventListener('click', () => mobNav.classList.remove('open'));
    }

    // Parallax scroll & Nav color change
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const heroBg = document.getElementById('heroBg');
      if (heroBg) {
        heroBg.style.transform = `translateY(${scrolled * 0.35}px)`;
      }
      const nav = document.getElementById('landingNav');
      if (nav) {
        if (scrolled > 50) {
          nav.classList.add('scrolled');
        } else {
          nav.classList.remove('scrolled');
        }
      }
    });

    // Intersection Observer for fade-in animations
    const animElements = document.querySelectorAll('.anim');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('vis');
        }
      });
    }, { threshold: 0.1 });
    animElements.forEach(el => observer.observe(el));

    // Number count up animation for stats
    const statsElements = document.querySelectorAll('.hero-stat-num, .stat-num');
    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
          entry.target.classList.add('counted');
          const target = parseFloat(entry.target.getAttribute('data-target'));
          const suffix = entry.target.getAttribute('data-suffix') || '';
          const decimal = entry.target.getAttribute('data-decimal') === 'true';
          let current = 0;
          const duration = 2000;
          const stepTime = 30;
          const steps = duration / stepTime;
          const increment = target / steps;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              current = target;
              clearInterval(timer);
            }
            entry.target.innerText = (decimal ? current.toFixed(1) : Math.floor(current).toLocaleString('vi-VN')) + suffix;
          }, stepTime);
        }
      });
    }, { threshold: 0.15 });
    statsElements.forEach(el => statsObserver.observe(el));

    syncHeaderAuth();

    // ── WebGL Three.js 3D Robot Arm & Particles ──
    const initRobot3D = () => {
      const canvas = document.getElementById('robotCanvas');
      if (!canvas) {
        // Fallback for preloader if canvas doesn't exist
        const preloader = document.getElementById('preloader');
        if (preloader) {
          preloader.classList.add('opacity-0');
          setTimeout(() => preloader.remove(), 500);
        }
        return;
      }

      const container = canvas.parentElement;
      const width = container.clientWidth || 320;
      const height = container.clientHeight || 400;

      // Scene Setup
      const scene = new THREE.Scene();
      
      // Camera Setup
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 0, 8);

      // Renderer
      const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // Lighting (High contrast neon cyberpunk style)
      const ambientLight = new THREE.AmbientLight(0x0a0f1d, 1.2);
      scene.add(ambientLight);

      const dirLight1 = new THREE.DirectionalLight(0x6366f1, 4); // Bright Purple/Indigo
      dirLight1.position.set(5, 5, 5);
      scene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0x22d3ee, 3); // Bright Cyan
      dirLight2.position.set(-5, 2, 3);
      scene.add(dirLight2);

      const pointLight = new THREE.PointLight(0xf472b6, 4, 12); // Pulse point light
      pointLight.position.set(0, 0.5, 0.5);
      scene.add(pointLight);

      // Materials
      const metalMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.95,
        roughness: 0.12,
        emissive: 0x070b19,
        flatShading: false
      });

      const jointMetalMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0, // Distinct silver-chrome joint look
        metalness: 0.98,
        roughness: 0.05,
        emissive: 0x0f172a
      });

      const glowMat = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x22d3ee,
        emissiveIntensity: 2.5,
        transparent: true,
        opacity: 0.95
      });

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xf472b6,
        emissiveIntensity: 4.0
      });

      // Robot Arm Group
      const armGroup = new THREE.Group();
      scene.add(armGroup);

      // 1. Forearm (Tapered segmented sleeve)
      const forearmGeo = new THREE.CylinderGeometry(0.28, 0.42, 2.2, 16);
      const forearm = new THREE.Mesh(forearmGeo, metalMat);
      forearm.position.y = -2;
      armGroup.add(forearm);

      // Glowing mechanical bands on forearm
      const bandGeo = new THREE.CylinderGeometry(0.29, 0.33, 0.15, 16);
      const band = new THREE.Mesh(bandGeo, glowMat);
      band.position.y = -1.8;
      armGroup.add(band);

      const band2Geo = new THREE.CylinderGeometry(0.35, 0.38, 0.1, 16);
      const band2 = new THREE.Mesh(band2Geo, glowMat);
      band2.position.y = -2.4;
      armGroup.add(band2);

      // 2. Wrist Joint (Large detailed ball hinge)
      const wristGeo = new THREE.SphereGeometry(0.36, 20, 20);
      const wrist = new THREE.Mesh(wristGeo, jointMetalMat);
      wrist.position.y = -0.7;
      armGroup.add(wrist);

      // Wrist outer mechanical ring
      const wristRingGeo = new THREE.TorusGeometry(0.42, 0.04, 8, 24);
      const wristRing = new THREE.Mesh(wristRingGeo, glowMat);
      wristRing.rotation.x = Math.PI / 2;
      wristRing.position.y = -0.7;
      armGroup.add(wristRing);

      // 3. Palm Base (Detailed chamfered hex plate)
      const palmGroup = new THREE.Group();
      palmGroup.position.set(0, 0, 0);
      armGroup.add(palmGroup);

      const palmGeo = new THREE.BoxGeometry(0.95, 0.18, 0.85);
      const palm = new THREE.Mesh(palmGeo, metalMat);
      palm.position.y = -0.2;
      palmGroup.add(palm);

      // Energy Core
      const coreGeo = new THREE.SphereGeometry(0.22, 20, 20);
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(0, -0.05, 0.1);
      palmGroup.add(core);

      // Rotator ring around energy core
      const ringGeo = new THREE.TorusGeometry(0.32, 0.04, 8, 24);
      const ring = new THREE.Mesh(ringGeo, glowMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, -0.05, 0.1);
      palmGroup.add(ring);

      // 4. Fingers (Joint hierarchy with explicit knuckles & neon rings)
      const fingerList = [];
      const createFinger = (offsetName, xOffset, zOffset, lengthFactor, fingerAngle) => {
        const finger = new THREE.Group();
        finger.position.set(xOffset, -0.1, zOffset);
        finger.rotation.z = fingerAngle;
        palmGroup.add(finger);

        // Knuckle 1 (Base joint)
        const k1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), jointMetalMat);
        finger.add(k1);
        
        const k1Glow = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 12), glowMat);
        k1Glow.rotation.x = Math.PI / 2;
        k1.add(k1Glow);

        // Segment 1 (Base - tapered)
        const phalanx1Geo = new THREE.CylinderGeometry(0.06, 0.08, 0.45 * lengthFactor, 10);
        phalanx1Geo.translate(0, 0.225 * lengthFactor, 0);
        const p1 = new THREE.Mesh(phalanx1Geo, metalMat);
        finger.add(p1);

        // Knuckle 2 (Middle joint)
        const k2 = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), jointMetalMat);
        k2.position.y = 0.45 * lengthFactor;
        p1.add(k2);
        
        const k2Glow = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 12), glowMat);
        k2Glow.rotation.x = Math.PI / 2;
        k2.add(k2Glow);

        // Segment 2 (Middle - tapered)
        const phalanx2Geo = new THREE.CylinderGeometry(0.05, 0.06, 0.35 * lengthFactor, 10);
        phalanx2Geo.translate(0, 0.175 * lengthFactor, 0);
        const p2 = new THREE.Mesh(phalanx2Geo, metalMat);
        p2.position.y = 0.45 * lengthFactor;
        p1.add(p2);

        // Knuckle 3 (Tip joint) - only for non-thumbs
        let p3 = null;
        if (offsetName !== 'thumb') {
          const k3 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), jointMetalMat);
          k3.position.y = 0.35 * lengthFactor;
          p2.add(k3);
          
          const k3Glow = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.012, 6, 12), glowMat);
          k3Glow.rotation.x = Math.PI / 2;
          k3.add(k3Glow);

          // Segment 3 (Tip - tapered)
          const phalanx3Geo = new THREE.CylinderGeometry(0.035, 0.05, 0.25 * lengthFactor, 10);
          phalanx3Geo.translate(0, 0.125 * lengthFactor, 0);
          p3 = new THREE.Mesh(phalanx3Geo, metalMat);
          p3.position.y = 0.35 * lengthFactor;
          p2.add(p3);
        }

        fingerList.push({ name: offsetName, root: finger, p1, p2, p3 });
      };

      // Create index, middle, ring, pinky, thumb
      createFinger('thumb', -0.45, 0.1, 0.8, -Math.PI / 6);
      createFinger('index', -0.28, 0.35, 1.0, -Math.PI / 24);
      createFinger('middle', 0.0, 0.4, 1.1, 0);
      createFinger('ring', 0.26, 0.33, 1.0, Math.PI / 24);
      createFinger('pinky', 0.46, 0.18, 0.85, Math.PI / 12);

      // Rotate Thumb segment 1 differently to align thumb shape
      const thumb = fingerList.find(f => f.name === 'thumb');
      thumb.root.rotation.x = Math.PI / 4;

      // Antigravity rising particles
      const particleCount = 80;
      const particlesGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const velocities = [];

      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 6;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 5 - 2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 3;

        velocities.push({
          y: 0.01 + Math.random() * 0.02,
          x: (Math.random() - 0.5) * 0.005,
          z: (Math.random() - 0.5) * 0.005,
          originalX: positions[i * 3],
          speedOffset: Math.random() * 100
        });
      }

      particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const createParticleTexture = () => {
        const c = document.createElement('canvas');
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.3, 'rgba(168,85,247,0.8)'); // Purple glow
        grad.addColorStop(1, 'rgba(99,102,241,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 16);
        return new THREE.CanvasTexture(c);
      };

      const particleMat = new THREE.PointsMaterial({
        size: 0.15,
        map: createParticleTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const particleSystem = new THREE.Points(particlesGeo, particleMat);
      scene.add(particleSystem);

      // Mouse tracking setup
      let mouseX = 0;
      let mouseY = 0;
      let targetRotY = 0;
      let targetRotX = 0;

      window.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        mouseX = (x / rect.width - 0.5) * 2;
        mouseY = (y / rect.height - 0.5) * 2;

        targetRotY = mouseX * 0.45; // slightly increased sensitivity
        targetRotX = -mouseY * 0.35;
      });

      // ── GSAP CINEMATIC SEQUENCE ──
      armGroup.position.y = -6;
      core.scale.set(0, 0, 0);
      ring.scale.set(0, 0, 0);

      // Clenched state
      fingerList.forEach(f => {
        if (f.name === 'thumb') {
          f.p1.rotation.x = Math.PI / 2.5;
          f.p2.rotation.x = Math.PI / 2.5;
        } else {
          f.p1.rotation.x = -Math.PI / 2;
          f.p2.rotation.x = -Math.PI / 1.8;
          f.p3.rotation.x = -Math.PI / 2.2;
        }
      });

      gsap.set(".floating-prod-card", { scale: 0, opacity: 0 });

      const tl = gsap.timeline();

      // Rise forearm
      tl.to(armGroup.position, {
        y: 0.5,
        duration: 1.8,
        ease: "power3.out"
      });

      // Assemble snap (rotation & shake)
      tl.to(armGroup.rotation, {
        y: Math.PI * 2,
        duration: 1.6,
        ease: "back.out(1.1)",
      }, "-=1.4");

      // Uncurl Fingers (Step-by-step opening)
      fingerList.forEach((f, idx) => {
        const delay = "-=" + (1.2 - idx * 0.08);
        if (f.name === 'thumb') {
          tl.to(f.p1.rotation, { x: 0, duration: 1.4, ease: "elastic.out(1, 0.5)" }, delay);
          tl.to(f.p2.rotation, { x: 0, duration: 1.4, ease: "elastic.out(1, 0.5)" }, "<");
        } else {
          tl.to(f.p1.rotation, { x: 0.15, duration: 1.5, ease: "elastic.out(1, 0.55)" }, delay);
          tl.to(f.p2.rotation, { x: 0, duration: 1.5, ease: "elastic.out(1, 0.55)" }, "<");
          tl.to(f.p3.rotation, { x: -0.1, duration: 1.5, ease: "elastic.out(1, 0.55)" }, "<");
        }
      });

      // Core Ignite
      tl.to(core.scale, {
        x: 1, y: 1, z: 1,
        duration: 0.6,
        ease: "elastic.out(1, 0.4)",
        onStart: () => {
          pointLight.intensity = 6;
        }
      }, "-=1.0");

      tl.to(ring.scale, {
        x: 1, y: 1, z: 1,
        duration: 0.8,
        ease: "power2.out"
      }, "<");

      // Card Eruption
      tl.to(".floating-prod-card", {
        scale: 1,
        opacity: 1,
        duration: 1.2,
        ease: "back.out(1.5)",
        stagger: 0.1,
        onComplete: () => {
          const preloader = document.getElementById('preloader');
          if (preloader) {
            preloader.classList.add('opacity-0');
            setTimeout(() => preloader.remove(), 500);
          }
        }
      }, "-=0.6");

      // Anim loop
      let clock = new THREE.Clock();

      const animate = () => {
        requestAnimationFrame(animate);

        const elapsedTime = clock.getElapsedTime();

        // 1. Arm group hover tracking mouse (lerping)
        armGroup.rotation.y += (targetRotY - armGroup.rotation.y) * 0.08;
        armGroup.rotation.x += (targetRotX - armGroup.rotation.x) * 0.08;

        // Subtle constant hover breathing
        armGroup.position.y = 0.5 + Math.sin(elapsedTime * 1.8) * 0.04;

        // 2. Rotate energy core ring
        ring.rotation.z += 0.02;
        core.rotation.y += 0.01;

        // Dynamic pulsing core brightness
        pointLight.intensity = 4 + Math.sin(elapsedTime * 4) * 1.5;

        // 3. Dynamic fingers breathing wiggles (Flexibility after intro)
        const introProgress = Math.min(elapsedTime / 2.8, 1.0);
        if (introProgress >= 1.0) {
          fingerList.forEach((f, idx) => {
            const wiggleVal = Math.sin(elapsedTime * 1.5 + idx * 0.6) * 0.05;
            if (f.name === 'thumb') {
              f.p1.rotation.x = wiggleVal * 0.4;
              f.p2.rotation.x = wiggleVal * 0.8;
            } else {
              // Add wiggle as offset to target rotation values
              f.p1.rotation.x = 0.15 + wiggleVal;
              f.p2.rotation.x = wiggleVal * 0.8;
              f.p3.rotation.x = -0.1 + wiggleVal * 0.5;
            }
          });
        }

        // 4. Antigravity particle movement & Fingertip attraction
        const posAttr = particlesGeo.attributes.position.array;
        const fingerTips = [];
        fingerList.forEach(f => {
          const tip = new THREE.Vector3();
          f.p3 ? f.p3.getWorldPosition(tip) : f.p2.getWorldPosition(tip);
          fingerTips.push(tip);
        });

        for (let i = 0; i < particleCount; i++) {
          const idx = i * 3;
          const vel = velocities[i];

          posAttr[idx + 1] += vel.y;
          posAttr[idx] += vel.x + Math.sin(elapsedTime + vel.speedOffset) * 0.003;
          posAttr[idx + 2] += vel.z;

          const pPos = new THREE.Vector3(posAttr[idx], posAttr[idx + 1], posAttr[idx + 2]);

          let closestTip = null;
          let minDist = 2.0;

          fingerTips.forEach(tip => {
            const dist = pPos.distanceTo(tip);
            if (dist < minDist) {
              minDist = dist;
              closestTip = tip;
            }
          });

          if (closestTip) {
            posAttr[idx] += (closestTip.x - posAttr[idx]) * 0.08;
            posAttr[idx + 1] += (closestTip.y - posAttr[idx + 1]) * 0.08;
            posAttr[idx + 2] += (closestTip.z - posAttr[idx + 2]) * 0.08;
          }

          if (posAttr[idx + 1] > 3.5) {
            posAttr[idx] = (Math.random() - 0.5) * 6;
            posAttr[idx + 1] = -2.5;
            posAttr[idx + 2] = (Math.random() - 0.5) * 3;
          }
        }

        particlesGeo.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
      };

      animate();

      // Handle Resize
      window.addEventListener('resize', () => {
        const w = container.clientWidth || 320;
        const h = container.clientHeight || 400;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
    };

    window.addEventListener('DOMContentLoaded', () => {
      initRobot3D();

      // Hide preloader like index.html (common.js behavior)
      setTimeout(() => {
        const preloader = document.getElementById('preloader');
        if (preloader) {
          preloader.classList.add('opacity-0');
          setTimeout(() => preloader.remove(), 500);
        }
      }, 400);
    });