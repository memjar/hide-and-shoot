import * as THREE from 'three';
import { io } from 'socket.io-client';

const socket = io(window.location.origin);
let myId = null;
let roomState = null;
let isSeeker = false;
let isCaught = false;

socket.on('connect', () => { myId = socket.id; });

const screens = {
  menu: document.getElementById('screen-menu'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  results: document.getElementById('screen-results'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  if (name === 'game' && !renderer) initGame();
}

// --- MENU ---
const nameInput = document.getElementById('player-name');
const codeInput = document.getElementById('room-code-input');
const menuError = document.getElementById('menu-error');

document.getElementById('btn-create').onclick = () => {
  const name = nameInput.value.trim() || 'Player';
  socket.emit('room:create', name, (res) => {
    if (res.ok) showScreen('lobby');
    else menuError.textContent = res.error;
  });
};
document.getElementById('btn-join-toggle').onclick = () => {
  document.getElementById('join-section').style.display = 'block';
};
document.getElementById('btn-join').onclick = () => {
  const name = nameInput.value.trim() || 'Player';
  const code = codeInput.value.trim();
  if (!code) return;
  socket.emit('room:join', code, name, (res) => {
    if (res.ok) showScreen('lobby');
    else menuError.textContent = res.error;
  });
};
document.getElementById('btn-ready').onclick = () => socket.emit('room:ready');
document.getElementById('btn-start').onclick = () => socket.emit('game:start');

// --- ROOM STATE ---
socket.on('room:state', (state) => {
  roomState = state;
  const me = state.players.find(p => p.id === myId);
  isSeeker = me?.isSeeker || false;
  isCaught = me?.caught || false;

  if (state.phase === 'lobby') {
    showScreen('lobby');
    document.getElementById('lobby-code').textContent = state.code;
    const list = document.getElementById('lobby-players');
    list.innerHTML = '';
    state.players.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${p.name} ${p.id === state.host ? '<span class="host">HOST</span>' : ''}</span><span class="${p.ready ? 'ready' : ''}">${p.ready ? 'READY' : '...'}</span>`;
      list.appendChild(li);
    });
    document.getElementById('btn-start').style.display = (state.host === myId && state.players.length >= 2) ? 'inline-block' : 'none';
  } else if (state.phase === 'results') {
    showScreen('results');
    const board = document.getElementById('results-board');
    board.innerHTML = '';
    [...state.players].sort((a, b) => b.score - a.score).forEach(p => {
      const row = document.createElement('div');
      row.className = 'row' + (p.isSeeker ? ' seeker' : '');
      row.innerHTML = `<span>${p.name}${p.isSeeker ? ' [SEEKER]' : p.caught ? ' [CAUGHT]' : ' [SURVIVED]'}</span><span>${p.score}</span>`;
      board.appendChild(row);
    });
  } else if (['paint', 'hide', 'seek'].includes(state.phase)) {
    showScreen('game');
    updateGameUI(state);
  }
});

socket.on('room:tick', (t) => {
  if (roomState) roomState.timeLeft = t;
  document.getElementById('timer').textContent = t;
  const timerEl = document.getElementById('timer');
  timerEl.className = 'timer' + (t <= 5 ? ' urgent' : '');
});

// --- 3D ENGINE ---
let renderer, scene, camera;
let mapMeshes = [];
let playerMeshes = new Map();
let paintCanvas, paintCtx, paintTexture;
let keys = {};
let mouseDown = false;
let yaw = 0, pitch = 0;
let playerBody;
let isPointerLocked = false;
let crosshair;
let raycaster = new THREE.Raycaster();

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];

const MAP_PALETTES = [
  { name: 'Forest', sky: '#87CEEB', fog: '#a8d8b9', ground: '#3a7d44', colors: ['#2d5a27', '#4a7c3f', '#1a3d15', '#6b8f62', '#8b6914'] },
  { name: 'Desert', sky: '#f0d9a0', fog: '#e8d4a8', ground: '#c2a645', colors: ['#c49b2f', '#8b6914', '#d4af37', '#a07828', '#e0c87a'] },
  { name: 'Arctic', sky: '#d4e6f1', fog: '#e8f0f8', ground: '#e8eef4', colors: ['#b8c9d9', '#9ab0c4', '#d0dde8', '#7a98b0', '#e0e8f0'] },
  { name: 'Urban', sky: '#9aa5b1', fog: '#b0b8c0', ground: '#5a6068', colors: ['#4d4d4d', '#7a7a7a', '#333333', '#a0a0a0', '#606870'] },
  { name: 'Jungle', sky: '#6aad5a', fog: '#4a8040', ground: '#1a5c10', colors: ['#0d3b08', '#2d6a22', '#4a8a40', '#1a5020', '#3a7030'] },
  { name: 'Sunset', sky: '#ff6b4a', fog: '#ff8866', ground: '#8b4513', colors: ['#6b2d2d', '#a54a4a', '#4d1a1a', '#c76b6b', '#8b3030'] },
];

let currentColor = '#2d5a27';
let brushSize = 18;
let paintPhaseCamera = null;

function initGame() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 250);

  buildMap(0);
  initPaintCanvas();
  initControls(canvas);
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function buildMap(mapIndex) {
  mapMeshes.forEach(m => scene.remove(m));
  mapMeshes = [];
  const palette = MAP_PALETTES[mapIndex % MAP_PALETTES.length];

  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.FogExp2(palette.fog, 0.012);

  // Lighting — warm directional + cool ambient + hemisphere
  scene.children.filter(c => c.isLight).forEach(l => scene.remove(l));

  const hemi = new THREE.HemisphereLight(palette.sky, palette.ground, 0.5);
  scene.add(hemi);
  mapMeshes.push(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);
  mapMeshes.push(ambient);

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
  sun.position.set(40, 60, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.bias = -0.001;
  scene.add(sun);
  mapMeshes.push(sun);

  const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
  fillLight.position.set(-30, 20, -20);
  scene.add(fillLight);
  mapMeshes.push(fillLight);

  // Ground with grid texture
  const groundSize = 80;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 40, 40);
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = 512;
  groundCanvas.height = 512;
  const gCtx = groundCanvas.getContext('2d');
  gCtx.fillStyle = palette.ground;
  gCtx.fillRect(0, 0, 512, 512);
  // Add subtle noise/grass texture
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = Math.random() * 40 - 20;
    const c = new THREE.Color(palette.ground);
    const r = Math.min(255, Math.max(0, c.r * 255 + shade));
    const g = Math.min(255, Math.max(0, c.g * 255 + shade));
    const b = Math.min(255, Math.max(0, c.b * 255 + shade));
    gCtx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
    gCtx.fillRect(x, y, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(4, 4);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9, metalness: 0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
  mapMeshes.push(ground);

  // Generate structures
  const structures = generateStructures(palette);
  structures.forEach(s => { scene.add(s); mapMeshes.push(s); });

  // Trees/decoration
  for (let i = 0; i < 20; i++) {
    const tree = createTree(palette);
    tree.position.set((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60);
    scene.add(tree);
    mapMeshes.push(tree);
  }

  // Boundary walls — invisible but collidable
  const bGeo = new THREE.BoxGeometry(80, 8, 1);
  const bMat = new THREE.MeshStandardMaterial({ color: palette.colors[0], transparent: true, opacity: 0.15 });
  [
    [0, 4, -40], [0, 4, 40]
  ].forEach(p => {
    const w = new THREE.Mesh(bGeo, bMat);
    w.position.set(...p);
    w.name = 'boundary';
    scene.add(w);
    mapMeshes.push(w);
  });
  const bGeo2 = new THREE.BoxGeometry(1, 8, 80);
  [[-40, 4, 0], [40, 4, 0]].forEach(p => {
    const w = new THREE.Mesh(bGeo2, bMat);
    w.position.set(...p);
    w.name = 'boundary';
    scene.add(w);
    mapMeshes.push(w);
  });

  // Player body
  playerBody = createCharacterModel('#D4AF37');
  playerBody.position.set(0, 0, 25);
  scene.add(playerBody);

  // Crosshair
  if (!crosshair) {
    const chGeo = new THREE.RingGeometry(0.008, 0.012, 16);
    const chMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false });
    crosshair = new THREE.Mesh(chGeo, chMat);
    crosshair.renderOrder = 999;
    camera.add(crosshair);
    crosshair.position.set(0, 0, -0.5);
    scene.add(camera);
  }
}

function generateStructures(palette) {
  const meshes = [];
  const layouts = [
    // Houses
    { type: 'house', pos: [8, 0, -8], size: [6, 4, 5] },
    { type: 'house', pos: [-12, 0, 6], size: [5, 3.5, 6] },
    { type: 'house', pos: [15, 0, 12], size: [7, 5, 5] },
    // Walls
    { type: 'wall', pos: [0, 0, -15], size: [12, 3, 0.5] },
    { type: 'wall', pos: [-18, 0, -5], size: [0.5, 2.5, 10] },
    { type: 'wall', pos: [5, 0, 5], size: [8, 2, 0.5] },
    // Crates
    { type: 'crate', pos: [-5, 0, -3], size: [2, 2, 2] },
    { type: 'crate', pos: [12, 0, 0], size: [1.5, 1.5, 1.5] },
    { type: 'crate', pos: [-8, 0, 15], size: [2.5, 2, 2] },
    { type: 'crate', pos: [20, 0, -5], size: [1.8, 1.8, 1.8] },
    // Barrels
    { type: 'barrel', pos: [-3, 0, 10] },
    { type: 'barrel', pos: [18, 0, 8] },
    { type: 'barrel', pos: [-15, 0, -12] },
    // Platforms
    { type: 'platform', pos: [-20, 0, 15], size: [8, 0.5, 4] },
    { type: 'platform', pos: [0, 0, 20], size: [5, 0.5, 5] },
  ];

  layouts.forEach(item => {
    let mesh;
    const ci = Math.floor(Math.random() * palette.colors.length);
    const color = palette.colors[ci];

    if (item.type === 'house') {
      mesh = createHouse(item.size, color, palette.colors[(ci + 1) % palette.colors.length]);
    } else if (item.type === 'wall') {
      mesh = createWall(item.size, color);
    } else if (item.type === 'crate') {
      mesh = createCrate(item.size, color);
    } else if (item.type === 'barrel') {
      mesh = createBarrel(color);
    } else if (item.type === 'platform') {
      mesh = createPlatform(item.size, color);
    }

    if (mesh) {
      mesh.position.set(item.pos[0], item.pos[1], item.pos[2]);
      meshes.push(mesh);
    }
  });

  return meshes;
}

function createHouse(size, wallColor, roofColor) {
  const group = new THREE.Group();
  const [w, h, d] = size;

  // Walls with window-like detail
  const wallGeo = new THREE.BoxGeometry(w, h, d);
  const wallTex = createDetailTexture(wallColor, 'brick');
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = h / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  walls.name = 'wall';
  group.add(walls);

  // Roof
  const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.7, h * 0.5, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.6 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = h + h * 0.25;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  roof.name = 'wall';
  group.add(roof);

  // Door
  const doorGeo = new THREE.PlaneGeometry(w * 0.3, h * 0.6);
  const doorMat = new THREE.MeshStandardMaterial({ color: '#4a3520', roughness: 0.9 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, h * 0.3, d / 2 + 0.01);
  group.add(door);

  return group;
}

function createWall(size, color) {
  const [w, h, d] = size;
  const geo = new THREE.BoxGeometry(w, h, d);
  const tex = createDetailTexture(color, 'stone');
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'wall';
  return mesh;
}

function createCrate(size, color) {
  const group = new THREE.Group();
  const [w, h, d] = size;
  const geo = new THREE.BoxGeometry(w, h, d);
  const tex = createDetailTexture(color, 'wood');
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'wall';
  group.add(mesh);

  // Cross detail on top
  const stripGeo = new THREE.BoxGeometry(w * 0.9, 0.05, 0.1);
  const stripMat = new THREE.MeshStandardMaterial({ color: '#3a2a1a' });
  const strip1 = new THREE.Mesh(stripGeo, stripMat);
  strip1.position.y = h + 0.03;
  group.add(strip1);
  const strip2 = strip1.clone();
  strip2.rotation.y = Math.PI / 2;
  group.add(strip2);

  return group;
}

function createBarrel(color) {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.6, 0.55, 1.4, 12);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.7;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'wall';
  group.add(mesh);

  // Metal bands
  [0.2, 0.7, 1.2].forEach(y => {
    const bandGeo = new THREE.TorusGeometry(0.58, 0.03, 8, 16);
    const bandMat = new THREE.MeshStandardMaterial({ color: '#555', metalness: 0.8, roughness: 0.3 });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.y = y;
    band.rotation.x = Math.PI / 2;
    group.add(band);
  });

  return group;
}

function createPlatform(size, color) {
  const [w, h, d] = size;
  const group = new THREE.Group();
  const topGeo = new THREE.BoxGeometry(w, h, d);
  const topMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = 1 + h / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  top.name = 'wall';
  group.add(top);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.15, 0.15, 1, 6);
  const legMat = new THREE.MeshStandardMaterial({ color: '#555' });
  const offX = w / 2 - 0.3;
  const offZ = d / 2 - 0.3;
  [[-offX, 0.5, -offZ], [offX, 0.5, -offZ], [-offX, 0.5, offZ], [offX, 0.5, offZ]].forEach(p => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(...p);
    group.add(leg);
  });

  return group;
}

function createTree(palette) {
  const group = new THREE.Group();
  const trunkH = 1.5 + Math.random() * 2;
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, trunkH, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a3a1a', roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const foliageColor = palette.colors[Math.floor(Math.random() * 3)];
  const layers = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < layers; i++) {
    const r = 1.5 - i * 0.35;
    const h = 1.2;
    const foliageGeo = new THREE.ConeGeometry(r, h, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: foliageColor, roughness: 0.8 });
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = trunkH + i * 0.7;
    foliage.castShadow = true;
    foliage.name = 'tree';
    group.add(foliage);
  }

  return group;
}

function createDetailTexture(baseColor, type) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(baseColor);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);

  if (type === 'brick') {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      const offset = (Math.floor(y / 32) % 2) * 32;
      for (let x = offset; x < 256; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke();
      }
    }
  } else if (type === 'stone') {
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.1})`;
      ctx.fillRect(x, y, 3 + Math.random() * 6, 3 + Math.random() * 6);
    }
  } else if (type === 'wood') {
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 256; y += 4 + Math.random() * 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createCharacterModel(color) {
  const group = new THREE.Group();

  // Body — rounded capsule shape
  const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.8, 12, 20);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.1;
  body.castShadow = true;
  body.name = 'playerBody';
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.85;
  head.castShadow = true;
  group.add(head);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.2, metalness: 0.5 });
  const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
  eye1.position.set(-0.1, 1.9, 0.24);
  group.add(eye1);
  const eye2 = eye1.clone();
  eye2.position.x = 0.1;
  group.add(eye2);

  // Eye whites
  const whiteGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#444' });
  const white1 = new THREE.Mesh(whiteGeo, whiteMat);
  white1.position.set(-0.1, 1.92, 0.27);
  group.add(white1);
  const white2 = white1.clone();
  white2.position.x = 0.1;
  group.add(white2);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.1, 0.5, 8, 8);
  const armMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const arm1 = new THREE.Mesh(armGeo, armMat);
  arm1.position.set(-0.5, 1.15, 0);
  arm1.rotation.z = 0.3;
  arm1.castShadow = true;
  group.add(arm1);
  const arm2 = arm1.clone();
  arm2.position.x = 0.5;
  arm2.rotation.z = -0.3;
  group.add(arm2);

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.12, 0.4, 8, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.3), roughness: 0.6 });
  const leg1 = new THREE.Mesh(legGeo, legMat);
  leg1.position.set(-0.18, 0.35, 0);
  leg1.castShadow = true;
  group.add(leg1);
  const leg2 = leg1.clone();
  leg2.position.x = 0.18;
  group.add(leg2);

  // Feet
  const footGeo = new THREE.BoxGeometry(0.18, 0.1, 0.25);
  const footMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.5), roughness: 0.7 });
  const foot1 = new THREE.Mesh(footGeo, footMat);
  foot1.position.set(-0.18, 0.05, 0.05);
  group.add(foot1);
  const foot2 = foot1.clone();
  foot2.position.x = 0.18;
  group.add(foot2);

  return group;
}

function darken(hex, amount) {
  const c = new THREE.Color(hex);
  c.r = Math.max(0, c.r - amount);
  c.g = Math.max(0, c.g - amount);
  c.b = Math.max(0, c.b - amount);
  return '#' + c.getHexString();
}

// --- PAINT SYSTEM ---
function initPaintCanvas() {
  paintCanvas = document.createElement('canvas');
  paintCanvas.width = 256;
  paintCanvas.height = 256;
  paintCtx = paintCanvas.getContext('2d');
  paintCtx.fillStyle = '#D4AF37';
  paintCtx.fillRect(0, 0, 256, 256);
  paintTexture = new THREE.CanvasTexture(paintCanvas);
  paintTexture.minFilter = THREE.LinearFilter;
}

function initControls(canvas) {
  canvas.addEventListener('click', () => {
    if (roomState?.phase === 'seek' && isSeeker) tryTagPlayer();
    if (!isPointerLocked && roomState?.phase !== 'paint') canvas.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', (e) => {
    if (isPointerLocked) {
      yaw -= e.movementX * 0.003;
      pitch -= e.movementY * 0.003;
      pitch = Math.max(-1.2, Math.min(1.2, pitch));
    }
    if (roomState?.phase === 'paint' && mouseDown && !isSeeker) paintOnCanvas(e);
  });

  document.addEventListener('mousedown', (e) => {
    mouseDown = true;
    if (roomState?.phase === 'paint' && !isSeeker) paintOnCanvas(e);
  });
  document.addEventListener('mouseup', () => { mouseDown = false; });
  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' && roomState?.phase === 'seek' && isSeeker) tryTagPlayer();
    if (e.code === 'Escape') document.exitPointerLock?.();
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });
}

function paintOnCanvas(e) {
  const rect = document.getElementById('game-canvas').getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * paintCanvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * paintCanvas.height;
  paintCtx.fillStyle = currentColor;
  paintCtx.beginPath();
  paintCtx.arc(x, y, brushSize, 0, Math.PI * 2);
  paintCtx.fill();
  paintTexture.needsUpdate = true;
  socket.emit('paint:stroke', { x, y, color: currentColor, size: brushSize });
}

function tryTagPlayer() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [];
  playerMeshes.forEach((mesh) => targets.push(...mesh.children));
  const hits = raycaster.intersectObjects(targets, true);
  if (hits.length > 0 && hits[0].distance < 6) {
    for (const [id, mesh] of playerMeshes) {
      if (mesh.children.some(c => c === hits[0].object || c.children?.includes(hits[0].object))) {
        socket.emit('seek:catch', id);
        break;
      }
    }
  }
}

// --- NETWORK ---
socket.on('paint:stroke', (data) => {
  const mesh = playerMeshes.get(data.playerId);
  if (mesh?.userData.paintCtx) {
    const ctx = mesh.userData.paintCtx;
    ctx.fillStyle = data.color;
    ctx.beginPath();
    ctx.arc(data.x, data.y, data.size, 0, Math.PI * 2);
    ctx.fill();
    mesh.userData.paintTexture.needsUpdate = true;
  }
});

socket.on('player:moved', (data) => {
  let mesh = playerMeshes.get(data.id);
  if (!mesh) {
    mesh = createNetworkPlayer(data.id);
    playerMeshes.set(data.id, mesh);
    scene.add(mesh);
  }
  mesh.userData.targetPos = new THREE.Vector3(data.x, data.y || 0, data.z);
  mesh.userData.targetRy = data.ry || 0;
});

socket.on('seek:caught', (data) => {
  if (data.targetId === myId) {
    isCaught = true;
    const overlay = document.getElementById('caught-overlay');
    overlay.classList.add('show');
    setTimeout(() => overlay.classList.remove('show'), 3000);
  }
  const mesh = playerMeshes.get(data.targetId);
  if (mesh) {
    mesh.children.forEach(c => {
      if (c.material) { c.material.transparent = true; c.material.opacity = 0.4; }
    });
  }
});

function createNetworkPlayer(id) {
  const players = roomState?.players || [];
  const idx = players.findIndex(p => p.id === id);
  const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];

  const group = createCharacterModel(color);

  const pCanvas = document.createElement('canvas');
  pCanvas.width = 256;
  pCanvas.height = 256;
  const pCtx = pCanvas.getContext('2d');
  pCtx.fillStyle = color;
  pCtx.fillRect(0, 0, 256, 256);
  const pTex = new THREE.CanvasTexture(pCanvas);
  group.userData.paintCtx = pCtx;
  group.userData.paintTexture = pTex;
  group.userData.targetPos = new THREE.Vector3();
  group.userData.targetRy = 0;

  // Name tag
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 256;
  nameCanvas.height = 64;
  const nCtx = nameCanvas.getContext('2d');
  nCtx.fillStyle = 'rgba(0,0,0,0.6)';
  nCtx.roundRect(0, 0, 256, 64, 8);
  nCtx.fill();
  nCtx.fillStyle = '#fff';
  nCtx.font = 'bold 32px sans-serif';
  nCtx.textAlign = 'center';
  const p = players.find(pl => pl.id === id);
  nCtx.fillText(p?.name || 'Player', 128, 42);
  const nameTex = new THREE.CanvasTexture(nameCanvas);
  const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, depthTest: false }));
  nameSprite.position.y = 2.4;
  nameSprite.scale.set(1.5, 0.4, 1);
  group.add(nameSprite);

  return group;
}

function updateGameUI(state) {
  document.getElementById('timer').textContent = state.timeLeft;
  const phaseNames = { paint: 'PAINT YOUR DISGUISE', hide: 'FIND A HIDING SPOT', seek: 'HUNT THEM DOWN' };
  document.getElementById('phase-label').textContent = phaseNames[state.phase] || '';

  const me = state.players.find(p => p.id === myId);
  document.getElementById('score-display').textContent = me ? `Score: ${me.score}` : '';
  document.getElementById('seeker-badge').style.display = isSeeker ? 'block' : 'none';

  const paintTools = document.getElementById('paint-tools');
  if (state.phase === 'paint' && !isSeeker) {
    paintTools.style.display = 'flex';
    if (paintTools.children.length === 0) {
      const pal = MAP_PALETTES[state.mapIndex % MAP_PALETTES.length];
      const allColors = [...new Set([...pal.colors, '#fff', '#000', '#888', '#c0c0c0', '#4a3520', '#8b6914', '#2b3d6b', '#6b2d2d'])];
      allColors.forEach(c => {
        const btn = document.createElement('div');
        btn.className = 'color-btn' + (c === currentColor ? ' active' : '');
        btn.style.background = c;
        btn.onclick = () => {
          currentColor = c;
          paintTools.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        };
        paintTools.appendChild(btn);
      });
      const sizeSlider = document.createElement('input');
      sizeSlider.type = 'range';
      sizeSlider.className = 'brush-size';
      sizeSlider.min = 3; sizeSlider.max = 50; sizeSlider.value = brushSize;
      sizeSlider.oninput = () => { brushSize = parseInt(sizeSlider.value); };
      paintTools.appendChild(sizeSlider);
    }
  } else {
    paintTools.style.display = 'none';
    paintTools.innerHTML = '';
  }

  if (state.phase === 'paint') {
    document.exitPointerLock?.();
    if (paintTexture && playerBody) {
      playerBody.children.forEach(c => {
        if (c.isMesh && c.name === 'playerBody') c.material.map = paintTexture;
      });
    }
  }

  // Sync player visibility
  state.players.forEach(p => {
    if (p.id === myId) return;
    if (!playerMeshes.has(p.id)) {
      const m = createNetworkPlayer(p.id);
      playerMeshes.set(p.id, m);
      scene.add(m);
    }
  });
  const ids = new Set(state.players.map(p => p.id));
  for (const [id, mesh] of playerMeshes) {
    if (!ids.has(id)) { scene.remove(mesh); playerMeshes.delete(id); }
  }
}

// --- GAME LOOP ---
const MOVE_SPEED = 8;
const clock = new THREE.Clock();
let sendTimer = 0;
let walkCycle = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (roomState && ['hide', 'seek'].includes(roomState.phase)) {
    if (!isCaught || isSeeker) {
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const vel = new THREE.Vector3();

      if (keys['KeyW'] || keys['ArrowUp']) vel.add(forward);
      if (keys['KeyS'] || keys['ArrowDown']) vel.sub(forward);
      if (keys['KeyA'] || keys['ArrowLeft']) vel.sub(right);
      if (keys['KeyD'] || keys['ArrowRight']) vel.add(right);

      const isMoving = vel.length() > 0;
      if (isMoving) {
        vel.normalize().multiplyScalar(MOVE_SPEED * (keys['ShiftLeft'] ? 1.5 : 1) * dt);
        playerBody.position.add(vel);
        playerBody.position.x = Math.max(-38, Math.min(38, playerBody.position.x));
        playerBody.position.z = Math.max(-38, Math.min(38, playerBody.position.z));
        walkCycle += dt * 10;
      }

      playerBody.rotation.y = yaw;

      // Bob animation
      const bobY = isMoving ? Math.sin(walkCycle) * 0.08 : 0;
      camera.position.set(
        playerBody.position.x,
        playerBody.position.y + 1.7 + bobY,
        playerBody.position.z
      );
      camera.position.x -= Math.sin(yaw) * 0.1;
      camera.position.z -= Math.cos(yaw) * 0.1;
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      sendTimer += dt;
      if (sendTimer > 0.05) {
        sendTimer = 0;
        const p = playerBody.position;
        socket.emit('player:position', { x: p.x, y: p.y, z: p.z, ry: yaw });
      }
    }
  } else if (roomState?.phase === 'paint') {
    // Top-down view for painting
    camera.position.set(0, 25, 0.01);
    camera.lookAt(0, 0, 0);
  }

  // Interpolate network players
  for (const [id, mesh] of playerMeshes) {
    if (mesh.userData.targetPos) {
      mesh.position.lerp(mesh.userData.targetPos, 0.15);
      const angleDiff = mesh.userData.targetRy - mesh.rotation.y;
      mesh.rotation.y += angleDiff * 0.15;
    }
  }

  if (renderer) renderer.render(scene, camera);
}
