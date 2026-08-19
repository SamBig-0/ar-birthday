/**
 * Interior 3D interactivo.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// =====================================================================
// CONFIG
// =====================================================================
const ROOM = { w: 7, h: 3.2, d: 5.5 };
const C = {
  pink: 0xff6b9d, purple: 0xa855f7, blue: 0x3b82f6,
  gold: 0xfbbf24, green: 0x22c55e, red: 0xef4444,
  orange: 0xf97316, cyan: 0x06b6d4, white: 0xffffff,
  cream: 0xfff8e7, wood: 0x9b7653, darkWood: 0x5c3a1e,
  floor: 0x3d3328, wall: 0x2c2540, ceiling: 0x1a1628,
};
const BALLOON_COLORS = [0xff4d6d, 0xc77dff, 0x48bfe3, 0xffd60a, 0xff6b6b, 0xff9e00, 0x72efdd];

// =====================================================================
// STATE
// =====================================================================
let scene, camera, renderer, composer, clock;
let cameraActive = false;
let entryWalk = false, entryDist = 0, surpriseTriggered = false, surpriseFlash = false;
let autoTurn = false, yawTarget = Math.PI;
let bobPhase = 0, stepAccum = 0;
let keys = new Set();
let touchF = 0, mv = { f: 0, s: 0 };
let candleBlowing = false, candleBlown = false;
let candleGlows = [];
let smoke = [];
let raycaster = new THREE.Raycaster();
let ritualTimers = [];
let pointerId = null, lastPX = 0, lastPY = 0, dragDist = 0, downT = 0;
const CAM_Y = 1.7;
let balloons = [], streamers = [], confetti = [], partyLights = [];
let cakeGroup, cakeVisible = true;
let partyLightsOn = false; // starts OFF (dark room)
let musicPlaying = false, audioCtx, entered = false;

// Door
let doorLeft, doorRight;
let doorOpen = false;
let doorAngle = 0;
let doorTargetAngle = 0;

// Entry sequence
let entryPhase = 'waiting'; // waiting → opening → lights → bomb → done
let entryTime = 0;
let lightsFadingIn = false;
let lightsProgress = 0;
let bombExploded = false;
let bombGroup;
let ytPlayer = null;

// Lights references for fade-in
let keyLight, fillLight, rimLight, cakeGlow, bounceLight, hemiLight;

const canvas = document.getElementById('scene');
const loading = document.getElementById('loading');
const progressFill = document.getElementById('progressFill');
const loadingText = document.getElementById('loadingText');
const ui = document.getElementById('ui');
const entryOverlay = document.getElementById('entryOverlay');

// =====================================================================
// PROCEDURAL TEXTURES
// =====================================================================
function makeWoodTexture(w = 512, h = 512) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9b7653';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    const y = Math.random() * h;
    ctx.strokeStyle = `rgba(60,30,10,${0.05 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.5 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < w; x += 10) ctx.lineTo(x, y + Math.sin(x * 0.02) * 3 + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const kx = Math.random() * w, ky = Math.random() * h, kr = 8 + Math.random() * 15;
    const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
    g.addColorStop(0, 'rgba(50,25,5,0.3)'); g.addColorStop(1, 'rgba(50,25,5,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeFloorTexture(w = 512, h = 512) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5c3a1e'; ctx.fillRect(0, 0, w, h);
  const tileW = 40, tileH = 120;
  for (let row = 0; row < h / tileH + 1; row++) {
    for (let col = 0; col < w / tileW + 1; col++) {
      const x = col * tileW + (row % 2 ? tileW / 2 : 0);
      const y = row * tileH;
      const shade = 0.7 + Math.random() * 0.3;
      ctx.fillStyle = `rgb(${Math.floor(155 * shade)},${Math.floor(118 * shade)},${Math.floor(83 * shade)})`;
      ctx.fillRect(x, y, tileW - 1, tileH - 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeWallTexture(w = 512, h = 512) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2c2540'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x + 16, y); ctx.lineTo(x + 32, y + 16);
    ctx.lineTo(x + 16, y + 32); ctx.lineTo(x, y + 16);
    ctx.closePath(); ctx.stroke();
  }
  const imgData = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    imgData.data[i] += n; imgData.data[i + 1] += n; imgData.data[i + 2] += n;
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// =====================================================================
// INIT
// =====================================================================
async function init() {
  setProgress(5, 'Inicializando motor 3D');
  clock = new THREE.Clock();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020205); // Almost black
  scene.fog = new THREE.FogExp2(0x020205, 0.08);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, CAM_Y, 3.6); // fuera, frente a la puerta cerrada
  camera.rotation.y = Math.PI;         // mirando la puerta

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.15; // START DARK
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  cameraActive = false; // Activa tras la entrada

  setProgress(15, 'Generando texturas');
  const woodTex = makeWoodTexture();
  const floorTex = makeFloorTexture();
  const wallTex = makeWallTexture();

  setProgress(20, 'Creando iluminación');
  createLighting();

  setProgress(30, 'Construyendo el cuarto');
  createRoom(woodTex, floorTex, wallTex);

  setProgress(40, 'Construyendo la puerta ceremonial');
  createDoor();

  setProgress(50, 'Colocando globos');
  createBalloons();

  setProgress(60, 'Colocando guirnaldas');
  createStreamers();

  setProgress(70, 'Preparando el pastel');
  createCake();

  setProgress(78, 'Colgando luces de fiesta');
  createPartyLights();

  setProgress(84, 'Colocando banner');
  createBanner();

  setProgress(88, 'Colocando regalos');
  createGifts();

  setProgress(92, 'Preparando bomba de confeti');
  createConfettiBomb();

  setProgress(96, 'Configurando post-processing');
  setupPostProcessing();

  setProgress(100, '¡Fiesta lista!');

  setTimeout(() => {
    loading.classList.add('hidden');
    showEntryOverlay();
  }, 400);

  setupControls();
  window.addEventListener('resize', onResize);
  initYouTubeMusic();
  animate();
}

function setProgress(pct, text) {
  progressFill.style.width = pct + '%';
  if (loadingText) loadingText.textContent = text;
}

// =====================================================================
// ENTRY OVERLAY
// =====================================================================
function showEntryOverlay() {
  entryOverlay.classList.remove('hidden');
  const btnPulsar = document.getElementById('btnPulsar');
  btnPulsar.addEventListener('click', startEntrySequence, { once: true });
}

async function startEntrySequence() {
  if (entryPhase !== 'waiting') return;
  entryPhase = 'opening';
  entryTime = 0;
  entered = true;

  // Hide overlay with dramatic fade
  entryOverlay.style.transition = 'opacity 1s ease';
  entryOverlay.style.opacity = '0';
  setTimeout(() => entryOverlay.classList.add('hidden'), 1000);

  // Música apenas se abre la puerta
  playYouTubeMusic();

  // La puerta se abre empujándola; luego la persona entra caminando
  doorTargetAngle = -Math.PI * 0.5;
  surpriseTriggered = false;
  entryWalk = false;
  entryDist = 0;
  setTimeout(() => { entryWalk = true; }, 500);

  // Done
  setTimeout(() => {
    entryPhase = 'done';
  }, 4000);
}

function initYouTubeMusic() {
  try {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      try {
        ytPlayer = new YT.Player('ytPlayer', {
          events: {
            onReady: () => {
              if (entered) {
                ytPlayer.setVolume(70);
                ytPlayer.playVideo();
                musicPlaying = true;
              }
            },
            onError: () => { playFallbackMusic(); },
            onStateChange: () => {},
          },
        });
      } catch (e) { playFallbackMusic(); }
    };
  } catch (e) { playFallbackMusic(); }
}

function playYouTubeMusic() {
  try {
    if (ytPlayer && ytPlayer.playVideo) {
      ytPlayer.setVolume(70);
      ytPlayer.playVideo();
      musicPlaying = true;
      return;
    }
  } catch (e) { /* fallthrough */ }
  playFallbackMusic();
}

function playFallbackMusic() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  musicPlaying = true;

  const melody = [
    262, 262, 294, 262, 349, 330,
    262, 262, 294, 262, 392, 349,
    262, 262, 523, 440, 349, 330, 294,
    466, 466, 440, 349, 392, 349,
  ];
  const durs = [0.35, 0.1, 0.45, 0.45, 0.45, 0.9, 0.35, 0.1, 0.45, 0.45, 0.45, 0.9, 0.35, 0.1, 0.45, 0.45, 0.45, 0.45, 0.9, 0.35, 0.1, 0.45, 0.45, 0.45, 0.9];

  let time = audioCtx.currentTime + 0.1;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.12;
  gain.connect(audioCtx.destination);

  melody.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + durs[i] * 0.85);
    time += durs[i];
  });
}

// =====================================================================
// LIGHTING — Starts at zero, fades in during entry
// =====================================================================
function createLighting() {
  hemiLight = new THREE.HemisphereLight(0x8888bb, 0x444422, 0);
  scene.add(hemiLight);

  keyLight = new THREE.DirectionalLight(0xfff0dd, 0);
  keyLight.position.set(3, 4, 2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 15;
  keyLight.shadow.camera.left = -5;
  keyLight.shadow.camera.right = 5;
  keyLight.shadow.camera.top = 5;
  keyLight.shadow.camera.bottom = -2;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.radius = 3;
  scene.add(keyLight);

  fillLight = new THREE.DirectionalLight(0x8899cc, 0);
  fillLight.position.set(-3, 2.5, -1);
  scene.add(fillLight);

  rimLight = new THREE.PointLight(0xff6b9d, 0, 8, 1.5);
  rimLight.position.set(-2.5, 2.5, 0);
  scene.add(rimLight);

  cakeGlow = new THREE.PointLight(0xffaa44, 0, 4, 1.5);
  cakeGlow.position.set(0, 1.5, -1.5);
  scene.add(cakeGlow);

  bounceLight = new THREE.PointLight(0xddc8a0, 0, 6, 2);
  bounceLight.position.set(0, 0.3, 0);
  scene.add(bounceLight);

  // Door crack light — visible in the dark
  const crackLight = new THREE.SpotLight(0xffeedd, 2, 6, Math.PI / 6, 0.5, 1);
  crackLight.position.set(0, 1.6, ROOM.d / 2 + 0.3);
  crackLight.target.position.set(0, 0, 0);
  scene.add(crackLight);
  scene.add(crackLight.target);
}

function updateLighting(dt) {
  if (!lightsFadingIn) return;

  lightsProgress = Math.min(1, lightsProgress + dt * (surpriseFlash ? 3.2 : 0.5));

  // Stagger the lights
  const p = lightsProgress;
  const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad

  hemiLight.intensity = ease * 0.4;
  keyLight.intensity = ease * 1.2;
  fillLight.intensity = Math.max(0, (p - 0.1) * 1.25) * 0.4;
  rimLight.intensity = Math.max(0, (p - 0.2) * 1.25) * 0.6;
  cakeGlow.intensity = Math.max(0, (p - 0.3) * 1.43) * 0.3;
  bounceLight.intensity = Math.max(0, (p - 0.15) * 1.18) * 0.2;

  // Tone mapping exposure goes from dark to normal
  renderer.toneMappingExposure = 0.15 + ease * 0.85;

  // Fog fades
  scene.fog.density = 0.08 * (1 - ease) + 0.04 * ease;

  // Turn on party lights when brightness is up
  if (p > 0.6 && !partyLightsOn) {
    partyLightsOn = true;
    partyLights.forEach(l => {
      l.light.visible = true;
      l.glow.visible = true;
    });
  }
}

// =====================================================================
// ROOM
// =====================================================================
function createRoom(woodTex, floorTex, wallTex) {
  const { w, h, d } = ROOM;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.65, metalness: 0.05 })
  );
  floor.position.set(0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Porche oscuro frente a la puerta (para la entrada caminando)
  const porch = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x241d16, roughness: 0.9, metalness: 0 })
  );
  porch.rotation.x = -Math.PI / 2;
  porch.position.set(0, -0.02, 3.55);
  scene.add(porch);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0 });

  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat.clone());
  back.material.map = wallTex.clone(); back.material.map.repeat.set(2, 1);
  back.position.set(0, h / 2, -d / 2); back.receiveShadow = true;
  scene.add(back);

  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat.clone());
  left.material.map = wallTex.clone(); left.material.map.repeat.set(2, 1);
  left.rotation.y = Math.PI / 2; left.position.set(-w / 2, h / 2, 0); left.receiveShadow = true;
  scene.add(left);

  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat.clone());
  right.material.map = wallTex.clone(); right.material.map.repeat.set(2, 1);
  right.rotation.y = -Math.PI / 2; right.position.set(w / 2, h / 2, 0); right.receiveShadow = true;
  scene.add(right);

  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: 0x1a1628, roughness: 0.95 })
  );
  ceil.rotation.x = Math.PI / 2; ceil.position.y = h; ceil.receiveShadow = true;
  scene.add(ceil);

  // Baseboards
  const bbMat = new THREE.MeshStandardMaterial({ map: woodTex.clone(), color: 0x3a2510, roughness: 0.5 });
  [{ s: [w + 0.04, 0.12, 0.025], p: [0, 0.06, -d / 2 + 0.012] },
   { s: [0.025, 0.12, d + 0.04], p: [-w / 2 + 0.012, 0.06, 0] },
   { s: [0.025, 0.12, d + 0.04], p: [w / 2 - 0.012, 0.06, 0] }
  ].forEach(({ s, p }) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...s), bbMat);
    m.position.set(...p); m.castShadow = true; scene.add(m);
  });
}

// =====================================================================
// DOOR — Double ceremonial doors
// =====================================================================
function createDoor() {
  const doorGroup = new THREE.Group();
  const { h, d } = ROOM;

  // === MATERIALS ===
  const darkWoodTex = makeWoodTexture(512, 512);
  const doorMat = new THREE.MeshPhysicalMaterial({
    color: 0x5a2e14, roughness: 0.4, metalness: 0.05,
    clearcoat: 0.5, clearcoatRoughness: 0.25, map: darkWoodTex,
  });
  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0x3a1a08, roughness: 0.35, metalness: 0.08,
    clearcoat: 0.4, clearcoatRoughness: 0.3, map: darkWoodTex,
  });
  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xd4a855, roughness: 0.15, metalness: 0.85,
    clearcoat: 0.7, clearcoatRoughness: 0.1,
  });
  const panelMat = new THREE.MeshPhysicalMaterial({
    color: 0x4a2510, roughness: 0.5, metalness: 0.05,
    clearcoat: 0.3, clearcoatRoughness: 0.4,
  });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffeedd, transparent: true, opacity: 0.08 });

  const doorH = h * 0.82;
  const doorW = 0.58;
  const doorThick = 0.06;
  const doorY = doorH / 2 + 0.06;
  const fz = d / 2; // frame z position

  // === FRAME — multi-step with molding ===
  // Outer frame (thick)
  const fL = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH + 0.15, 0.14), frameMat);
  fL.position.set(-doorW - 0.05, doorY, fz); fL.castShadow = true; doorGroup.add(fL);
  const fR = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH + 0.15, 0.14), frameMat);
  fR.position.set(doorW + 0.05, doorY, fz); fR.castShadow = true; doorGroup.add(fR);
  const fT = new THREE.Mesh(new THREE.BoxGeometry(doorW * 2 + 0.2, 0.1, 0.14), frameMat);
  fT.position.set(0, doorH + 0.1, fz); fT.castShadow = true; doorGroup.add(fT);

  // Inner frame lip (thinner, protruding)
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.4, metalness: 0.1 });
  const lipL = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorH + 0.02, 0.03), lipMat);
  lipL.position.set(-doorW - 0.005, doorY, fz + 0.07); doorGroup.add(lipL);
  const lipR = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorH + 0.02, 0.03), lipMat);
  lipR.position.set(doorW + 0.005, doorY, fz + 0.07); doorGroup.add(lipR);
  const lipT = new THREE.Mesh(new THREE.BoxGeometry(doorW * 2 + 0.05, 0.04, 0.03), lipMat);
  lipT.position.set(0, doorH + 0.02, fz + 0.07); doorGroup.add(lipT);

  // Arch ornament on top
  const archGeo = new THREE.TorusGeometry(doorW * 0.8, 0.025, 12, 32, Math.PI);
  const arch = new THREE.Mesh(archGeo, brassMat);
  arch.position.set(0, doorH + 0.06, fz + 0.08); arch.rotation.z = Math.PI;
  doorGroup.add(arch);

  // Door number "25" above
  const numGeo = new THREE.BoxGeometry(0.12, 0.06, 0.008);
  const numMat = new THREE.MeshPhysicalMaterial({ color: 0xd4a855, roughness: 0.2, metalness: 0.8 });
  const numPlate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.005),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.5 }));
  numPlate.position.set(0, doorH + 0.06, fz + 0.085);
  doorGroup.add(numPlate);

  // === DOOR PANELS (6-panel style) ===
  function createDoorPanel(side) {
    const pivot = new THREE.Group();
    const sx = side === 'left' ? 1 : -1;
    pivot.position.set(sx * doorW, doorY, fz);

    // Main slab
    const slab = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, doorThick), doorMat.clone());
    slab.position.x = sx * (-doorW / 2);
    slab.castShadow = true; slab.receiveShadow = true;
    pivot.add(slab);

    // 6 raised panels (3 rows x 2 columns)
    const panelW = doorW * 0.38;
    const panelH = doorH * 0.22;
    const panelPositions = [
      { y: doorH * 0.18 }, { y: doorH * 0.45 }, { y: doorH * 0.72 },
    ];

    panelPositions.forEach(pp => {
      [-1, 1].forEach(col => {
        // Panel recess
        const recess = new THREE.Mesh(
          new THREE.BoxGeometry(panelW, panelH, 0.005),
          panelMat
        );
        recess.position.set(sx * (-doorW / 2) + col * panelW * 0.55, pp.y, doorThick / 2 + 0.003);
        pivot.add(recess);

        // Panel border (raised frame)
        const borderShape = new THREE.Shape();
        const bw = panelW / 2, bh = panelH / 2;
        borderShape.moveTo(-bw, -bh); borderShape.lineTo(bw, -bh);
        borderShape.lineTo(bw, bh); borderShape.lineTo(-bw, bh); borderShape.closePath();

        const innerShape = new THREE.Shape();
        const iw = bw * 0.85, ih = bh * 0.85;
        innerShape.moveTo(-iw, -ih); innerShape.lineTo(iw, -ih);
        innerShape.lineTo(iw, ih); innerShape.lineTo(-iw, ih); innerShape.closePath();
        borderShape.holes.push(innerShape);

        const borderGeo = new THREE.ExtrudeGeometry(borderShape, { depth: 0.008, bevelEnabled: false });
        const border = new THREE.Mesh(borderGeo, new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.45 }));
        border.position.set(sx * (-doorW / 2) + col * panelW * 0.55, pp.y, doorThick / 2);
        pivot.add(border);
      });
    });

    // Center vertical stile
    const stile = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, doorH - 0.04, doorThick + 0.002),
      doorMat.clone()
    );
    stile.position.set(sx * (-doorW / 2), doorH / 2, 0);
    pivot.add(stile);

    // Horizontal rails
    [0.32, 0.59].forEach(ry => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(doorW - 0.02, 0.025, doorThick + 0.002),
        doorMat.clone()
      );
      rail.position.set(sx * (-doorW / 2), doorH * ry, 0);
      pivot.add(rail);
    });

    // === HANDLE — ornate lever with backplate ===
    // Backplate
    const bpGeo = new THREE.BoxGeometry(0.04, 0.12, 0.005);
    const bp = new THREE.Mesh(bpGeo, brassMat);
    bp.position.set(sx * (-doorW + 0.1), 0, doorThick / 2 + 0.008);
    pivot.add(bp);

    // Lever arm
    const leverGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.1, 12);
    const lever = new THREE.Mesh(leverGeo, brassMat);
    lever.rotation.z = Math.PI / 2;
    lever.position.set(sx * (-doorW + 0.1), 0, doorThick / 2 + 0.02);
    pivot.add(lever);

    // Lever end ball
    const endBall = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 8), brassMat);
    endBall.position.set(sx * (-doorW + 0.1 + 0.05 * sx), 0, doorThick / 2 + 0.02);
    pivot.add(endBall);

    // Lever base collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 16), brassMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(sx * (-doorW + 0.1), 0, doorThick / 2 + 0.012);
    pivot.add(collar);

    // === DOORKNOB (on the other door) ===
    if (side === 'right') {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), brassMat);
      knob.position.set(sx * (-doorW + 0.1), 0, doorThick / 2 + 0.035);
      pivot.add(knob);
      const knobPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 16), brassMat);
      knobPlate.rotation.x = Math.PI / 2;
      knobPlate.position.set(sx * (-doorW + 0.1), 0, doorThick / 2 + 0.01);
      pivot.add(knobPlate);
    }

    // === HINGES (3 per door) ===
    [-0.35, 0, 0.35].forEach(hy => {
      const hingePlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.06, 0.004),
        brassMat
      );
      hingePlate.position.set(sx * (-doorW * 2 + 0.02), doorH * hy, doorThick / 2 + 0.003);
      pivot.add(hingePlate);
      const hingePin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.06, 8),
        brassMat
      );
      hingePin.position.set(sx * (-doorW * 2 + 0.02), doorH * hy, doorThick / 2 + 0.005);
      pivot.add(hingePin);
    });

    // === KICK PLATE ===
    const kickPlate = new THREE.Mesh(
      new THREE.BoxGeometry(doorW * 0.6, 0.08, 0.003),
      new THREE.MeshPhysicalMaterial({ color: 0xc9a84c, roughness: 0.2, metalness: 0.7 })
    );
    kickPlate.position.set(sx * (-doorW / 2), 0.06, doorThick / 2 + 0.004);
    pivot.add(kickPlate);

    return pivot;
  }

  // Create both doors
  doorLeft = createDoorPanel('left');
  doorGroup.add(doorLeft);
  doorRight = createDoorPanel('right');
  doorGroup.add(doorRight);

  // === LIGHT SEEPING THROUGH CRACK ===
  const crackLight = new THREE.Mesh(
    new THREE.PlaneGeometry(0.015, doorH * 0.9),
    lightMat
  );
  crackLight.position.set(0, doorY, fz + 0.01);
  doorGroup.add(crackLight);

  // Top crack light
  const topCrack = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW * 1.8, 0.01),
    lightMat
  );
  topCrack.position.set(0, doorH + 0.01, fz + 0.01);
  doorGroup.add(topCrack);

  // === WELCOME MAT ===
  const matGeo = new THREE.PlaneGeometry(doorW * 2 + 0.3, 0.4);
  const matMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.95 });
  const welcomeMat = new THREE.Mesh(matGeo, matMat);
  welcomeMat.rotation.x = -Math.PI / 2;
  welcomeMat.position.set(0, 0.005, fz + 0.25);
  doorGroup.add(welcomeMat);

  // === PORCH LIGHTS (sconces on each side) ===
  [-1, 1].forEach(side => {
    const sconceGroup = new THREE.Group();
    // Bracket
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.08, 0.06), brassMat
    );
    bracket.position.set(side * (doorW + 0.15), doorH * 0.65, fz + 0.05);
    sconceGroup.add(bracket);
    // Lamp
    const lampGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.1, 12);
    const lampMat = new THREE.MeshPhysicalMaterial({
      color: 0xfff8e7, roughness: 0.1, metalness: 0, transmission: 0.4, thickness: 0.2,
      emissive: new THREE.Color(0xffeedd), emissiveIntensity: 0.5,
    });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(side * (doorW + 0.15), doorH * 0.65 - 0.06, fz + 0.08);
    sconceGroup.add(lamp);
    // Glow
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffeedd, transparent: true, opacity: 0.15, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), glowMat);
    glow.position.copy(lamp.position);
    sconceGroup.add(glow);
    // Light
    const sLight = new THREE.PointLight(0xffeedd, 0, 3, 2);
    sLight.position.copy(lamp.position);
    sconceGroup.add(sLight);
    partyLights.push({ bulb: lamp, glow, light: sLight, phase: Math.random() * Math.PI * 2 });
    doorGroup.add(sconceGroup);
  });

  scene.add(doorGroup);
}

// =====================================================================
// BALLOONS
// =====================================================================
function createBalloons() {
  const positions = [
    { x: -2.2, y: 2.3, z: -1.8 }, { x: -1.3, y: 2.6, z: -2.3 },
    { x: 0.7, y: 2.4, z: -2.0 }, { x: 2.0, y: 2.7, z: -1.5 },
    { x: 2.5, y: 2.2, z: -2.5 }, { x: -0.5, y: 2.9, z: -1.0 },
    { x: 1.2, y: 2.1, z: -2.8 }, { x: -2.0, y: 2.5, z: -0.7 },
    { x: 0.1, y: 2.8, z: -3.0 }, { x: 2.2, y: 2.4, z: -0.5 },
    { x: -1.5, y: 2.0, z: -3.2 }, { x: 0.8, y: 2.5, z: -0.3 },
  ];

  positions.forEach((pos, i) => {
    const balloon = createBalloon(BALLOON_COLORS[i % BALLOON_COLORS.length]);
    balloon.position.set(pos.x, pos.y, pos.z);
    balloon.userData = {
      baseY: pos.y, baseX: pos.x, baseZ: pos.z,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.3,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 0.05 + Math.random() * 0.05,
    };
    scene.add(balloon);
    balloons.push(balloon);
  });
}

function createBalloon(color) {
  const group = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(0.24, 32, 24);
  const posAttr = bodyGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    let x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
    y *= 1.35;
    if (y < 0) { const f = 1 + y * 0.8; x *= f; z *= f; }
    const bulge = 1 + Math.max(0, 0.15 - Math.abs(y) * 0.1);
    x *= bulge; z *= bulge;
    posAttr.setXYZ(i, x, y, z);
  }
  bodyGeo.computeVertexNormals();

  const body = new THREE.Mesh(bodyGeo, new THREE.MeshPhysicalMaterial({
    color, roughness: 0.25, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.2,
    sheen: 0.3, sheenRoughness: 0.4, sheenColor: new THREE.Color(color).offsetHSL(0, 0, 0.2),
  }));
  body.castShadow = true; body.position.y = 0.45; group.add(body);

  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.04, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  knot.rotation.x = Math.PI; knot.position.y = 0.12; group.add(knot);

  const pts = [];
  for (let j = 0; j <= 30; j++) {
    const t = j / 30;
    pts.push(new THREE.Vector3(Math.sin(t * 4) * 0.015, 0.12 - t * 1.0, Math.cos(t * 3) * 0.01));
  }
  const strGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.003, 4, false);
  group.add(new THREE.Mesh(strGeo, new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8 })));

  return group;
}

// =====================================================================
// STREAMERS
// =====================================================================
function createStreamers() {
  const colors = [C.pink, C.gold, C.blue, C.purple, C.green, C.orange, C.cyan, C.red];
  for (let i = 0; i < 10; i++) {
    const color = colors[i % colors.length];
    const streamer = createStreamer(color);
    streamer.position.set((i - 4.5) * 0.65, ROOM.h - 0.05, -1.5 + Math.sin(i * 0.7) * 1.2);
    streamer.userData = { phase: Math.random() * Math.PI * 2, swayAmt: 0.015 + Math.random() * 0.025 };
    scene.add(streamer);
    streamers.push(streamer);
  }
}

function createStreamer(color) {
  const length = 1.2 + Math.random() * 0.8;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(new THREE.Vector3(Math.sin(t * Math.PI * 2.5) * 0.08 * (1 - t * 0.5), -t * length, Math.cos(t * Math.PI * 1.8) * 0.04));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const shape = new THREE.Shape();
  shape.moveTo(-0.035, 0); shape.lineTo(0.035, 0); shape.lineTo(0.035, -0.003); shape.lineTo(-0.035, -0.003);
  const geo = new THREE.ExtrudeGeometry(shape, { steps: 40, extrudePath: curve });
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color, roughness: 0.45, metalness: 0.15, clearcoat: 0.2, side: THREE.DoubleSide,
  }));
  mesh.castShadow = true;
  const g = new THREE.Group(); g.add(mesh); return g;
}

// =====================================================================
// CAKE
// =====================================================================
function createCake() {
  cakeGroup = new THREE.Group();
  const cakeMat1 = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.7 });
  const cakeMat2 = new THREE.MeshStandardMaterial({ color: 0xd2a06d, roughness: 0.65 });
  const frostMat = new THREE.MeshPhysicalMaterial({ color: 0xfff5ee, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const chocFrost = new THREE.MeshPhysicalMaterial({ color: 0x5c3317, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 });

  // Table
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.45, metalness: 0.05 });
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.025, 48), tableMat);
  tableTop.position.set(0, 0.85, 0); tableTop.castShadow = true; tableTop.receiveShadow = true;
  cakeGroup.add(tableTop);
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.85, 12), tableMat);
  tableLeg.position.set(0, 0.425, 0); tableLeg.castShadow = true;
  cakeGroup.add(tableLeg);

  // Plate
  const plateMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.4, clearcoat: 0.8 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.018, 48), plateMat);
  plate.position.set(0, 0.872, 0); plate.castShadow = true;
  cakeGroup.add(plate);

  // Layers
  const layer1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 48), cakeMat1);
  layer1.position.set(0, 0.96, 0); layer1.castShadow = true;
  cakeGroup.add(layer1);
  const frostRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.018, 12, 48), frostMat);
  frostRing1.position.set(0, 1.03, 0); frostRing1.rotation.x = Math.PI / 2;
  cakeGroup.add(frostRing1);
  const layer2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.11, 48), cakeMat2);
  layer2.position.set(0, 1.1, 0); layer2.castShadow = true;
  cakeGroup.add(layer2);
  const frostRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 12, 48), chocFrost);
  frostRing2.position.set(0, 1.155, 0); frostRing2.rotation.x = Math.PI / 2;
  cakeGroup.add(frostRing2);

  // Frosting drips
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dl = 0.02 + Math.random() * 0.06;
    const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.005, dl, 8), frostMat);
    drip.position.set(Math.cos(a) * 0.215, 1.02 - dl / 2, Math.sin(a) * 0.215);
    cakeGroup.add(drip);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const dl = 0.015 + Math.random() * 0.05;
    const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.003, dl, 8), chocFrost);
    drip.position.set(Math.cos(a) * 0.148, 1.155 - dl / 2, Math.sin(a) * 0.148);
    cakeGroup.add(drip);
  }

  // Cherry
  const cherryMat = new THREE.MeshPhysicalMaterial({ color: 0xcc0000, roughness: 0.2, clearcoat: 1.0, clearcoatRoughness: 0.05 });
  const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), cherryMat);
  cherry.position.set(0, 1.2, 0); cherry.castShadow = true;
  cakeGroup.add(cherry);

  // Candles
  [{ x: 0.07, z: 0.05, c: 0xff6b9d }, { x: -0.06, z: 0.06, c: 0x48bfe3 },
   { x: 0.0, z: -0.06, c: 0xffd60a }, { x: -0.07, z: -0.03, c: 0xa855f7 },
   { x: 0.05, z: -0.05, c: 0xff6b6b }
  ].forEach(cp => createCandle(cp.x, 1.2, cp.z, cp.c));

  // Sprinkles
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.12;
    const sp = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.015, 4, 6),
      new THREE.MeshBasicMaterial({ color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)] }));
    sp.position.set(Math.cos(a) * r, 1.158, Math.sin(a) * r);
    sp.rotation.set(Math.random(), Math.random(), Math.random());
    cakeGroup.add(sp);
  }

  cakeGroup.position.set(0, 0, -1.8);
  scene.add(cakeGroup);
}

function createCandle(x, y, z, color) {
  const cBody = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
  cBody.position.set(x, y + 0.05, z); cBody.castShadow = true;
  cakeGroup.add(cBody);

  const outerFlame = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 8),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.6 }));
  outerFlame.position.set(x, y + 0.13, z); outerFlame.userData.isFlame = true;
  cakeGroup.add(outerFlame);

  const innerFlame = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.025, 8),
    new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.9 }));
  innerFlame.position.set(x, y + 0.128, z); innerFlame.userData.isFlame = true;
  cakeGroup.add(innerFlame);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  core.position.set(x, y + 0.118, z); core.userData.isFlame = true;
  cakeGroup.add(core);

  const cGlow = new THREE.PointLight(0xffaa44, 0.15, 1.5, 2);
  cGlow.position.set(x, y + 0.14, z);
  cakeGroup.add(cGlow);
  candleGlows.push(cGlow);
}

// =====================================================================
// PARTY LIGHTS
// =====================================================================
function createPartyLights() {
  const bulbColors = [C.pink, C.gold, C.blue, C.green, C.red, C.purple, C.cyan, C.orange];
  const n = 16;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3((t - 0.5) * ROOM.w * 0.85, ROOM.h - 0.1 - Math.sin(t * Math.PI) * 0.2, -1.2));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  scene.add(new THREE.Mesh(
    new THREE.TubeGeometry(curve, 40, 0.004, 4, false),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
  ));

  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const pos = curve.getPointAt(t);
    const color = bulbColors[i % bulbColors.length];

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshPhysicalMaterial({
      color, roughness: 0.15, transmission: 0.3, thickness: 0.3, clearcoat: 0.5,
      emissive: new THREE.Color(color), emissiveIntensity: 0,
    }));
    bulb.position.copy(pos); bulb.position.y -= 0.04;
    scene.add(bulb);

    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    glow.position.copy(bulb.position); glow.visible = false;
    scene.add(glow);

    const light = new THREE.PointLight(color, 0, 2.5, 2);
    light.position.copy(bulb.position); light.visible = false;
    scene.add(light);

    partyLights.push({ bulb, glow, light, phase: Math.random() * Math.PI * 2 });
  }
}

// =====================================================================
// BANNER
// =====================================================================
function createBanner() {
  const colors = [C.pink, C.gold, C.blue, C.green, C.purple, C.red, C.cyan, C.orange];
  const n = 16;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3((t - 0.5) * n * 0.32, ROOM.h - 0.18 - Math.sin(t * Math.PI) * 0.12, -ROOM.d / 2 + 0.06));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.003, 4, false),
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 })));

  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const pos = curve.getPointAt(t);
    const shape = new THREE.Shape();
    shape.moveTo(-0.1, 0); shape.lineTo(0.1, 0); shape.lineTo(0, -0.16); shape.closePath();
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshPhysicalMaterial({
      color: colors[i % colors.length], roughness: 0.5, side: THREE.DoubleSide, clearcoat: 0.1,
    }));
    flag.position.copy(pos); flag.position.y -= 0.01;
    scene.add(flag);
  }

  // "FELIZ CUMPLEAÑOS YOSELYN" text on back wall using canvas texture
  const textCanvas = document.createElement('canvas');
  textCanvas.width = 1024; textCanvas.height = 256;
  const ctx = textCanvas.getContext('2d');
  ctx.clearRect(0, 0, 1024, 256);
  // Gradient text
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#ff6b9d');
  grad.addColorStop(0.5, '#fbbf24');
  grad.addColorStop(1, '#a855f7');
  ctx.fillStyle = grad;
  ctx.font = 'bold 72px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FELIZ CUMPLEAÑOS', 512, 80);
  ctx.font = 'bold 96px Arial, sans-serif';
  ctx.fillText('YOSELYN', 512, 180);
  // Shadow
  ctx.shadowColor = 'rgba(168, 85, 247, 0.5)';
  ctx.shadowBlur = 20;
  ctx.fillText('YOSELYN', 512, 180);

  const textTex = new THREE.CanvasTexture(textCanvas);
  const textGeo = new THREE.PlaneGeometry(3.5, 0.9);
  const textMat = new THREE.MeshBasicMaterial({ map: textTex, transparent: true, side: THREE.DoubleSide });
  const textMesh = new THREE.Mesh(textGeo, textMat);
  textMesh.position.set(0, ROOM.h * 0.65, -ROOM.d / 2 + 0.07);
  scene.add(textMesh);
}

// =====================================================================
// GIFTS
// =====================================================================
function createGifts() {
  [{ x: -2.0, z: -0.5, w: 0.3, h: 0.25, d: 0.3, color: 0xff6b9d, ribbon: 0xffd60a },
   { x: -2.3, z: -1.0, w: 0.22, h: 0.35, d: 0.22, color: 0x48bfe3, ribbon: 0xffffff },
   { x: 2.0, z: -0.8, w: 0.28, h: 0.28, d: 0.28, color: 0xa855f7, ribbon: 0xffd60a },
   { x: 2.3, z: -1.5, w: 0.2, h: 0.2, d: 0.2, color: 0x22c55e, ribbon: 0xff6b6b },
   { x: -1.5, z: -3.0, w: 0.35, h: 0.2, d: 0.25, color: 0xffd60a, ribbon: 0xff6b9d },
  ].forEach(g => {
    const grp = new THREE.Group();
    const boxMat = new THREE.MeshPhysicalMaterial({ color: g.color, roughness: 0.4, clearcoat: 0.3 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(g.w, g.h, g.d), boxMat);
    box.position.y = g.h / 2; box.castShadow = true; box.receiveShadow = true;
    grp.add(box);

    const ribbonMat = new THREE.MeshStandardMaterial({ color: g.ribbon, roughness: 0.3, metalness: 0.15 });
    const rH = new THREE.Mesh(new THREE.BoxGeometry(g.w + 0.005, 0.015, g.d + 0.005), ribbonMat);
    rH.position.set(0, g.h / 2, 0); grp.add(rH);
    const rV = new THREE.Mesh(new THREE.BoxGeometry(0.015, g.h + 0.005, g.d + 0.005), ribbonMat);
    rV.position.set(0, g.h / 2, 0); grp.add(rV);

    const bowGeo = new THREE.TorusGeometry(0.04, 0.01, 8, 16);
    const b1 = new THREE.Mesh(bowGeo, ribbonMat); b1.position.set(-0.03, g.h + 0.02, 0); b1.rotation.y = Math.PI / 4; grp.add(b1);
    const b2 = new THREE.Mesh(bowGeo, ribbonMat); b2.position.set(0.03, g.h + 0.02, 0); b2.rotation.y = -Math.PI / 4; grp.add(b2);

    grp.position.set(g.x, 0, g.z);
    scene.add(grp);
  });
}

// =====================================================================
// CONFETTI BOMB — 3D party popper on ceiling
// =====================================================================
function createConfettiBomb() {
  bombGroup = new THREE.Group();

  // Cylinder body
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xffd60a, roughness: 0.3, metalness: 0.2, clearcoat: 0.5,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.25, 16), bodyMat);
  body.castShadow = true;
  bombGroup.add(body);

  // Stripes
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(0.07 + i * 0.001, 0.008, 8, 24),
      new THREE.MeshStandardMaterial({ color: C.pink, roughness: 0.4 })
    );
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = -0.06 + i * 0.06;
    bombGroup.add(stripe);
  }

  // Top cap
  const capMat = new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.3, metalness: 0.1 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  cap.position.y = 0.125;
  bombGroup.add(cap);

  // Fuse (string going up)
  const fusePts = [];
  for (let j = 0; j <= 10; j++) {
    const t = j / 10;
    fusePts.push(new THREE.Vector3(Math.sin(t * 5) * 0.01, 0.125 + t * 0.15, 0));
  }
  const fuseGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fusePts), 10, 0.003, 4, false);
  bombGroup.add(new THREE.Mesh(fuseGeo, new THREE.MeshStandardMaterial({ color: 0x888888 })));

  // Spark at tip
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
  spark.position.set(0, 0.275, 0);
  spark.userData.isSpark = true;
  bombGroup.add(spark);

  bombGroup.position.set(0, ROOM.h - 0.3, -1.5);
  scene.add(bombGroup);
}

function explodeConfettiBomb() {
  if (bombExploded) return;
  bombExploded = true;

  // Shrink the bomb
  const shrinkAnim = () => {
    bombGroup.scale.multiplyScalar(0.9);
    if (bombGroup.scale.x > 0.1) requestAnimationFrame(shrinkAnim);
    else scene.remove(bombGroup);
  };
  shrinkAnim();

  // Launch multiple confetti bursts
  for (let burst = 0; burst < 3; burst++) {
    setTimeout(() => launchConfetti(200, 0, ROOM.h - 0.5, -1.5), burst * 150);
  }
}

function launchConfetti(count = 150, cx = 0, cy = ROOM.h - 0.5, cz = -1.5) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.01 + Math.random() * 0.04;
    const upSpeed = 0.01 + Math.random() * 0.03;
    positions[i * 3] = cx + (Math.random() - 0.5) * 0.3;
    positions[i * 3 + 1] = cy;
    positions[i * 3 + 2] = cz + (Math.random() - 0.5) * 0.3;

    const c = new THREE.Color(BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)]);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;

    velocities.push({
      vx: Math.cos(angle) * speed,
      vy: upSpeed,
      vz: Math.sin(angle) * speed,
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.045, vertexColors: true, transparent: true, opacity: 1, depthWrite: false,
  }));
  points.userData = { velocities, life: 5 };
  scene.add(points);
  confetti.push(points);
}

// =====================================================================
// POST-PROCESSING
// =====================================================================
function setupPostProcessing() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.35, 0.8));
  composer.addPass(new OutputPass());
}

// =====================================================================
// CONTROLS + CÁMARA (solo rotación horizontal y avance)
// =====================================================================
function setupControls() {
  const btnCake = document.getElementById('btnCake');
  const btnLights = document.getElementById('btnLights');
  const btnConfetti = document.getElementById('btnConfetti');
  const btnFullscreen = document.getElementById('btnFullscreen');

  btnCake.addEventListener('click', () => { cakeVisible = !cakeVisible; cakeGroup.visible = cakeVisible; btnCake.classList.toggle('active'); });
  btnLights.addEventListener('click', () => {
    partyLightsOn = !partyLightsOn;
    partyLights.forEach(l => { l.light.visible = partyLightsOn; l.glow.visible = partyLightsOn; });
    btnLights.classList.toggle('active');
  });
  btnConfetti.addEventListener('click', () => { launchConfetti(150); btnConfetti.classList.add('active'); setTimeout(() => btnConfetti.classList.remove('active'), 500); });
  btnFullscreen.addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); });

  window.addEventListener('keydown', e => keys.add(e.code));
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', e => {
    if (!cameraActive) return;
    pointerId = e.pointerId;
    lastPX = e.clientX; lastPY = e.clientY;
    dragDist = 0; downT = performance.now();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - lastPX, dy = e.clientY - lastPY;
    lastPX = e.clientX; lastPY = e.clientY;
    dragDist += Math.abs(dx) + Math.abs(dy);
    if (!autoTurn) camera.rotation.y -= dx * 0.005;   // girar el cuarto (yaw)
    touchF -= dy * 0.02;                               // arrastrar en vertical = caminar
  });
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
}

function onPointerUp(e) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  const wasTap = dragDist < 8 && performance.now() - downT < 450;
  touchF = 0;
  if (wasTap) tryTapCake(e.clientX, e.clientY);
}

function tryTapCake(x, y) {
  if (candleBlown || !cakeGroup || !cakeGroup.visible) return;
  const ndc = new THREE.Vector2(
    (x / window.innerWidth) * 2 - 1,
    -(y / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(cakeGroup.children, true);
  if (!hits.length) return;
  if (camera.position.distanceTo(hits[0].point) < 5) triggerCandleRitual();
}

function updateCamera(dt) {
  const k = 1 - Math.exp(-8 * dt);
  let kf = 0, ks = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) kf += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) kf -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ks -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ks += 1;

  mv.f += (touchF + kf - mv.f) * k;
  mv.s += (ks - mv.s) * k;

  // Giro automático hacia la fiesta tras la entrada
  if (autoTurn) {
    camera.rotation.y += (yawTarget - camera.rotation.y) * Math.min(1, dt * 2.5);
    if (Math.abs(yawTarget - camera.rotation.y) < 0.02) {
      camera.rotation.y = yawTarget;
      autoTurn = false;
    }
  }

  const yaw = camera.rotation.y;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const WALK = 2.0;

  const dx = (fx * mv.f + rx * mv.s) * dt * WALK;
  const dz = (fz * mv.f + rz * mv.s) * dt * WALK;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x + dx, -ROOM.w / 2 + 0.6, ROOM.w / 2 - 0.6);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z + dz, -ROOM.d / 2 + 0.55, ROOM.d / 2 - 0.25);

  // Efecto de caminata: balanceo + pasos
  const moving = Math.abs(mv.f) > 0.01 || Math.abs(mv.s) > 0.01;
  if (moving) {
    bobPhase += dt * 9;
    stepAccum += dt * 9;
    if (stepAccum >= Math.PI) { stepAccum -= Math.PI; stepSound(); }
  } else {
    bobPhase *= 1 - Math.min(1, dt * 6);
  }
  camera.position.y = CAM_Y + Math.sin(bobPhase) * 0.035;
  camera.rotation.x = 0;
  camera.rotation.z = 0;
}

function stepSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime, dur = 0.08;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280;
  const g = ctx.createGain(); g.gain.value = 0.055;
  src.connect(lp); lp.connect(g); g.connect(ctx.destination);
  src.start(t0);
}

// Entrada en primera persona: la persona abre y entra caminando
function updateEntryWalk(dt) {
  entryDist += dt * 1.7;
  bobPhase += dt * 9;
  stepAccum += dt * 9;
  if (stepAccum >= Math.PI) { stepAccum -= Math.PI; stepSound(); }

  camera.position.z = 3.6 - entryDist;
  camera.position.y = CAM_Y + Math.sin(bobPhase) * 0.035;

  // CRUZA EL UMBRAL → ¡SORPRESA!
  if (!surpriseTriggered && camera.position.z <= 2.62) triggerSurprise();

  // Llegó hasta el fondo de la entrada: gira hacia la fiesta
  if (camera.position.z <= 1.1) {
    entryWalk = false;
    cameraActive = true;
    autoTurn = true;
    yawTarget = 0;
    ui.classList.remove('hidden');
  }
}

function triggerSurprise() {
  surpriseTriggered = true;
  entryPhase = 'lights';
  lightsFadingIn = true;
  lightsProgress = 0.15;
  surpriseFlash = true;
  setTimeout(() => { entryPhase = 'bomb'; explodeConfettiBomb(); }, 300);
  setTimeout(() => { surpriseFlash = false; }, 700);
}

// =====================================================================
// SOPLAR LAS VELAS + APLAUSOS
// =====================================================================
function triggerCandleRitual() {
  if (candleBlown) return;
  ritualTimers.forEach(clearTimeout);
  ritualTimers = [];
  const wishEl = document.getElementById('wishOverlay');
  wishEl.textContent = '✨ Cierra los ojos y pide un deseo…';
  wishEl.classList.remove('hidden');
  ritualTimers.push(setTimeout(blowCandles, 1500));
}

function blowCandles() {
  candleBlowing = true;
  playWhoosh();
  ritualTimers.push(setTimeout(() => {
    candleBlowing = false;
    candleBlown = true;
    candleGlows.forEach(g => { g.visible = false; });
    spawnSmoke();
    launchConfetti(90, cakeGroup.position.x, 1.45, cakeGroup.position.z);
    const wishEl = document.getElementById('wishOverlay');
    wishEl.textContent = '🎉 ¡Deseo cumplido!';
    ritualTimers.push(setTimeout(playApplause, 350));
    ritualTimers.push(setTimeout(() => wishEl.classList.add('hidden'), 4200));
  }, 700));
}

function spawnSmoke() {
  cakeGroup.children.forEach(child => {
    if (!child.userData || !child.userData.isFlame) return;
    if (child.position.y < 1.0) return;
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.55, depthWrite: false })
    );
    puff.position.set(child.position.x + (Math.random() - 0.5) * 0.03,
      child.position.y + 0.05, child.position.z);
    scene.add(puff);
    smoke.push({ mesh: puff, life: 1.6, vy: 0.5 + Math.random() * 0.25 });
  });
}

function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playWhoosh() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime, dur = 0.5;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const env = Math.sin(Math.PI * i / d.length);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q = 1.5;
  bp.frequency.setValueAtTime(350, t0);
  bp.frequency.exponentialRampToValueAtTime(1800, t0 + dur);
  const g = ctx.createGain(); g.gain.value = 0.22;
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start(t0);
}

function playApplause() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.06;

  const clap = (t, gain) => {
    const dur = 0.05 + Math.random() * 0.03;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const dd = buf.getChannelData(0);
    for (let i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / dd.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 800 + Math.random() * 1600; bp.Q = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  };

  let t = t0;
  const end = t0 + 3.5;
  while (t < end) {
    const fade = t - t0 > 2.2 ? 0.5 : 1;
    const n = 4 + Math.floor(Math.random() * 10);
    for (let i = 0; i < n; i++) clap(t + Math.random() * 0.09, (0.5 + Math.random() * 0.5) * fade);
    t += 0.22 + Math.random() * 0.28;
  }
}

// =====================================================================
// ANIMATION LOOP
// =====================================================================
function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  // Door animation
  if (doorLeft && doorRight) {
    doorAngle += (doorTargetAngle - doorAngle) * Math.min(1, dt * 4);
    doorLeft.rotation.y = doorAngle;
    doorRight.rotation.y = -doorAngle;
  }

  // Lighting fade-in
  updateLighting(dt);

  // Caminata de entrada: entrar por la puerta
  if (entryWalk) updateEntryWalk(dt);
  else if (cameraActive) updateCamera(dt);

  // Balloons
  balloons.forEach(b => {
    const d = b.userData;
    b.position.y = d.baseY + Math.sin(t * d.speed + d.phase) * 0.1;
    b.position.x = d.baseX + Math.sin(t * 0.4 + d.swayPhase) * d.swayAmp;
    b.position.z = d.baseZ + Math.cos(t * 0.3 + d.swayPhase) * d.swayAmp * 0.5;
    b.rotation.z = Math.sin(t * 0.5 + d.phase) * 0.06;
    b.rotation.x = Math.cos(t * 0.4 + d.phase) * 0.03;
  });

  // Streamers
  streamers.forEach(s => {
    s.rotation.z = Math.sin(t * 0.6 + s.userData.phase) * s.userData.swayAmt;
    s.rotation.x = Math.sin(t * 0.4 + s.userData.phase) * s.userData.swayAmt * 0.4;
  });

  // Party lights flicker
  if (partyLightsOn) {
    partyLights.forEach(l => {
      l.light.intensity = 0.3 + Math.sin(t * 4 + l.phase) * 0.08 + Math.sin(t * 8.3 + l.phase) * 0.04;
      l.glow.material.opacity = 0.08 + Math.sin(t * 2.5 + l.phase) * 0.04;
      l.bulb.material.emissiveIntensity = 0.3 + Math.sin(t * 3 + l.phase) * 0.15;
    });
  }

  // Candle flames
  if (cakeGroup && cakeGroup.visible) {
    cakeGroup.children.forEach(child => {
      if (child.userData && child.userData.isFlame) {
        let sY, sX;
        if (candleBlown) {
          sY = 0.001; sX = 0.001;
        } else {
          const seed = child.position.x * 13 + child.position.z * 7;
          let f = Math.sin(t * 9 + seed) + Math.sin(t * 23 + seed * 1.7);
          if (candleBlowing) f += Math.sin(t * 42 + seed) * 1.4;
          sY = 0.85 + f * 0.2;
          sX = 0.9 + Math.sin(t * 7 + seed * 1.3) * 0.12;
        }
        child.scale.set(sX, sY, sX);
      }
      if (child.userData && child.userData.isSpark) {
        child.material.opacity = 0.5 + Math.sin(t * 15) * 0.5;
        child.scale.setScalar(0.8 + Math.sin(t * 20) * 0.3);
      }
    });
  }

  // Humo de velas apagadas
  smoke = smoke.filter(p => {
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.mesh); return false; }
    p.mesh.position.y += dt * p.vy;
    p.mesh.scale.addScalar(dt * 0.22);
    p.mesh.material.opacity = Math.max(0, p.life / 1.6) * 0.55;
    return true;
  });

  // Confetti
  confetti = confetti.filter(pts => {
    pts.userData.life -= dt;
    if (pts.userData.life <= 0) { scene.remove(pts); return false; }
    const pos = pts.geometry.attributes.position;
    const vels = pts.userData.velocities;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] += vels[i].vx;
      pos.array[i * 3 + 1] += vels[i].vy;
      pos.array[i * 3 + 2] += vels[i].vz;
      vels[i].vy -= 0.0002;
      vels[i].vx *= 0.997;
      vels[i].vz *= 0.997;
    }
    pos.needsUpdate = true;
    pts.material.opacity = Math.max(0, pts.userData.life / 5);
    return true;
  });

  // Render
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

// =====================================================================
// RESIZE
// =====================================================================
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
}

// =====================================================================
// START
// =====================================================================
init();
