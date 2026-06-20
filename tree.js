// DeCarbonizer — Interactive 3D Ecosystem Tree Visualizer
// Manages Three.js rendering, procedural generation, particle systems, and live animations.

class Ecosystem3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container element #${containerId} not found!`);
      return;
    }

    this.health = 1.0; // 0.0 (dead) to 1.0 (flourishing)
    this.currentCo2 = 0.0;
    this.isSimulator = false;

    // Animation tracking
    this.time = 0;
    this.branches = [];
    this.leaves = [];
    this.fruits = [];
    this.activeLeafCount = 0;
    this.isWatering = false;
    this.waterLifetime = 0;
    this.isCleansing = false;
    this.cleanseRadius = 0;

    // Reusable objects for animation performance (GC prevention)
    this.tempColor = new THREE.Color();
    this.tempColor2 = new THREE.Color();
    this.tempVector = new THREE.Vector3();
    this.tempVector2 = new THREE.Vector3();

    // Environment colors cached to prevent GC stutters
    this.healthyGrass = new THREE.Color('#2e5a44');
    this.stressedGrass = new THREE.Color('#656d4a');
    this.deadGrass = new THREE.Color('#1c1917');
    this.healthySoil = new THREE.Color('#4e3629');
    this.stressedSoil = new THREE.Color('#582f0e');
    this.deadSoil = new THREE.Color('#120a06');
    this.targetGrass = new THREE.Color();
    this.targetSoil = new THREE.Color();
    this.healthyAmbient = new THREE.Color('#d4f3e6');
    this.deadAmbient = new THREE.Color('#180c1e');

    this.initThree();
    this.createLights();
    this.createGround();
    this.createTree();
    this.createFace();
    this.createBoy();
    this.createFireflies();
    this.createSmog();
    this.createWaterSystem();
    this.createSnowSystem();
    this.createCleanseSystem();

    // Start render loop
    this.animate();

    // Bind window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  initThree() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || 350;

    // Create scene
    this.scene = new THREE.Scene();
    // Add subtle ambient fog that thickens as pollution rises
    this.scene.fog = new THREE.FogExp2('#060e0a', 0.08);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);
    this.camera.position.set(0, 0.5, 6);

    // Create WebGL Renderer with alpha transparency and antialiasing
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Remove placeholder and append canvas
    const placeholder = document.getElementById('ecosystem-canvas-placeholder');
    if (placeholder) placeholder.remove();
    
    this.renderer.domElement.id = 'ecosystem-canvas';
    this.container.appendChild(this.renderer.domElement);

    // Add camera OrbitControls if available
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.minDistance = 3.5;
      this.controls.maxDistance = 10;
      this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't allow rotating under ground
      this.controls.target.set(0, -0.2, 0);
    } else {
      // Custom basic rotation fallback
      this.setupCustomRotation();
    }
  }

  setupCustomRotation() {
    let isMouseDown = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    const dom = this.renderer.domElement;
    
    // Mouse Events
    dom.addEventListener('mousedown', () => { isMouseDown = true; });
    dom.addEventListener('mousemove', (e) => {
      const deltaMove = {
        x: e.offsetX - previousMousePosition.x,
        y: e.offsetY - previousMousePosition.y
      };

      if (isMouseDown && this.treeGroup) {
        this.treeGroup.rotation.y += deltaMove.x * 0.01;
        this.treeGroup.rotation.x += deltaMove.y * 0.005;
        this.treeGroup.rotation.x = Math.max(-0.2, Math.min(0.5, this.treeGroup.rotation.x));
      }

      previousMousePosition = {
        x: e.offsetX,
        y: e.offsetY
      };
    });
    window.addEventListener('mouseup', () => { isMouseDown = false; });

    // Touch Events for Mobile / Tablet support
    dom.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isMouseDown = true;
        const rect = dom.getBoundingClientRect();
        previousMousePosition = {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top
        };
      }
    });

    dom.addEventListener('touchmove', (e) => {
      if (isMouseDown && e.touches.length === 1 && this.treeGroup) {
        const rect = dom.getBoundingClientRect();
        const currentX = e.touches[0].clientX - rect.left;
        const currentY = e.touches[0].clientY - rect.top;
        
        const deltaMove = {
          x: currentX - previousMousePosition.x,
          y: currentY - previousMousePosition.y
        };

        this.treeGroup.rotation.y += deltaMove.x * 0.012;
        this.treeGroup.rotation.x += deltaMove.y * 0.006;
        this.treeGroup.rotation.x = Math.max(-0.2, Math.min(0.5, this.treeGroup.rotation.x));

        previousMousePosition = {
          x: currentX,
          y: currentY
        };
      }
    });

    window.addEventListener('touchend', () => { isMouseDown = false; });
  }

  createLights() {
    // Soft ambient lighting
    this.ambientLight = new THREE.AmbientLight('#d4f3e6', 0.65);
    this.scene.add(this.ambientLight);

    // Sun directional light (casting shadow)
    this.sunLight = new THREE.DirectionalLight('#ffffff', 1.0);
    this.sunLight.position.set(5, 8, 5);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.bias = -0.001;
    this.scene.add(this.sunLight);

    // Dynamic colored spotlight from underneath to add premium depth
    this.glowLight = new THREE.PointLight('#10b981', 1.2, 10);
    this.glowLight.position.set(0, -1.5, 0);
    this.scene.add(this.glowLight);
  }

  createGround() {
    this.groundGroup = new THREE.Group();
    this.scene.add(this.groundGroup);

    // Thin circular grass surface
    const grassGeom = new THREE.CylinderGeometry(1.8, 1.8, 0.1, 24);
    this.grassMaterial = new THREE.MeshStandardMaterial({
      color: '#2e5a44',
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true
    });
    const grass = new THREE.Mesh(grassGeom, this.grassMaterial);
    grass.position.y = -1.8;
    grass.receiveShadow = true;
    this.groundGroup.add(grass);

    // Soil support cone underneath
    const soilGeom = new THREE.CylinderGeometry(1.8, 1.2, 0.4, 24);
    this.soilMaterial = new THREE.MeshStandardMaterial({
      color: '#4e3629',
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true
    });
    const soil = new THREE.Mesh(soilGeom, this.soilMaterial);
    soil.position.y = -2.05;
    this.groundGroup.add(soil);
  }

  createTree() {
    this.treeGroup = new THREE.Group();
    this.scene.add(this.treeGroup);

    // Common materials
    this.branchMaterial = new THREE.MeshStandardMaterial({
      color: '#4e3629',
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true
    });

    // Default template leaf material (cloned during generation)
    this.leafMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.8,
      metalness: 0.1,
      flatShading: true
    });

    const startPos = new THREE.Vector3(0, -1.75, 0);
    const startDir = new THREE.Vector3(0, 1, 0).normalize();
    
    // Recursive Branch Generation
    this.buildBranch(startPos, startDir, 0.75, 0.075, 0, this.treeGroup);
    
    this.activeLeafCount = this.leaves.length;
  }

  buildBranch(start, direction, length, radius, depth, parentGroup) {
    const maxDepth = 4;
    const end = start.clone().add(direction.clone().multiplyScalar(length));

    // Create branch cylinder mesh
    const geom = new THREE.CylinderGeometry(radius * 0.7, radius, length, 8);
    geom.translate(0, length / 2, 0); // Offset pivot to base

    const mesh = new THREE.Mesh(geom, this.branchMaterial);
    mesh.position.copy(start);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Orient cylinder along direction vector
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
    mesh.quaternion.copy(quaternion);

    parentGroup.add(mesh);

    // Keep track of branch segment for wind sway
    this.branches.push({
      mesh: mesh,
      depth: depth,
      originalRotation: quaternion.clone(),
      swaySpeed: 1.5 + Math.random() * 2,
      swayAmount: 0.025 / (depth + 1),
      swayOffset: Math.random() * Math.PI * 2
    });

    // Connector node sphere
    const jointGeom = new THREE.SphereGeometry(radius * 0.8, 8, 8);
    const jointMesh = new THREE.Mesh(jointGeom, this.branchMaterial);
    jointMesh.position.copy(end);
    jointMesh.castShadow = true;
    parentGroup.add(jointMesh);

    // Base case: build leaf clusters at terminal branches
    if (depth >= maxDepth) {
      this.createLeafCluster(end, radius * 3.5, parentGroup);
      return;
    }

    // Branching recursion
    const numChildren = 2;
    const spreadAngle = 0.42; // ~24 degrees split

    for (let i = 0; i < numChildren; i++) {
      const newDir = direction.clone();

      // Distribute angles slightly offset
      const angleX = spreadAngle * (i === 0 ? 1 : -1) + (Math.random() - 0.5) * 0.15;
      const angleZ = (Math.random() - 0.5) * spreadAngle * 1.5;

      newDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), angleX);
      newDir.applyAxisAngle(new THREE.Vector3(0, 0, 1), angleZ);
      newDir.normalize();

      const nextLength = length * 0.78;
      const nextRadius = radius * 0.65;

      this.buildBranch(end, newDir, nextLength, nextRadius, depth + 1, parentGroup);
    }
  }

  createLeafCluster(position, radius, parentGroup) {
    const leafCount = 8;
    const leafGeom = new THREE.IcosahedronGeometry(0.1, 0); // Stylized low-poly spheres

    for (let i = 0; i < leafCount; i++) {
      // Clone base leaf material so they transition independently
      const material = this.leafMaterial.clone();
      material.color.set('#10b981');
      const mesh = new THREE.Mesh(leafGeom, material);
      mesh.castShadow = true;

      // Distribute position around the branch tip
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * radius * 1.6,
        (Math.random() - 0.5) * radius * 1.6,
        (Math.random() - 0.5) * radius * 1.6
      );
      
      mesh.position.copy(position).add(offset);
      
      const scale = 0.7 + Math.random() * 0.6;
      mesh.scale.set(scale, scale, scale);
      
      // Random rotation
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      parentGroup.add(mesh);

      this.leaves.push({
        mesh: mesh,
        originalPosition: mesh.position.clone(),
        originalScale: scale,
        offset: offset.clone(),
        branchTip: position.clone(),
        isDetached: false,
        velocity: new THREE.Vector3(),
        rotationalVelocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.12,
          (Math.random() - 0.5) * 0.12,
          (Math.random() - 0.5) * 0.12
        ),
        restingTime: 0
      });
    }

    // Spawn 1 fruit randomly per cluster with a 40% probability
    if (Math.random() < 0.40) {
      const fruitGeom = new THREE.DodecahedronGeometry(0.045, 0); // low-poly fruit look
      const material = new THREE.MeshStandardMaterial({
        color: '#ef4444',
        roughness: 0.6,
        metalness: 0.1,
        flatShading: true
      });
      const fruitMesh = new THREE.Mesh(fruitGeom, material);
      fruitMesh.castShadow = true;
      
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * radius * 0.9,
        -0.08 - Math.random() * 0.08,
        (Math.random() - 0.5) * radius * 0.9
      );
      
      fruitMesh.position.copy(position).add(offset);
      
      const scale = 0.85 + Math.random() * 0.3;
      fruitMesh.scale.set(scale, scale, scale);
      
      parentGroup.add(fruitMesh);

      this.fruits.push({
        mesh: fruitMesh,
        originalPosition: fruitMesh.position.clone(),
        originalScale: scale,
        offset: offset.clone(),
        isDetached: false,
        velocity: new THREE.Vector3(),
        rotationalVelocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.08
        ),
        restingTime: 0
      });
    }
  }

  createFireflies() {
    const count = 35;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.fireflyData = [];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.4 + Math.random() * 1.6;
      const x = Math.cos(angle) * radius;
      const y = -1.1 + Math.random() * 2.6;
      const z = Math.sin(angle) * radius;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      this.fireflyData.push({
        index: i,
        speedY: 0.004 + Math.random() * 0.006,
        baseX: x,
        baseZ: z,
        amplitude: 0.12 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2
      });
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Green-gold glowing point material
    this.fireflyMaterial = new THREE.PointsMaterial({
      color: '#a3e635',
      size: 0.12,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });

    this.fireflies = new THREE.Points(geom, this.fireflyMaterial);
    this.scene.add(this.fireflies);
  }

  createSmog() {
    const count = 50;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.smogData = [];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 1.6;
      const x = Math.cos(angle) * radius;
      const y = -1.8 + Math.random() * 3.6;
      const z = Math.sin(angle) * radius;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      this.smogData.push({
        index: i,
        speedY: 0.006 + Math.random() * 0.01,
        amplitude: 0.06 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        baseX: x,
        baseZ: z,
        blastVelocity: new THREE.Vector3() // triggered by Cleanse Air
      });
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Dark grey-purple floating dust material
    this.smogMaterial = new THREE.PointsMaterial({
      color: '#4b5563',
      size: 0.32,
      transparent: true,
      opacity: 0.0,
      blending: THREE.NormalBlending
    });

    this.smog = new THREE.Points(geom, this.smogMaterial);
    this.scene.add(this.smog);
  }

  createWaterSystem() {
    const count = 60;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.waterData = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -99; // hide initially
      positions[i * 3 + 2] = 0;

      this.waterData.push({
        index: i,
        velocity: new THREE.Vector3()
      });
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Blue water drops
    this.waterMaterial = new THREE.PointsMaterial({
      color: '#38bdf8',
      size: 0.1,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    this.water = new THREE.Points(geom, this.waterMaterial);
    this.scene.add(this.water);
  }

  createCleanseSystem() {
    // Mesh ring to represent the wind expand wave
    const ringGeom = new THREE.RingGeometry(0.1, 0.15, 32);
    ringGeom.rotateX(-Math.PI / 2); // Lay flat
    
    this.cleanseMaterial = new THREE.MeshBasicMaterial({
      color: '#34d399',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    
    this.cleanseMesh = new THREE.Mesh(ringGeom, this.cleanseMaterial);
    this.cleanseMesh.position.y = -1.1;
    this.scene.add(this.cleanseMesh);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || 350;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  // --- Interaction Triggers ---

  waterTree() {
    if (this.boyState === 'idle') {
      this.boyActionType = 'water';
      this.boyState = 'walking_to_tree';
      this.boyAnimTime = 0;
    }
  }



  cleanseAir() {
    this.isCleansing = true;
    this.cleanseRadius = 0.1;
    this.cleanseMesh.scale.set(1, 1, 1);
    this.cleanseMaterial.opacity = 0.85;

    // Blast smog particles away from center
    const smogPositions = this.smog.geometry.attributes.position.array;
    for (let i = 0; i < this.smogData.length; i++) {
      const data = this.smogData[i];
      const px = smogPositions[i * 3];
      const pz = smogPositions[i * 3 + 2];
      
      // Horizontal angle from center
      const angle = Math.atan2(pz, px);
      const pushForce = 0.06 + Math.random() * 0.08;
      
      data.blastVelocity.set(
        Math.cos(angle) * pushForce,
        (Math.random() - 0.2) * 0.03,
        Math.sin(angle) * pushForce
      );
    }
  }

  // --- Main Update Logic ---

  updateEcosystem(health, co2Val) {
    this.health = Math.max(0.0, Math.min(1.0, health));
    this.currentCo2 = co2Val;

    // Check if footprint has reduced
    if (this.lastCo2 !== undefined && co2Val < this.lastCo2) {
      if (this.boyState === 'idle') {
        this.boyActionType = 'hug';
        this.boyState = 'walking_to_tree';
        this.boyAnimTime = 0;
      }
    }
    this.lastCo2 = co2Val;



    // Update UI Badges
    const healthValEl = document.getElementById('eco-health-val');
    const statusTextEl = document.getElementById('eco-status-text');
    const statusDotEl = document.querySelector('.eco-status-badge .status-dot');
    const statusBadgeEl = document.getElementById('eco-status-badge');

    if (healthValEl) {
      healthValEl.textContent = `${Math.round(this.health * 100)}%`;
      
      // Dynamic colors
      if (this.health >= 0.75) healthValEl.style.color = 'var(--primary)';
      else if (this.health >= 0.45) healthValEl.style.color = 'var(--color-energy)';
      else healthValEl.style.color = 'var(--color-travel)';
    }

    if (statusTextEl && statusDotEl && statusBadgeEl) {
      let status = 'Pristine';
      let dotColor = 'var(--primary)';
      let pulseClass = false;

      if (this.health >= 0.85) {
        status = 'Pristine';
        dotColor = '#10b981';
      } else if (this.health >= 0.6) {
        status = 'Stressed';
        dotColor = '#fbbf24';
      } else if (this.health >= 0.3) {
        status = 'Dying';
        dotColor = '#f97316';
        pulseClass = true;
      } else {
        status = 'Decayed';
        dotColor = '#f43f5e';
        pulseClass = true;
      }

      statusTextEl.textContent = status;
      statusDotEl.style.backgroundColor = dotColor;
      statusDotEl.style.boxShadow = `0 0 10px ${dotColor}`;
      
      if (pulseClass) {
        statusBadgeEl.classList.add('pulse-status');
      } else {
        statusBadgeEl.classList.remove('pulse-status');
      }
    }

    // Update Ecosystem stats cards
    const leavesValEl = document.getElementById('eco-stat-leaves');
    const absorptionEl = document.getElementById('eco-stat-absorption');
    const oxygenEl = document.getElementById('eco-stat-oxygen');

    // Absorption: fully green tree absorbs 22kg CO2/yr. dead tree absorbs 0.
    const absorptionVal = (this.health * 22.0).toFixed(1);
    const oxygenVal = Math.round(this.health * 100);

    if (leavesValEl) leavesValEl.textContent = this.activeLeafCount;
    if (absorptionEl) absorptionEl.textContent = `${absorptionVal} kg/yr`;
    if (oxygenEl) oxygenEl.textContent = `${oxygenVal}%`;
  }

  // --- Animation Frame Loop ---

  animate() {
    requestAnimationFrame(() => this.animate());

    this.time += 0.015;

    // 1. Wind sway branches (using sin waves & weather wind speed factor)
    const windIntensity = (0.2 + (1.0 - this.health) * 0.8) * (this.weatherSwayFactor || 1.0);
    this.branches.forEach(b => {
      if (b.depth === 0) return; // base trunk is stiff
      
      const sway = Math.sin(this.time * b.swaySpeed + b.swayOffset) * b.swayAmount * windIntensity;
      
      // Create local rotation around Z or X axis
      const swayRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(sway, 0, sway * 0.5));
      b.mesh.quaternion.copy(b.originalRotation).multiply(swayRot);
    });

    // 2. Animate and update leaves (growth, color, falling)
    this.updateLeaves();

    // 2b. Animate and update fruits (growth, color, falling)
    this.updateFruits();

    // 2c. Update face emotion based on health
    this.updateFace();

    // 3. Update environment colors (grass & soil)
    this.updateEnvironmentColors();

    // 4. Floating fireflies (nature)
    this.animateFireflies();

    // 5. Floating smog (pollution)
    this.animateSmog();

    // 5b. Floating snow (weather)
    this.animateSnow();

    // 6. Dynamic particles opacity
    this.updateParticlesOpacity();

    // 7. Interactive Watering Rain
    this.animateWater();

    // 8. Interactive Cleanse Wind Blast
    this.animateCleanse();

    // 8b. Animate Caretaker Boy
    this.animateBoy();
    this.updateSpeechBubblePosition();
    this.updateSpeechState();

    // Smoothly interpolate weather transitions (lights & precipitations)
    this.interpolateWeatherTransitions();

    // OrbitControls damping
    if (this.controls) this.controls.update();

    this.renderer.render(this.scene, this.camera);
  }

  updateLeaves() {
    // Target attached leaves count based on health
    const targetAttachedCount = Math.floor(this.leaves.length * this.health);
    let currentAttached = this.leaves.filter(l => !l.isDetached).length;

    // Detach leaves if health drops
    if (currentAttached > targetAttachedCount) {
      const attachedLeaves = this.leaves.filter(l => !l.isDetached);
      const toDetach = attachedLeaves[Math.floor(Math.random() * attachedLeaves.length)];
      if (toDetach) {
        toDetach.isDetached = true;
        toDetach.restingTime = 0;
        // Small puff velocity
        toDetach.velocity.set(
          (Math.random() - 0.5) * 0.01,
          -0.005 - Math.random() * 0.01,
          (Math.random() - 0.5) * 0.01
        );
      }
    }
    // Regrow leaves if health recovers
    else if (currentAttached < targetAttachedCount) {
      const detachedLeaves = this.leaves.filter(l => l.isDetached);
      const toRegrow = detachedLeaves[Math.floor(Math.random() * detachedLeaves.length)];
      if (toRegrow) {
        toRegrow.isDetached = false;
        toRegrow.mesh.position.copy(toRegrow.originalPosition);
        toRegrow.mesh.scale.set(0, 0, 0); // Grow from zero scale
        toRegrow.velocity.set(0, 0, 0);
      }
    }

    this.activeLeafCount = currentAttached;
    const leavesValEl = document.getElementById('eco-stat-leaves');
    if (leavesValEl) leavesValEl.textContent = this.activeLeafCount;

    // Leaves update loop
    const timeFactor = this.time;

    this.leaves.forEach((l, idx) => {
      // Leaf Color interpolation based on local leaf health
      const leafNoise = (idx % 7) / 7.0;
      const localHealth = Math.max(0.0, Math.min(1.0, this.health + (leafNoise - 0.5) * 0.15));

      if (localHealth >= 0.75) {
        // Flourishing Emerald
        const t = (localHealth - 0.75) / 0.25;
        this.tempColor.set('#10b981').lerp(this.tempColor2.set('#34d399'), t * leafNoise);
      } else if (localHealth >= 0.45) {
        // Autumn Stressed Yellowish
        const t = (localHealth - 0.45) / 0.3;
        this.tempColor.set('#a3e635').lerp(this.tempColor2.set('#fbbf24'), (1.0 - t));
      } else if (localHealth >= 0.2) {
        // Rust Orange
        const t = (localHealth - 0.2) / 0.25;
        this.tempColor.set('#f97316').lerp(this.tempColor2.set('#783c1d'), (1.0 - t));
      } else {
        // Dead Charcoal Grey
        const t = localHealth / 0.2;
        this.tempColor.set('#783c1d').lerp(this.tempColor2.set('#27272a'), (1.0 - t));
      }

      // Smooth color transition
      l.mesh.material.color.lerp(this.tempColor, 0.05);

      // Handle leaf physics if detached (falling)
      if (l.isDetached) {
        // Apply gravity
        l.velocity.y -= 0.0006;
        // Apply wind drift
        l.velocity.x += Math.sin(timeFactor * 2.0 + idx) * 0.0003;
        l.velocity.z += Math.cos(timeFactor * 1.5 + idx) * 0.0003;

        l.mesh.position.add(l.velocity);
        
        // Spin falling leaf
        l.mesh.rotation.x += l.rotationalVelocity.x;
        l.mesh.rotation.y += l.rotationalVelocity.y;

        // Ground collision (grass boundary y = -1.8)
        if (l.mesh.position.y <= -1.8) {
          l.mesh.position.y = -1.8;
          l.velocity.set(0, 0, 0);
          l.restingTime += 1;

          // Fade out and shrink after resting on soil
          if (l.restingTime > 90) {
            this.tempVector.set(0, 0, 0);
            l.mesh.scale.lerp(this.tempVector, 0.08);
          }
        }
      } else {
        // If attached, scale back to original size (regrow)
        this.tempVector.set(l.originalScale, l.originalScale, l.originalScale);
        l.mesh.scale.lerp(this.tempVector, 0.04);
        
        // Sway attached leaves slightly in the wind
        const leafSwayX = Math.sin(timeFactor * 1.8 + idx) * 0.04;
        const leafSwayY = Math.cos(timeFactor * 1.4 + idx) * 0.04;
        this.tempVector.set(leafSwayX, leafSwayY, 0);
        l.mesh.position.copy(l.originalPosition).add(this.tempVector);
      }
    });
  }

  updateEnvironmentColors() {
    if (this.health >= 0.5) {
      const t = (this.health - 0.5) / 0.5;
      this.targetGrass.copy(this.stressedGrass).lerp(this.healthyGrass, t);
      this.targetSoil.copy(this.stressedSoil).lerp(this.healthySoil, t);
      // Bright spotlight
      if (this.glowLight) {
        this.glowLight.color.set('#10b981').lerp(this.tempColor.set('#fbbf24'), 1.0 - t);
        this.glowLight.intensity = 1.0 + t * 0.5;
      }
    } else {
      const t = this.health / 0.5;
      this.targetGrass.copy(this.deadGrass).lerp(this.stressedGrass, t);
      this.targetSoil.copy(this.deadSoil).lerp(this.stressedSoil, t);
      // Toxic spotlight glow
      if (this.glowLight) {
        this.glowLight.color.set('#b45309').lerp(this.tempColor.set('#fbbf24'), t);
        this.glowLight.intensity = 0.3 + t * 0.7;
      }
    }

    this.grassMaterial.color.lerp(this.targetGrass, 0.04);
    this.soilMaterial.color.lerp(this.targetSoil, 0.04);

    // Fade ambient light according to health
    if (this.ambientLight) {
      this.tempColor.copy(this.deadAmbient).lerp(this.healthyAmbient, this.health);
      this.ambientLight.color.lerp(this.tempColor, 0.04);
    }
  }

  animateFireflies() {
    if (!this.fireflies) return;
    const positions = this.fireflies.geometry.attributes.position.array;

    for (let i = 0; i < this.fireflyData.length; i++) {
      const data = this.fireflyData[i];

      // Float upwards
      positions[i * 3 + 1] += data.speedY;

      // Sinusoidal orbit around base coordinate
      positions[i * 3] = data.baseX + Math.sin(this.time + data.phase) * data.amplitude;
      positions[i * 3 + 2] = data.baseZ + Math.cos(this.time + data.phase) * data.amplitude;

      // Recycle to bottom if floating past crown
      if (positions[i * 3 + 1] > 1.8) {
        positions[i * 3 + 1] = -1.1;
      }
    }
    this.fireflies.geometry.attributes.position.needsUpdate = true;
  }

  animateSmog() {
    if (!this.smog) return;
    const positions = this.smog.geometry.attributes.position.array;

    for (let i = 0; i < this.smogData.length; i++) {
      const data = this.smogData[i];

      // Float upwards
      positions[i * 3 + 1] += data.speedY;

      // Wind sway
      positions[i * 3] += Math.sin(this.time * 0.8 + data.phase) * 0.003;
      positions[i * 3 + 2] += Math.cos(this.time * 0.8 + data.phase) * 0.003;

      // Apply air blast velocity if active
      if (this.isCleansing) {
        positions[i * 3] += data.blastVelocity.x;
        positions[i * 3 + 1] += data.blastVelocity.y;
        positions[i * 3 + 2] += data.blastVelocity.z;
        // Apply friction/decay to blast
        data.blastVelocity.multiplyScalar(0.92);
      }

      // Recycle if floating past screen boundaries
      if (positions[i * 3 + 1] > 2.0 || Math.abs(positions[i * 3]) > 4 || Math.abs(positions[i * 3 + 2]) > 4) {
        positions[i * 3 + 1] = -1.8;
        
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 1.5;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
        
        data.baseX = positions[i * 3];
        data.baseZ = positions[i * 3 + 2];
        data.blastVelocity.set(0, 0, 0);
      }
    }
    this.smog.geometry.attributes.position.needsUpdate = true;
  }

  updateParticlesOpacity() {
    // Fireflies show when healthy
    if (this.fireflyMaterial) {
      this.fireflyMaterial.opacity = Math.max(0.0, (this.health - 0.25) / 0.75) * 0.95;
    }
    // Smog shows when polluted
    if (this.smogMaterial) {
      this.smogMaterial.opacity = Math.max(0.0, (0.75 - this.health) / 0.75) * 0.65;
    }
  }

  animateWater() {
    if (!this.isWatering) return;

    this.waterLifetime--;
    const positions = this.water.geometry.attributes.position.array;

    for (let i = 0; i < this.waterData.length; i++) {
      const data = this.waterData[i];
      
      // Update position with velocity
      positions[i * 3] += data.velocity.x;
      positions[i * 3 + 1] += data.velocity.y;
      positions[i * 3 + 2] += data.velocity.z;

      // Gravity pulls drops down
      data.velocity.y -= 0.0015;

      // Ground collision
      if (positions[i * 3 + 1] <= -1.8) {
        // Splat on ground: reset to bottom hidden
        positions[i * 3 + 1] = -99;
      }
    }
    this.water.geometry.attributes.position.needsUpdate = true;

    // Fade water opacity out towards end of life
    if (this.waterLifetime < 30) {
      this.waterMaterial.opacity = (this.waterLifetime / 30.0) * 0.8;
    } else {
      this.waterMaterial.opacity = 0.8;
    }

    if (this.waterLifetime <= 0) {
      this.isWatering = false;
      // Completely hide all
      for (let i = 0; i < this.waterData.length; i++) {
        positions[i * 3 + 1] = -99;
      }
      this.water.geometry.attributes.position.needsUpdate = true;
    }
  }

  animateCleanse() {
    if (!this.isCleansing) return;

    this.cleanseRadius += 0.08;
    
    // Scale ring mesh outward
    this.cleanseMesh.scale.set(this.cleanseRadius * 10, this.cleanseRadius * 10, 1);
    
    // Fade opacity out as it expands
    const opacity = Math.max(0.0, 1.0 - (this.cleanseRadius / 1.8));
    this.cleanseMaterial.opacity = opacity;

    if (opacity <= 0.0) {
      this.isCleansing = false;
    }
  }

  // --- Weather Precipitation and Environmental Handlers ---

  createSnowSystem() {
    const count = 50;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.snowData = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 3.5;
      positions[i * 3 + 1] = -99; // hide initially
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3.5;

      this.snowData.push({
        index: i,
        speedY: 0.005 + Math.random() * 0.01,
        driftSpeed: (Math.random() - 0.5) * 0.004
      });
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Fluffy white snow points
    this.snowMaterial = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 0.12,
      transparent: true,
      opacity: 0.0, // hide initially
      blending: THREE.NormalBlending
    });

    this.snow = new THREE.Points(geom, this.snowMaterial);
    this.scene.add(this.snow);
  }

  animateSnow() {
    if (!this.snow || this.snowMaterial.opacity === 0.0) return;
    const positions = this.snow.geometry.attributes.position.array;

    for (let i = 0; i < this.snowData.length; i++) {
      const data = this.snowData[i];
      
      positions[i * 3 + 1] -= data.speedY; // Fall down
      positions[i * 3] += data.driftSpeed + Math.sin(this.time + i) * 0.002; // Drift

      // Reset if hitting ground
      if (positions[i * 3 + 1] <= -1.8) {
        positions[i * 3 + 1] = 1.8 + Math.random() * 0.5;
        positions[i * 3] = (Math.random() - 0.5) * 3.5;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
      }
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
  }

  updateWeather(temp, code, isDay, windSpeed) {
    this.weatherTemp = temp;
    this.weatherCode = code;
    this.weatherIsDay = isDay;
    this.weatherWindSpeed = windSpeed;

    // 1. Map wind speed to branch sway factor
    this.weatherSwayFactor = 1.0 + (windSpeed / 12.0);

    // 2. Map day/night status to target sun light intensity
    if (isDay === 0) {
      // Nightlit environment
      this.targetSunIntensity = 0.08;
      this.targetSunColor = new THREE.Color('#38bdf8'); // cool moon blue
      this.targetAmbientColor = new THREE.Color('#0a1128'); // deep space blue
    } else {
      // Daylight environment
      this.targetSunIntensity = 1.1;
      this.targetSunColor = new THREE.Color('#ffffff'); // warm sun
      this.targetAmbientColor = new THREE.Color('#d4f3e6'); // default ambient
    }

    // 3. Map weather codes to precipitation systems
    // Rain codes: 51, 53, 55, 61, 63, 65, 80, 81, 82
    const rainCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82];
    // Snow codes: 71, 73, 75, 77, 85, 86
    const snowCodes = [71, 73, 75, 77, 85, 86];

    if (rainCodes.includes(code)) {
      this.targetRainOpacity = 0.75;
      this.targetSnowOpacity = 0.0;
      
      // Activate rain drops positions if they were hidden
      const positions = this.water.geometry.attributes.position.array;
      for (let i = 0; i < this.waterData.length; i++) {
        if (positions[i * 3 + 1] === -99) {
          positions[i * 3] = (Math.random() - 0.5) * 3.5;
          positions[i * 3 + 1] = 1.6 + Math.random() * 0.8;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
          this.waterData[i].velocity.set(
            (Math.random() - 0.5) * 0.01,
            -0.035 - Math.random() * 0.03,
            (Math.random() - 0.5) * 0.01
          );
        }
      }
      this.water.geometry.attributes.position.needsUpdate = true;
    } else if (snowCodes.includes(code)) {
      this.targetRainOpacity = 0.0;
      this.targetSnowOpacity = 0.85;

      // Activate snow positions
      const positions = this.snow.geometry.attributes.position.array;
      for (let i = 0; i < this.snowData.length; i++) {
        if (positions[i * 3 + 1] === -99) {
          positions[i * 3] = (Math.random() - 0.5) * 3.5;
          positions[i * 3 + 1] = 1.6 + Math.random() * 0.8;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
        }
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    } else {
      // Clear/Cloudy
      this.targetRainOpacity = 0.0;
      this.targetSnowOpacity = 0.0;
    }
  }

  interpolateWeatherTransitions() {
    // Lerp rain opacity
    if (this.waterMaterial) {
      let targetRain = this.targetRainOpacity || 0.0;
      if (this.isWatering) targetRain = Math.max(targetRain, 0.8);
      this.waterMaterial.opacity = THREE.MathUtils.lerp(this.waterMaterial.opacity, targetRain, 0.05);
    }
    
    // Lerp snow opacity
    if (this.snowMaterial) {
      this.snowMaterial.opacity = THREE.MathUtils.lerp(this.snowMaterial.opacity, this.targetSnowOpacity || 0.0, 0.05);
    }

    // Lerp sun intensity & color
    if (this.sunLight) {
      const targetIntensity = this.targetSunIntensity ?? 1.0;
      this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, targetIntensity, 0.03);
      if (this.targetSunColor) {
        this.sunLight.color.lerp(this.targetSunColor, 0.03);
      }
    }
  }

  createFace() {
    this.faceGroup = new THREE.Group();
    // Position on front of the main trunk
    this.faceGroup.position.set(0, -1.32, 0.076);
    this.treeGroup.add(this.faceGroup);

    // Common materials
    this.eyeWhiteMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.eyePupilMaterial = new THREE.MeshBasicMaterial({ color: '#18181b' });
    this.mouthMaterial = new THREE.MeshBasicMaterial({ color: '#27272a' });
    this.tearMaterial = new THREE.MeshBasicMaterial({ color: '#38bdf8' });

    // Eyes
    const eyeGeom = new THREE.SphereGeometry(0.015, 8, 8);
    const pupilGeom = new THREE.SphereGeometry(0.007, 8, 8);

    // Left Eye
    this.leftEye = new THREE.Group();
    const lWhite = new THREE.Mesh(eyeGeom, this.eyeWhiteMaterial);
    const lPupil = new THREE.Mesh(pupilGeom, this.eyePupilMaterial);
    lPupil.position.set(0, 0, 0.01);
    this.leftEye.add(lWhite, lPupil);
    this.leftEye.position.set(-0.024, 0, 0);
    this.faceGroup.add(this.leftEye);

    // Right Eye
    this.rightEye = new THREE.Group();
    const rWhite = new THREE.Mesh(eyeGeom, this.eyeWhiteMaterial);
    const rPupil = new THREE.Mesh(pupilGeom, this.eyePupilMaterial);
    rPupil.position.set(0, 0, 0.01);
    this.rightEye.add(rWhite, rPupil);
    this.rightEye.position.set(0.024, 0, 0);
    this.faceGroup.add(this.rightEye);

    // Mouth (5 small spheres positioned in an arc/line)
    this.mouthNodes = [];
    const mouthGeom = new THREE.SphereGeometry(0.008, 6, 6);
    for (let i = 0; i < 5; i++) {
      const node = new THREE.Mesh(mouthGeom, this.mouthMaterial);
      const x = -0.02 + (i * 0.01);
      node.position.set(x, -0.04, 0);
      this.faceGroup.add(node);
      this.mouthNodes.push(node);
    }

    // Tears (two small blue teardrops)
    this.tears = [];
    const tearGeom = new THREE.ConeGeometry(0.006, 0.015, 4);
    tearGeom.rotateX(Math.PI); // Point downwards
    for (let i = 0; i < 2; i++) {
      const tear = new THREE.Mesh(tearGeom, this.tearMaterial);
      tear.position.set(i === 0 ? -0.024 : 0.024, -0.02, 0.01);
      tear.scale.set(0, 0, 0); // hidden initially
      this.faceGroup.add(tear);
      this.tears.push(tear);
    }
  }

  updateFace() {
    if (!this.faceGroup) return;

    // Shift eyes and mouth based on health (Happy vs Neutral vs Frowning)
    if (this.health >= 0.70) {
      // Happy Smile
      this.mouthNodes[0].position.y = -0.032;
      this.mouthNodes[1].position.y = -0.038;
      this.mouthNodes[2].position.y = -0.042;
      this.mouthNodes[3].position.y = -0.038;
      this.mouthNodes[4].position.y = -0.032;

      // Hide tears
      this.tears.forEach(t => t.scale.set(0, 0, 0));
    } else if (this.health >= 0.40) {
      // Neutral face (Straight line)
      this.mouthNodes.forEach(node => {
        node.position.y = -0.04;
      });

      // Hide tears
      this.tears.forEach(t => t.scale.set(0, 0, 0));
    } else {
      // Sad / Frowning mouth
      this.mouthNodes[0].position.y = -0.046;
      this.mouthNodes[1].position.y = -0.040;
      this.mouthNodes[2].position.y = -0.036;
      this.mouthNodes[3].position.y = -0.040;
      this.mouthNodes[4].position.y = -0.046;

      // Make tears fall down
      this.tears.forEach(t => {
        t.scale.set(1, 1, 1);
        t.position.y -= 0.003;
        
        // Reset tear when it falls past chin
        if (t.position.y < -0.12) {
          t.position.y = -0.02;
        }
      });
    }
  }

  updateFruits() {
    // Target attached fruits count based on health
    const targetAttachedCount = Math.floor(this.fruits.length * this.health);
    let currentAttached = this.fruits.filter(f => !f.isDetached).length;

    // Detach fruits if health drops
    if (currentAttached > targetAttachedCount) {
      const attachedFruits = this.fruits.filter(f => !f.isDetached);
      const toDetach = attachedFruits[Math.floor(Math.random() * attachedFruits.length)];
      if (toDetach) {
        toDetach.isDetached = true;
        toDetach.restingTime = 0;
        toDetach.velocity.set(
          (Math.random() - 0.5) * 0.008,
          -0.012 - Math.random() * 0.015,
          (Math.random() - 0.5) * 0.008
        );
      }
    }
    // Regrow fruits if health recovers
    else if (currentAttached < targetAttachedCount) {
      const detachedFruits = this.fruits.filter(f => f.isDetached);
      const toRegrow = detachedFruits[Math.floor(Math.random() * detachedFruits.length)];
      if (toRegrow) {
        toRegrow.isDetached = false;
        toRegrow.mesh.position.copy(toRegrow.originalPosition);
        toRegrow.mesh.scale.set(0, 0, 0); // grow from 0
        toRegrow.velocity.set(0, 0, 0);
      }
    }

    const timeFactor = this.time;

    this.fruits.forEach((f, idx) => {
      // Color shifts: Red (healthy) -> Yellow (stressed) -> Brown (decayed) -> Dark (dead)
      if (this.health >= 0.70) {
        this.tempColor.set('#ef4444'); // Healthy Apple Red
      } else if (this.health >= 0.40) {
        this.tempColor.set('#eab308'); // Ripe Yellow
      } else if (this.health >= 0.15) {
        this.tempColor.set('#78350f'); // Rotting Brown
      } else {
        this.tempColor.set('#18181b'); // Rotting Black
      }

      f.mesh.material.color.lerp(this.tempColor, 0.05);

      if (f.isDetached) {
        // Fall down with gravity
        f.velocity.y -= 0.0012;
        f.mesh.position.add(f.velocity);
        
        f.mesh.rotation.x += f.rotationalVelocity.x;
        f.mesh.rotation.y += f.rotationalVelocity.y;

        // Ground collision (y = -1.8)
        if (f.mesh.position.y <= -1.8) {
          f.mesh.position.y = -1.8;
          f.velocity.set(0, 0, 0);
          f.restingTime += 1;

          // Fade out and shrink
          if (f.restingTime > 60) {
            this.tempVector.set(0, 0, 0);
            f.mesh.scale.lerp(this.tempVector, 0.08);
          }
        }
      } else {
        // Scale up (regrow)
        this.tempVector.set(f.originalScale, f.originalScale, f.originalScale);
        f.mesh.scale.lerp(this.tempVector, 0.04);
        
        // Sway slightly
        const fruitSwayX = Math.sin(timeFactor * 1.5 + idx) * 0.015;
        const fruitSwayY = Math.cos(timeFactor * 1.1 + idx) * 0.015;
        this.tempVector.set(fruitSwayX, fruitSwayY, 0);
        f.mesh.position.copy(f.originalPosition).add(this.tempVector);
      }
    });
  }

  createBoy() {
    this.boyGroup = new THREE.Group();
    // Start rest position (on grass platform y=-1.8)
    this.boyGroup.position.set(1.1, -1.8, 0.7);
    this.scene.add(this.boyGroup);

    // State machine variables
    this.boyState = 'idle'; // 'idle', 'walking_to_tree', 'raising_arm', 'watering', 'lowering_arm', 'walking_back', 'hugging', 'weeping', 'inspecting', 'dancing_tree'
    this.boyActionType = 'water'; // 'water', 'hug', 'inspect', 'weep', 'dance_wander'
    this.boyAnimTime = 0;
    this.boyTargetPos = new THREE.Vector3(0.4, -1.8, 0.4);
    this.boyHugPos = new THREE.Vector3(0.18, -1.8, 0.18); // closer for hugging
    this.boyRestPos = new THREE.Vector3(1.1, -1.8, 0.7);
    this.speechTimer = 0;
    this.speechBubbleText = '';
    this.wanderTimer = 0;
    this.wanderInterval = 500 + Math.random() * 300; // Wander trigger interval (8-13 seconds)

    // Create or reuse HTML speech bubble overlay
    this.speechBubble = document.getElementById('boy-speech-bubble');
    if (!this.speechBubble) {
      this.speechBubble = document.createElement('div');
      this.speechBubble.id = 'boy-speech-bubble';
      this.container.appendChild(this.speechBubble);
    }

    // Materials
    const shirtMaterial = new THREE.MeshStandardMaterial({
      color: '#0ea5e9', // bright sky blue
      flatShading: true,
      roughness: 0.8
    });
    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: '#475569', // slate grey
      flatShading: true,
      roughness: 0.9
    });
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: '#fdba74', // peach skin
      flatShading: true,
      roughness: 0.9
    });
    const hairMaterial = new THREE.MeshStandardMaterial({
      color: '#451a03', // dark brown
      flatShading: true,
      roughness: 0.95
    });

    // 1. Torso
    const torsoGeom = new THREE.BoxGeometry(0.15, 0.28, 0.12);
    this.boyTorso = new THREE.Mesh(torsoGeom, shirtMaterial);
    this.boyTorso.position.set(0, 0.38, 0);
    this.boyTorso.castShadow = true;
    this.boyTorso.receiveShadow = true;
    this.boyGroup.add(this.boyTorso);

    // 2. Head
    const headGeom = new THREE.SphereGeometry(0.075, 8, 8);
    this.boyHead = new THREE.Mesh(headGeom, skinMaterial);
    this.boyHead.position.set(0, 0.60, 0);
    this.boyHead.castShadow = true;
    this.boyGroup.add(this.boyHead);

    // 3. Hair
    const hairGeom = new THREE.BoxGeometry(0.16, 0.05, 0.16);
    this.boyHair = new THREE.Mesh(hairGeom, hairMaterial);
    this.boyHair.position.set(0, 0.65, -0.015);
    this.boyHair.castShadow = true;
    this.boyGroup.add(this.boyHair);

    // 4. Left Leg
    const legGeom = new THREE.CylinderGeometry(0.024, 0.02, 0.24, 6);
    legGeom.translate(0, -0.12, 0); // pivot at top
    this.leftLeg = new THREE.Mesh(legGeom, pantsMaterial);
    this.leftLeg.position.set(-0.05, 0.24, 0);
    this.leftLeg.castShadow = true;
    this.leftLeg.receiveShadow = true;
    this.boyGroup.add(this.leftLeg);

    // 5. Right Leg
    this.rightLeg = new THREE.Mesh(legGeom, pantsMaterial);
    this.rightLeg.position.set(0.05, 0.24, 0);
    this.rightLeg.castShadow = true;
    this.rightLeg.receiveShadow = true;
    this.boyGroup.add(this.rightLeg);

    // 6. Left Arm
    const armGeom = new THREE.CylinderGeometry(0.02, 0.016, 0.24, 6);
    armGeom.translate(0, -0.12, 0); // pivot at top
    this.leftArm = new THREE.Mesh(armGeom, shirtMaterial);
    this.leftArm.position.set(-0.095, 0.48, 0);
    this.leftArm.castShadow = true;
    this.boyGroup.add(this.leftArm);

    // 7. Right Arm
    this.rightArm = new THREE.Mesh(armGeom, shirtMaterial);
    this.rightArm.position.set(0.095, 0.48, 0);
    this.rightArm.castShadow = true;
    this.boyGroup.add(this.rightArm);

    // 8. Watering Can
    this.wateringCan = new THREE.Group();
    this.wateringCan.position.set(0, -0.24, 0.02);

    const canMaterial = new THREE.MeshStandardMaterial({
      color: '#64748b', // metallic slate
      metalness: 0.6,
      roughness: 0.3,
      flatShading: true
    });
    const canBodyGeom = new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8);
    const canBody = new THREE.Mesh(canBodyGeom, canMaterial);
    canBody.castShadow = true;
    this.wateringCan.add(canBody);

    const spoutGeom = new THREE.CylinderGeometry(0.008, 0.006, 0.08, 6);
    spoutGeom.rotateX(Math.PI / 2.5); // tilt forward & up
    this.boySpout = new THREE.Mesh(spoutGeom, canMaterial);
    this.boySpout.position.set(0, 0.015, 0.055);
    this.boySpout.castShadow = true;
    this.wateringCan.add(this.boySpout);

    const handleGeom = new THREE.BoxGeometry(0.01, 0.04, 0.02);
    const handle = new THREE.Mesh(handleGeom, canMaterial);
    handle.position.set(0, 0.01, -0.045);
    this.wateringCan.add(handle);

    this.rightArm.add(this.wateringCan);
  }

  setBoySpeech(text, duration = 0) {
    if (!this.speechBubble) return;
    if (!text) {
      this.speechBubble.style.display = 'none';
      this.speechBubbleText = '';
      return;
    }
    
    this.speechBubble.innerHTML = text;
    this.speechBubble.style.display = 'block';
    this.speechBubbleText = text;
    
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
    }
    
    if (duration > 0) {
      this.speechTimeout = setTimeout(() => {
        this.speechBubble.style.display = 'none';
        this.speechBubbleText = '';
      }, duration);
    }
  }

  updateSpeechBubblePosition() {
    if (!this.speechBubble || this.speechBubble.style.display === 'none') return;
    
    const pos = this.tempVector;
    this.boyGroup.getWorldPosition(pos);
    
    // Project above head
    pos.y += 0.85;
    pos.project(this.camera);
    
    // If behind camera, hide
    if (pos.z > 1) {
      this.speechBubble.style.opacity = 0;
      return;
    }
    
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || 350;
    
    const x = (pos.x * 0.5 + 0.5) * width;
    const y = (pos.y * -0.5 + 0.5) * height;
    
    this.speechBubble.style.left = `${x}px`;
    this.speechBubble.style.top = `${y}px`;
    this.speechBubble.style.opacity = 1;
  }

  updateSpeechState() {
    if (this.boyState !== 'idle') return;
    
    this.speechTimer = (this.speechTimer || 0) + 1;
    
    if (this.health < 0.35) {
      if (this.speechTimer > 250 || !this.speechBubbleText) {
        this.speechTimer = 0;
        const sadRemarks = [
          "Oh no... you killed the tree! 😭",
          "It's too polluted! 😢",
          "Please reduce carbon emissions! 💔",
          "I can't breathe in this smog! 🥵"
        ];
        this.setBoySpeech(sadRemarks[Math.floor(Math.random() * sadRemarks.length)]);
      }
    } else if (this.health >= 0.85) {
      if (this.speechTimer > 350 || !this.speechBubbleText) {
        this.speechTimer = 0;
        const happyRemarks = [
          "The tree is so happy! 🌳✨",
          "I love clean energy! 💚",
          "Dancing for a green planet! 💃",
          "This ecosystem is pristine! 🌍"
        ];
        this.setBoySpeech(happyRemarks[Math.floor(Math.random() * happyRemarks.length)]);
      }
    } else {
      // Neutral
      if (this.speechTimer > 500) {
        this.speechTimer = 0;
        const neutralRemarks = [
          "Doing great! Let's keep it green! 👍",
          "Every carbon reduction helps! 🌱",
          "Let's protect this ecosystem! 💚"
        ];
        this.setBoySpeech(neutralRemarks[Math.floor(Math.random() * neutralRemarks.length)], 3500);
      } else if (!this.speechBubbleText) {
        this.setBoySpeech(null);
      }
    }
  }

  animateBoy() {
    if (!this.boyGroup) return;

    // Reset base posture values
    this.boyTorso.position.y = 0.38;
    this.boyHead.position.set(0, 0.60, 0);
    this.boyHead.rotation.set(0, 0, 0);
    this.boyGroup.rotation.y = 0;

    // State machine
    if (this.boyState === 'idle') {
      // Stand still at resting position
      this.boyGroup.position.copy(this.boyRestPos);
      this.boyGroup.lookAt(0, -1.8, 0); // Face the tree

      // Idle movement: Breathing sways (keeps him in motion always)
      const breathingFactor = this.health < 0.35 ? 1.5 : 1.0;
      this.boyTorso.position.y = 0.38 + Math.sin(this.time * 2.5) * 0.005 * breathingFactor;
      this.leftArm.rotation.z = Math.sin(this.time * 2.5) * 0.02 + 0.02;
      this.rightArm.rotation.z = -Math.sin(this.time * 2.5) * 0.02 - 0.02;

      // Crying Sobbing Pose (Tree is Dead/Dying)
      if (this.health < 0.35) {
        this.boyHead.rotation.x = 0.35; // hang head low
        this.boyHead.rotation.y = Math.sin(this.time * 16) * 0.05; // shudder in crying
        
        // Hands cover face/weeping
        this.leftArm.rotation.x = -Math.PI * 0.75 + Math.sin(this.time * 12) * 0.04;
        this.leftArm.rotation.y = Math.PI * 0.15;
        this.rightArm.rotation.x = -Math.PI * 0.75 + Math.sin(this.time * 12) * 0.04;
        this.rightArm.rotation.y = -Math.PI * 0.15;

        // Sobbing chest vibrations
        const sob = Math.sin(this.time * 12) * 0.012;
        this.boyTorso.position.y = 0.38 + sob;
        this.boyHead.position.y = 0.60 + sob;

        this.leftLeg.rotation.x = 0;
        this.rightLeg.rotation.x = 0;
        this.wateringCan.rotation.x = 0;
      } 
      // Happy Dancing Pose (Tree is Pristine)
      else if (this.health >= 0.85) {
        const danceSpeed = 8.0;
        
        // Hop up and down
        this.boyGroup.position.y = -1.8 + Math.abs(Math.sin(this.time * danceSpeed)) * 0.10;
        
        // Twist body
        this.boyGroup.rotation.y = Math.sin(this.time * danceSpeed) * 0.28;
        this.boyGroup.lookAt(0, this.boyGroup.position.y, 0);
        this.boyGroup.rotation.y += Math.sin(this.time * danceSpeed) * 0.28;
        
        // Wave arms in the air
        this.leftArm.rotation.x = -Math.PI / 1.5;
        this.leftArm.rotation.z = Math.sin(this.time * danceSpeed) * 0.6 + 0.7;
        this.rightArm.rotation.x = -Math.PI / 1.5;
        this.rightArm.rotation.z = -Math.sin(this.time * danceSpeed) * 0.6 - 0.7;
        
        // Swing legs
        this.leftLeg.rotation.x = Math.sin(this.time * danceSpeed) * 0.3;
        this.rightLeg.rotation.x = -Math.sin(this.time * danceSpeed) * 0.3;
        this.wateringCan.rotation.x = 0;
      } 
      // Worried Breathing Pose (Tree is Stressed/Medium)
      else {
        // Shift head around looking at the stressed tree
        this.boyHead.rotation.y = Math.sin(this.time * 0.8) * 0.25;
        this.boyHead.position.y = 0.60 + Math.sin(this.time * 2.5) * 0.007;

        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.1);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.1);
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.1);
        this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, 0, 0.1);
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, 0.1);
        this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, 0, 0.1);
        this.wateringCan.rotation.x = THREE.MathUtils.lerp(this.wateringCan.rotation.x, 0, 0.1);
      }

      // Autonomous Wandering Trigger (Boy moves by his own based on health state)
      this.wanderTimer++;
      if (this.wanderTimer > this.wanderInterval) {
        this.wanderTimer = 0;
        this.wanderInterval = 600 + Math.random() * 450; // trigger every 10-18 seconds
        
        this.boyState = 'walking_to_tree';
        if (this.health < 0.35) {
          this.boyActionType = 'weep'; // goes to weep/comfort
        } else if (this.health >= 0.85) {
          this.boyActionType = 'dance_wander'; // goes to dance at tree
        } else {
          this.boyActionType = 'inspect'; // goes to inspect base worriedly
        }
        this.boyAnimTime = 0;
      }
    } 
    else if (this.boyState === 'walking_to_tree') {
      this.boyAnimTime += 1;
      
      // Determine walking speed and leg swings based on actions/health
      let duration = 60;
      let swingSpeed = 0.25;
      let swingMultiplier = 1.0;
      let targetPos = this.boyTargetPos;

      if (this.boyActionType === 'weep') {
        duration = 110; // extremely slow heavy grieving walk
        swingSpeed = 0.12;
        swingMultiplier = 0.4;
        targetPos = this.boyHugPos;
      } else if (this.boyActionType === 'inspect') {
        duration = 85; // cautious slow walk
        swingSpeed = 0.18;
        swingMultiplier = 0.7;
        targetPos = this.boyHugPos;
      } else if (this.boyActionType === 'dance_wander') {
        duration = 45; // quick happy skip
        swingSpeed = 0.32;
        swingMultiplier = 1.4;
      } else if (this.boyActionType === 'hug') {
        duration = 60;
        targetPos = this.boyHugPos;
      }

      const t = Math.min(1.0, this.boyAnimTime / duration);
      
      // Interpolate position
      this.boyGroup.position.lerpVectors(this.boyRestPos, targetPos, t);
      this.boyGroup.lookAt(targetPos.x, -1.8, targetPos.z);
      
      // Walk swings
      this.leftLeg.rotation.x = Math.sin(this.boyAnimTime * swingSpeed) * 0.45 * swingMultiplier;
      this.rightLeg.rotation.x = -Math.sin(this.boyAnimTime * swingSpeed) * 0.45 * swingMultiplier;
      this.leftArm.rotation.x = -Math.sin(this.boyAnimTime * swingSpeed) * 0.2 * swingMultiplier;
      this.rightArm.rotation.x = Math.sin(this.boyAnimTime * swingSpeed) * 0.2 * swingMultiplier;

      if (t >= 1.0) {
        if (this.boyActionType === 'hug') {
          this.boyState = 'hugging';
          this.setBoySpeech("Thank you! Hugs for the tree! 🤗💚", 2500);
        } else if (this.boyActionType === 'weep') {
          this.boyState = 'weeping';
          this.setBoySpeech("I'm so sorry, tree... 😭 Please reduce carbon!", 3000);
        } else if (this.boyActionType === 'inspect') {
          this.boyState = 'inspecting';
          this.setBoySpeech("Are you doing okay, tree? 😢", 2500);
        } else if (this.boyActionType === 'dance_wander') {
          this.boyState = 'dancing_tree';
          this.setBoySpeech("Woohoo! Thriving tree! 🌳💃", 2500);
        } else {
          this.boyState = 'raising_arm';
          this.setBoySpeech("Thirsty tree? Here is some water! 💧", 2500);
        }
        this.boyAnimTime = 0;
      }
    } 
    else if (this.boyState === 'hugging') {
      this.boyAnimTime += 1;
      
      this.boyGroup.position.copy(this.boyHugPos);
      this.boyGroup.lookAt(0, -1.8, 0);

      // Arm wrap around trunk (hug)
      this.leftArm.rotation.x = -Math.PI / 2.2;
      this.leftArm.rotation.y = Math.PI / 4;
      this.rightArm.rotation.x = -Math.PI / 2.2;
      this.rightArm.rotation.y = -Math.PI / 4;

      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      
      if (this.boyAnimTime >= 90) {
        this.leftArm.rotation.y = 0;
        this.rightArm.rotation.y = 0;
        this.boyState = 'walking_back';
        this.boyAnimTime = 0;
        this.setBoySpeech(null);
      }
    }
    else if (this.boyState === 'weeping') {
      this.boyAnimTime += 1;
      
      this.boyGroup.position.copy(this.boyHugPos);
      this.boyGroup.lookAt(0, -1.8, 0);

      // Sad head down + sob shake
      this.boyHead.rotation.x = 0.35;
      this.leftArm.rotation.x = -Math.PI * 0.75 + Math.sin(this.boyAnimTime * 0.4) * 0.04;
      this.rightArm.rotation.x = -Math.PI * 0.75 + Math.sin(this.boyAnimTime * 0.4) * 0.04;
      this.leftArm.rotation.y = Math.PI * 0.15;
      this.rightArm.rotation.y = -Math.PI * 0.15;

      const sob = Math.sin(this.boyAnimTime * 0.4) * 0.01;
      this.boyTorso.position.y = 0.38 + sob;
      this.boyHead.position.y = 0.60 + sob;

      if (this.boyAnimTime >= 100) {
        this.leftArm.rotation.y = 0;
        this.rightArm.rotation.y = 0;
        this.boyState = 'walking_back';
        this.boyAnimTime = 0;
        this.setBoySpeech(null);
      }
    }
    else if (this.boyState === 'inspecting') {
      this.boyAnimTime += 1;
      
      this.boyGroup.position.copy(this.boyHugPos);
      this.boyGroup.lookAt(0, -1.8, 0);

      // Lean forward and look up & down tree trunk
      this.boyHead.rotation.x = Math.sin(this.boyAnimTime * 0.08) * 0.25 - 0.1;
      this.leftArm.rotation.x = -0.3; // relaxed/thoughtful
      this.rightArm.rotation.x = -0.3;

      if (this.boyAnimTime >= 100) {
        this.boyState = 'walking_back';
        this.boyAnimTime = 0;
        this.setBoySpeech(null);
      }
    }
    else if (this.boyState === 'dancing_tree') {
      this.boyAnimTime += 1;
      
      this.boyGroup.position.copy(this.boyTargetPos);
      
      // Happy spin at tree base
      this.boyGroup.rotation.y = this.boyAnimTime * 0.15;
      this.leftArm.rotation.x = -Math.PI / 1.5;
      this.rightArm.rotation.x = -Math.PI / 1.5;
      this.boyGroup.position.y = -1.8 + Math.abs(Math.sin(this.boyAnimTime * 0.2)) * 0.08;

      if (this.boyAnimTime >= 80) {
        this.boyState = 'walking_back';
        this.boyAnimTime = 0;
        this.setBoySpeech(null);
      }
    }
    else if (this.boyState === 'raising_arm') {
      this.boyAnimTime += 1;
      
      this.boyGroup.lookAt(0, -1.8, 0);

      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.1);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.1);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.1);

      const duration = 20;
      const t = Math.min(1.0, this.boyAnimTime / duration);
      
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -Math.PI / 2.2, 0.1);
      this.wateringCan.rotation.x = THREE.MathUtils.lerp(this.wateringCan.rotation.x, -Math.PI / 4, 0.1);

      if (t >= 1.0) {
        this.boyState = 'watering';
        this.boyAnimTime = 0;
        this.isWatering = true;
        this.waterLifetime = 90;
      }
    } 
    else if (this.boyState === 'watering') {
      this.boyAnimTime += 1;
      
      this.boyGroup.lookAt(0, -1.8, 0);

      this.rightArm.rotation.x = -Math.PI / 2.2;
      this.wateringCan.rotation.x = -Math.PI / 4;

      // Spawning water particles from spout
      const positions = this.water.geometry.attributes.position.array;
      const spoutPos = this.tempVector2;
      if (this.boySpout) {
        this.boySpout.getWorldPosition(spoutPos);
      } else {
        spoutPos.set(0.35, -1.3, 0.35);
      }
      
      let emitted = 0;
      for (let i = 0; i < this.waterData.length; i++) {
        if (positions[i * 3 + 1] === -99) {
          positions[i * 3] = spoutPos.x + (Math.random() - 0.5) * 0.02;
          positions[i * 3 + 1] = spoutPos.y + (Math.random() - 0.5) * 0.02;
          positions[i * 3 + 2] = spoutPos.z + (Math.random() - 0.5) * 0.02;
          
          const dirX = -spoutPos.x;
          const dirZ = -spoutPos.z;
          const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
          
          this.waterData[i].velocity.set(
            (dirX / len) * 0.015 + (Math.random() - 0.5) * 0.005,
            -0.005 - Math.random() * 0.015,
            (dirZ / len) * 0.015 + (Math.random() - 0.5) * 0.005
          );
          
          emitted++;
          if (emitted >= 3) break;
        }
      }
      this.water.geometry.attributes.position.needsUpdate = true;

      if (this.boyAnimTime >= 90) {
        this.boyState = 'lowering_arm';
        this.boyAnimTime = 0;
        this.setBoySpeech(null);
      }
    } 
    else if (this.boyState === 'lowering_arm') {
      this.boyAnimTime += 1;
      
      this.boyGroup.lookAt(0, -1.8, 0);

      const duration = 20;
      const t = Math.min(1.0, this.boyAnimTime / duration);
      
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, 0.1);
      this.wateringCan.rotation.x = THREE.MathUtils.lerp(this.wateringCan.rotation.x, 0, 0.1);

      if (t >= 1.0) {
        this.boyState = 'walking_back';
        this.boyAnimTime = 0;
      }
    } 
    else if (this.boyState === 'walking_back') {
      this.boyAnimTime += 1;
      
      // Determine walking back speeds based on the actions
      let duration = 60;
      let swingSpeed = 0.25;
      let swingMultiplier = 1.0;
      let startPos = this.boyTargetPos;

      if (this.boyActionType === 'weep') {
        duration = 110;
        swingSpeed = 0.12;
        swingMultiplier = 0.4;
        startPos = this.boyHugPos;
      } else if (this.boyActionType === 'inspect') {
        duration = 85;
        swingSpeed = 0.18;
        swingMultiplier = 0.7;
        startPos = this.boyHugPos;
      } else if (this.boyActionType === 'dance_wander') {
        duration = 45;
        swingSpeed = 0.32;
        swingMultiplier = 1.4;
        startPos = this.boyTargetPos;
      } else if (this.boyActionType === 'hug') {
        duration = 60;
        startPos = this.boyHugPos;
      }

      const t = Math.min(1.0, this.boyAnimTime / duration);
      
      this.boyGroup.position.lerpVectors(startPos, this.boyRestPos, t);
      this.boyGroup.lookAt(this.boyRestPos.x, -1.8, this.boyRestPos.z);
      
      this.leftLeg.rotation.x = Math.sin(this.boyAnimTime * swingSpeed) * 0.45 * swingMultiplier;
      this.rightLeg.rotation.x = -Math.sin(this.boyAnimTime * swingSpeed) * 0.45 * swingMultiplier;
      this.leftArm.rotation.x = -Math.sin(this.boyAnimTime * swingSpeed) * 0.2 * swingMultiplier;
      this.rightArm.rotation.x = Math.sin(this.boyAnimTime * swingSpeed) * 0.2 * swingMultiplier;

      if (t >= 1.0) {
        this.boyState = 'idle';
        this.boyAnimTime = 0;
        this.boyActionType = 'water'; // reset
      }
    }
  }
}
