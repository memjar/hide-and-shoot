import * as THREE from 'three';
import { io } from 'socket.io-client';

const socket = io(window.location.origin);
let myId = null;
let roomState = null;
let isSeeker = false;
let isCaught = false;

socket.on('connect', () => { myId = socket.id; });

// DOM refs
const screens = {
  menu: document.getElementById('screen-menu'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  results: document.getElementById('screen-results'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// Menu
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

// Room state
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
    const startBtn = document.getElementById('btn-start');
    startBtn.style.display = (state.host === myId && state.players.length >= 2) ? 'inline-block' : 'none';
  } else if (state.phase === 'results') {
    showScreen('results');
    const board = document.getElementById('results-board');
    board.innerHTML = '';
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    sorted.forEach(p => {
      const row = document.createElement('div');
      row.className = 'row' + (p.isSeeker ? ' seeker' : '');
      row.innerHTML = `<span>${p.name}${p.isSeeker ? ' [SEEKER]' : p.caught ? ' [CAUGHT]' : ' [SURVIVED]'}</span><span>${p.score}</span>`;
      board.appendChild(row);
    });
  } else if (['paint', 'hide', 'seek'].includes(state.phase)) {
    showScreen('game');
    if (!renderer) initGame();
    updateGameUI(state);
  }
});

socket.on('room:tick', (t) => {
  if (roomState) roomState.timeLeft = t;
  document.getElementById('timer').textContent = t;
});

// 3D Game Engine
let renderer, scene, camera, controls;
let mapMeshes = [];
let playerMeshes = new Map();
let paintCanvas, paintCtx, paintTexture;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let keys = {};
let mouseDown = false;
let mouseDelta = { x: 0, y: 0 };
let yaw = 0, pitch = 0;
let velocity = new THREE.Vector3();
let playerBody;
let isPointerLocked = false;

const MAP_COLORS = [
  ['#2d5a27', '#4a7c3f', '#1a3d15', '#6b8f62'],
  ['#8b6914', '#c49b2f', '#5c4710', '#d4af37'],
  ['#2b3d6b', '#4a6fa5', '#1a2a4d', '#6b8fc7'],
  ['#6b2d2d', '#a54a4a', '#4d1a1a', '#c76b6b'],
  ['#4d4d4d', '#7a7a7a', '#333333', '#a0a0a0'],
  ['#2d5a5a', '#4a7c7c', '#1a3d3d', '#6b8f8f'],
];

const PAINT_COLORS = [
  '#2d5a27', '#4a7c3f', '#1a3d15', '#6b8f62',
  '#8b6914', '#c49b2f', '#5c4710', '#d4af37',
  '#2b3d6b', '#4a6fa5', '#1a2a4d',
  '#6b2d2d', '#a54a4a', '#4d1a1a',
  '#4d4d4d', '#7a7a7a', '#333333',
  '#2d5a5a', '#e0d5c0', '#f5f0e0',
  '#ffffff', '#000000',
];

let currentColor = '#2d5a27';
let brushSize = 15;

function initGame() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#87CEEB');
  scene.fog = new THREE.Fog('#87CEEB', 50, 120);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 2, 5);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  scene.add(sun);

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
  const colors = MAP_COLORS[mapIndex % MAP_COLORS.length];

  const floorGeo = new THREE.PlaneGeometry(60, 60);
  const floorMat = new THREE.MeshLambertMaterial({ color: colors[0] });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);
  mapMeshes.push(floor);

  const wallGeo = new THREE.BoxGeometry(1, 3, 8);
  const structures = [
    { pos: [5, 1.5, -5], size: [6, 3, 1], color: colors[1] },
    { pos: [-8, 1.5, 3], size: [1, 3, 10], color: colors[2] },
    { pos: [10, 1.5, 8], size: [4, 3, 4], color: colors[3] },
    { pos: [-4, 1.5, -10], size: [8, 3, 1], color: colors[1] },
    { pos: [0, 1.5, 12], size: [12, 3, 1], color: colors[2] },
    { pos: [-12, 1.5, -3], size: [2, 3, 6], color: colors[3] },
    { pos: [14, 1.5, -8], size: [3, 3, 3], color: colors[0] },
    { pos: [-6, 1, -15], size: [4, 2, 4], color: colors[1] },
    { pos: [8, 2, 0], size: [1, 4, 6], color: colors[2] },
    { pos: [0, 1, 0], size: [3, 2, 3], color: colors[3] },
    { pos: [-15, 1.5, 10], size: [5, 3, 2], color: colors[1] },
    { pos: [12, 1, 15], size: [6, 2, 1], color: colors[2] },
  ];

  structures.forEach(s => {
    const geo = new THREE.BoxGeometry(...s.size);
    const mat = new THREE.MeshLambertMaterial({ color: s.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...s.pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'wall';
    scene.add(mesh);
    mapMeshes.push(mesh);
  });

  // boundary walls
  const bw = [
    { pos: [0, 2, -30], size: [60, 4, 1] },
    { pos: [0, 2, 30], size: [60, 4, 1] },
    { pos: [-30, 2, 0], size: [1, 4, 60] },
    { pos: [30, 2, 0], size: [1, 4, 60] },
  ];
  bw.forEach(w => {
    const geo = new THREE.BoxGeometry(...w.size);
    const mat = new THREE.MeshLambertMaterial({ color: '#222', transparent: true, opacity: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...w.pos);
    mesh.name = 'boundary';
    scene.add(mesh);
    mapMeshes.push(mesh);
  });

  playerBody = new THREE.Group();
  const bodyGeo = new THREE.CapsuleGeometry(0.4, 1, 8, 16);
  const bodyMat = new THREE.MeshLambertMaterial({ color: '#D4AF37' });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 1;
  bodyMesh.name = 'playerBody';
  playerBody.add(bodyMesh);
  scene.add(playerBody);
  playerBody.position.set(0, 0, 20);
}

function initPaintCanvas() {
  paintCanvas = document.createElement('canvas');
  paintCanvas.width = 128;
  paintCanvas.height = 128;
  paintCtx = paintCanvas.getContext('2d');
  paintCtx.fillStyle = '#D4AF37';
  paintCtx.fillRect(0, 0, 128, 128);
  paintTexture = new THREE.CanvasTexture(paintCanvas);
}

function initControls(canvas) {
  canvas.addEventListener('click', () => {
    if (roomState?.phase === 'seek' && isSeeker) {
      tryTagPlayer();
    }
    if (!isPointerLocked && roomState?.phase !== 'paint') {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', (e) => {
    if (isPointerLocked) {
      yaw -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));
    }
    if (roomState?.phase === 'paint' && mouseDown && !isSeeker) {
      paintOnCanvas(e);
    }
  });

  document.addEventListener('mousedown', (e) => {
    mouseDown = true;
    if (roomState?.phase === 'paint' && !isSeeker) {
      paintOnCanvas(e);
    }
  });
  document.addEventListener('mouseup', () => { mouseDown = false; });

  document.addEventListener('keydown', (e) => { keys[e.code] = true; });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });
}

function paintOnCanvas(e) {
  const rect = document.getElementById('game-canvas').getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * paintCanvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * paintCanvas.height;
  paintCtx.fillStyle = currentColor;
  paintCtx.beginPath();
  paintCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
  paintCtx.fill();
  paintTexture.needsUpdate = true;

  socket.emit('paint:stroke', { x, y, color: currentColor, size: brushSize });
}

function tryTagPlayer() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [];
  playerMeshes.forEach((mesh, id) => { targets.push(mesh); });
  const hits = raycaster.intersectObjects(targets, true);
  if (hits.length > 0) {
    const dist = hits[0].distance;
    if (dist < 5) {
      for (const [id, mesh] of playerMeshes) {
        if (hits[0].object === mesh || hits[0].object.parent === mesh) {
          socket.emit('seek:catch', id);
          break;
        }
      }
    }
  }
}

socket.on('paint:stroke', (data) => {
  const mesh = playerMeshes.get(data.playerId);
  if (mesh && mesh.userData.paintCtx) {
    const ctx = mesh.userData.paintCtx;
    ctx.fillStyle = data.color;
    ctx.beginPath();
    ctx.arc(data.x, data.y, data.size / 2, 0, Math.PI * 2);
    ctx.fill();
    mesh.userData.paintTexture.needsUpdate = true;
  }
});

socket.on('player:moved', (data) => {
  let mesh = playerMeshes.get(data.id);
  if (!mesh) {
    mesh = createPlayerMesh(data.id);
    playerMeshes.set(data.id, mesh);
    scene.add(mesh);
  }
  mesh.position.set(data.x, data.y || 0, data.z);
  mesh.rotation.y = data.ry || 0;
});

socket.on('seek:caught', (data) => {
  if (data.targetId === myId) {
    isCaught = true;
    const overlay = document.getElementById('caught-overlay');
    overlay.classList.add('show');
    setTimeout(() => overlay.classList.remove('show'), 2000);
  }
});

function createPlayerMesh(id) {
  const group = new THREE.Group();
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 128;
  pCanvas.height = 128;
  const pCtx = pCanvas.getContext('2d');
  pCtx.fillStyle = '#888';
  pCtx.fillRect(0, 0, 128, 128);
  const pTex = new THREE.CanvasTexture(pCanvas);

  const geo = new THREE.CapsuleGeometry(0.4, 1, 8, 16);
  const mat = new THREE.MeshLambertMaterial({ map: pTex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 1;
  group.add(mesh);
  group.userData.paintCtx = pCtx;
  group.userData.paintTexture = pTex;
  return group;
}

function updateGameUI(state) {
  document.getElementById('timer').textContent = state.timeLeft;
  const phaseNames = { paint: 'PAINT YOUR CAMO', hide: 'FIND A SPOT', seek: 'HUNT THEM DOWN' };
  document.getElementById('phase-label').textContent = phaseNames[state.phase] || state.phase;

  const me = state.players.find(p => p.id === myId);
  document.getElementById('score-display').textContent = me ? `Score: ${me.score}` : '';
  document.getElementById('seeker-badge').style.display = isSeeker ? 'block' : 'none';

  const paintTools = document.getElementById('paint-tools');
  if (state.phase === 'paint' && !isSeeker) {
    paintTools.style.display = 'flex';
    if (paintTools.children.length === 0) {
      const mapPalette = MAP_COLORS[state.mapIndex % MAP_COLORS.length];
      const allColors = [...new Set([...mapPalette, ...PAINT_COLORS])];
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
      sizeSlider.min = 3;
      sizeSlider.max = 40;
      sizeSlider.value = brushSize;
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
      const bodyMesh = playerBody.children[0];
      if (bodyMesh) bodyMesh.material.map = paintTexture;
    }
  }

  // update other player states
  state.players.forEach(p => {
    if (p.id === myId) return;
    if (!playerMeshes.has(p.id)) {
      const m = createPlayerMesh(p.id);
      playerMeshes.set(p.id, m);
      scene.add(m);
    }
    const m = playerMeshes.get(p.id);
    if (p.caught) {
      m.visible = true;
      m.children[0].material.opacity = 0.5;
      m.children[0].material.transparent = true;
    }
  });

  // remove disconnected players
  const currentIds = new Set(state.players.map(p => p.id));
  for (const [id, mesh] of playerMeshes) {
    if (!currentIds.has(id)) {
      scene.remove(mesh);
      playerMeshes.delete(id);
    }
  }
}

const MOVE_SPEED = 8;
const clock = new THREE.Clock();
let sendTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (roomState && ['hide', 'seek'].includes(roomState.phase) && !isCaught) {
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    velocity.set(0, 0, 0);
    if (keys['KeyW'] || keys['ArrowUp']) velocity.add(forward);
    if (keys['KeyS'] || keys['ArrowDown']) velocity.sub(forward);
    if (keys['KeyA'] || keys['ArrowLeft']) velocity.sub(right);
    if (keys['KeyD'] || keys['ArrowRight']) velocity.add(right);

    if (velocity.length() > 0) {
      velocity.normalize().multiplyScalar(MOVE_SPEED * dt);
      playerBody.position.add(velocity);
      playerBody.position.x = Math.max(-28, Math.min(28, playerBody.position.x));
      playerBody.position.z = Math.max(-28, Math.min(28, playerBody.position.z));
    }

    playerBody.rotation.y = yaw;
    camera.position.set(
      playerBody.position.x - Math.sin(yaw) * -0.5,
      playerBody.position.y + 1.8,
      playerBody.position.z - Math.cos(yaw) * -0.5
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    sendTimer += dt;
    if (sendTimer > 0.05) {
      sendTimer = 0;
      const p = playerBody.position;
      socket.emit('player:position', { x: p.x, y: p.y, z: p.z, ry: yaw });
    }
  } else if (roomState?.phase === 'paint') {
    camera.position.set(0, 30, 0.1);
    camera.lookAt(0, 0, 0);
  }

  if (renderer) renderer.render(scene, camera);
}
