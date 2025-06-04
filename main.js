//main.js
import * as THREE from 'three';
import {
  init,
  getCamera,
  spawnCube,
  spawnSphere,
  getKeyDown,
  getDeltaTime,
  Vector3,
  Transform,
  getScene
} from './engine.js';

//imports
import * as CANNON from 'cannon-es';
import { ScoreManager } from './ScoreManager.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let pinTemplate = null;  

//DOM/CSS
const fontLink = document.createElement('link');
fontLink.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
fontLink.rel = 'stylesheet';
document.head.appendChild(fontLink);

const neonCSS = document.createElement('style');
neonCSS.textContent = `
#scanlines {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  background: repeating-linear-gradient(rgba(0,0,0,0.08) 1px, transparent 2px);
  mix-blend-mode: multiply;
  z-index: 999;
}
#score-sheet, .frame, .roll, .total, #ui-container h1, #ui-container div {
  font-family: 'Press Start 2P', sans-serif;
  color: #ff00ff;
  text-shadow: 0 0 6px #ff00ff;
}
`;
document.head.appendChild(neonCSS);

const scanOverlay = document.createElement('div');
scanOverlay.id = 'scanlines';
document.body.appendChild(scanOverlay);

// scoresheet

function createScoreSheet() {
  const sheet = document.createElement('div');
  sheet.id = 'score-sheet';
  Object.assign(sheet.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(9, 60px) 120px',
    gap: '0px',
    position: 'absolute',
    top: '1%',
    right: '25%',
    zIndex: 10,
    background: 'rgba(0,0,0,0.5)',
    padding: '8px',
    borderRadius: '8px'
  });
  for (let i = 1; i <= 10; i++) {
    const frame = document.createElement('div');
    frame.className = 'frame';
    frame.dataset.frame = i;
    Object.assign(frame.style, {
      border: '2px solid #ff00ff',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: i < 10 ? '60px' : '120px',
      height: '80px',
      background: '#000'
    });

    const rolls = document.createElement('div');
    rolls.className = 'rolls';
    Object.assign(rolls.style, {
      display: 'grid',
      gridTemplateColumns: i < 10 ? '2fr 2fr' : '2fr 2fr 2fr',
      borderBottom: '2px solid #ff00ff',
      borderTop: '2px solid #ff00ff',
      height: '30px'
    });
    
    const rollCount = i < 10 ? 2 : 3;
    for (let r = 1; r <= rollCount; r++) {
      const cell = document.createElement('div');
      cell.className = 'roll';
      cell.dataset.roll = r;
      Object.assign(cell.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        borderRight: r < rollCount ? '1px solid #ff00ff' : ''
      });
      rolls.appendChild(cell);
    }
    const total = document.createElement('div');
    total.className = 'total';
    total.dataset.total = i;
    Object.assign(total.style, {
      height: '25px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px'
    });
    frame.append(rolls, total);
    sheet.appendChild(frame);
  }
  document.body.appendChild(sheet);

  
}

function setRoll(frameNum, rollNum, value) {
  const cell = document.querySelector(
    `#score-sheet .frame[data-frame="${frameNum}"] .roll[data-roll="${rollNum}"]`
  ); if (cell) cell.innerText = value;
}
function setTotal(frameNum, value) {
  const cell = document.querySelector(
    `#score-sheet .frame[data-frame="${frameNum}"] .total[data-total="${frameNum}"]`
  ); if (cell) cell.innerText = value;
}
createScoreSheet();

document.querySelectorAll('#score-sheet .frame').forEach(frame => {
  const idx = frame.dataset.frame;
  const label = document.createElement('div');
  label.className = 'frame-label';
  label.innerText = idx;
  Object.assign(label.style, {
    fontSize: '10px',
    color: '#ff00ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '15px'
  });
  frame.prepend(label);
});

//Title UI

const uiContainer = document.createElement('div');
uiContainer.id = 'ui-container';
Object.assign(uiContainer.style, {
  position: 'absolute', top: '0%', left: '0%',
  backgroundColor: 'rgba(0,0,0,0.7)', padding: '16px 24px',
  borderRadius: '12px', textAlign: 'center', zIndex: 10
});
const titleElem = document.createElement('h1');
titleElem.innerText = 'BOWLERO';
titleElem.style.color = '#ff00ff';
uiContainer.appendChild(titleElem);
document.body.appendChild(uiContainer);

// Add instructions UI
const instructions = document.createElement('div');
instructions.id = 'instructions';
Object.assign(instructions.style, {
  position: 'absolute',
  bottom: '2%',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.85)',
  color: '#fff',
  fontFamily: "'Press Start 2P', sans-serif",
  fontSize: '14px',
  padding: '12px 24px',
  borderRadius: '10px',
  border: '2px solid #ff00ff',
  zIndex: 1001,
  textAlign: 'center',
  textShadow: '0 0 6px #ff00ff'
});
instructions.innerHTML = `
  <b>How to Play:</b><br>
  <span style="color:#ff00ff;">Click and drag <u>backwards</u> from the bowling ball to aim and set power.<br>
  Release to throw!</span>
`;
document.body.appendChild(instructions);

//Initialize globals

const score = new ScoreManager();
let currentFrame = 1;
let currentRoll = 1;
let pinsThisRoll = 0;
let world;
let ballBody;
let ballMesh;
const pinBodies = [];
const pinMeshes = [];
let camera;
let hasLaunched = false;
const scoredPins = new Set();
const pinOriginalPositions = [];
let launchTime = null;
let autoResetPending = false;
let gameOver = false;
const standingPins = []; // Track which pins are standing (true = standing, false = knocked down)

// Initialize the physics world
function createPhysics() {
  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.solver.iterations = 40; // Even more stability

  // Define materials
  const groundMaterial = new CANNON.Material('ground');
  const pinMaterial = new CANNON.Material('pin');
  const ballMaterial = new CANNON.Material('ball');

  // Ground plane
  const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // Contact materials (much less bounce, more friction)
  world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, pinMaterial, {
    friction: 0.7,    // High friction for pin stability
    restitution: 0.01 // Very low bounce
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, pinMaterial, {
    friction: 0.22,   // Slightly more friction
    restitution: 0.01 // Very low bounce
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(pinMaterial, pinMaterial, {
    friction: 0.35,   // More friction between pins
    restitution: 0.02 // Very low bounce
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
    friction: 0.04,   // Lane is slick
    restitution: 0.0
  }));

  return { pinMaterial, ballMaterial };
}

function spawnPin(position, pinMaterial) {
  if (!pinTemplate) return;

  // — 1) Measure your mesh so the physics matches exactly —
  pinTemplate.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(pinTemplate);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const height = size.y;
  const radius = Math.max(size.x, size.z) / 2;
  const halfH  = height / 2;
  const margin = 0.2;  // small gap so it doesn't intersect floor

  // — 2) Build a compound Cannon body: cylinder + end‐spheres —
  const body = new CANNON.Body({
    mass: 3.8, // 2.5x real pin mass (kg) for much harder knockdown
    material: pinMaterial,
    allowSleep: true,
    sleepSpeedLimit: 0.1,
    sleepTimeLimit: 1
  });

  // 2a) cylinder, rotated so its axis → Y
  const cyl = new CANNON.Cylinder(radius, radius, height - 2*radius, 16);
  const q   = new CANNON.Quaternion().setFromEuler(0, 0, Math.PI/2, 'XYZ');
  body.addShape(cyl, new CANNON.Vec3(0, 0, 0), q);

  // 2b) sphere at top
  const sphTop = new CANNON.Sphere(radius);
  body.addShape(sphTop, new CANNON.Vec3(0, +halfH - radius, 0));

  // 2c) sphere at bottom
  const sphBot = new CANNON.Sphere(radius);
  body.addShape(sphBot, new CANNON.Vec3(0, -halfH + radius, 0));

  body.updateMassProperties();

  // — 3) Position & sleep until the ball is launched —
  body.position.set(position.x,
                    position.y + halfH + margin,
                    position.z);
  body.sleep();
  world.addBody(body);

  // optional: kill any pure Y‐spin and add damping
  body.angularFactor.set(1, 0, 1);
  body.angularDamping  = 0.8;
  body.linearDamping   = 0.1;

  // — 4) Wrap your visual model + optional debug hull —
  const wrapper = new THREE.Group();
  wrapper.position.copy(body.position);
  wrapper.quaternion.copy(body.quaternion);

  // Your real pin mesh
  const mesh = pinTemplate.clone(true);
  mesh.position.set(0, -halfH, 0);
  wrapper.add(mesh);

  getScene().add(wrapper);

  // — 5) track for sync & scoring —
  pinBodies.push(body);
  pinMeshes.push(new Transform(wrapper));
  pinOriginalPositions.push(body.position.clone());
  standingPins.push(true); // All pins start standing
}

// Arrange 10 pins in a triangle formation
function spawnAllPins(pinMaterial) {
  const rows = [1, 2, 3, 4]; // apex to base
  const startZ = -12;         // pins at far end of 60ft lane
  const rowSpacing = 1.2;     // spacing between rows
  const xSpacing = 1.2;       // spacing between pins

  rows.forEach((count, r) => {
    const z = startZ - r * rowSpacing;
    const offset = ((count - 1) * xSpacing) / 2;
    for (let i = 0; i < count; i++) {
      const x = (i * xSpacing) - offset;
      spawnPin(Vector3(x, 0, z), pinMaterial);
    }
  });
}

// Setup scene, physics, and camera
function start() {

  const { pinMaterial, ballMaterial } = createPhysics();

  // Lane surface - realistic bowling lane dimensions
  const texLoader = new THREE.TextureLoader();
  const laneTex = texLoader.load('textures/bowling.jpg', tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // Adjust texture tiling for realistic proportions
    tex.repeat.set(1, 15); // 1 tile across width, 15 tiles along length
    tex.encoding = THREE.sRGBEncoding;
  });

  const laneMat = new THREE.MeshPhongMaterial({ map: laneTex });
  // Standard bowling lane (scaled appropriately)
  const laneGeo = new THREE.PlaneGeometry(4.7, 60);
  const laneMesh = new THREE.Mesh(laneGeo, laneMat);

  laneMesh.rotation.x = -Math.PI/2;
  laneMesh.position.set(0, 0, -15); // Center the lane properly
  laneMesh.receiveShadow = true;

  getScene().add(laneMesh);

  // Pins
  spawnAllPins(pinMaterial);

  // Camera - adjusted for longer lane
  camera = getCamera();
  camera.setPosition(Vector3(0, 3, 20));
  camera.setRotation(Vector3(0, 0, 0));

  // Ball mesh - start position adjusted
  ballMesh = spawnSphere(
    Vector3(0, 0.25, 15),
    Vector3(0, 0, 0),
    Vector3(0.42, 0.42, 0.42),
    0x7777FF
  );

  // Ball physics body - start position adjusted
  const ballShape = new CANNON.Sphere(0.42);
  ballBody = new CANNON.Body({ mass: 6.35, material: ballMaterial }); // 14 lbs (6.35 kg)
  ballBody.addShape(ballShape);
  ballBody.position.set(0, 0.42, 15);
  ballBody.linearDamping = 0.12; // More damping for less energy transfer
  world.addBody(ballBody);

  hasLaunched = false;

  pinsThisRoll = 0;
  
  // Wait for renderer to be available before attaching listeners
  setTimeout(attachMouseListeners, 0);
}

function recordKnock(pinIdx) {
  pinsThisRoll++;
  standingPins[pinIdx] = false;
  // Do NOT hide the pin mesh here; hide after roll is committed
  // pinMeshes[pinIdx].o3d.visible = false;
}
function commitRoll() {
  score.roll(pinsThisRoll);

  // Strike formatting
  if (pinsThisRoll === 10 && currentRoll === 1) {
    setRoll(currentFrame, currentRoll, 'X');
  } else if (currentRoll === 2 && score.rolls[score.rolls.length - 2] + pinsThisRoll === 10) {
    // Spare formatting
    setRoll(currentFrame, currentRoll, '/');
  } else {
    setRoll(currentFrame, currentRoll, pinsThisRoll);
  }

 const frameScores = score.getFrameScores();
  let cumulative = 0;

  frameScores.forEach((score, i) => {
    if (score == null) {
      setTotal(i + 1, '—');
    } else {
      cumulative += score;
      setTotal(i + 1, cumulative);
    }
  });

  // Frame progression logic
  if (currentFrame < 10) {
    if (pinsThisRoll === 10 && currentRoll === 1) {
      // Strike: next frame, reset all pins
      setRoll(currentFrame, 1, 'X');
      currentFrame++;
      currentRoll = 1;
      resetPinsForNewFrame();
    } else if (currentRoll === 1) {
      // First roll, not a strike: prepare for second roll, do NOT reset pins
      currentRoll = 2;
    } else {
      // Second roll: next frame, reset all pins
      if (score.rolls[score.rolls.length - 2] + pinsThisRoll === 10) {
        setRoll(currentFrame, 2, '/');
      } else {
        setRoll(currentFrame, 2, pinsThisRoll);
      }
      currentFrame++;
      currentRoll = 1;
      resetPinsForNewFrame();
    }
  } else {
    // 10th frame logic (leave as-is for now)
    setRoll(currentFrame, currentRoll, pinsThisRoll === 10 ? 'X' : pinsThisRoll);
    if (currentRoll === 1) {
      currentRoll = 2;
    } else if (currentRoll === 2) {
      const lastTwo = score.rolls.slice(-2);
      if (lastTwo[0] === 10 || lastTwo[0] + lastTwo[1] === 10) {
        currentRoll = 3;
      } else {
        currentFrame++; 
        gameOver = true;
      }
    } else {
      currentFrame++; 
      gameOver = true;
    }
    // For 10th frame, always reset all pins for each roll
    resetPinsForNewFrame();
  }

  pinsThisRoll = 0;
}


let rollCommitted = false;

// Main loop: physics step, sync meshes, input handling
function update() {
  if (gameOver) return;
  const dt = getDeltaTime();
  world.step(1/120, dt, 10);

  // — Ball sync (unchanged) —
  const b = ballBody.position;
  ballMesh.translateWorld(Vector3(
    b.x - ballMesh.position().x,
    b.y - ballMesh.position().y,
    b.z - ballMesh.position().z
  ));

  // — Pin sync: copy both position & rotation! —
  for (let i = 0; i < pinBodies.length; i++) {
    const body    = pinBodies[i];
    const wrapper = pinMeshes[i].o3d;
    wrapper.position.copy(body.position);
    wrapper.quaternion.copy(body.quaternion);
  }

  // — Scoring & input (track only pins knocked down this roll) —
  for (let i = 0; i < pinBodies.length; i++) {
    if (!scoredPins.has(i) && standingPins[i]) {
      const b = pinBodies[i];
      if (b.position.distanceTo(pinOriginalPositions[i]) > 0.2) {
        scoredPins.add(i);
        recordKnock(i);
      }
    }
  }

  if (hasLaunched && !rollCommitted) {
    const now = performance.now();

    // Record launch time once
    if (launchTime === null) {
      launchTime = now;
    }

    // Wait 3 seconds after launch for longer lane
    if (now - launchTime >= 3000) {
      rollCommitted = true;
      commitRoll();
      launchTime = null; // reset for next turn
      hasLaunched = false;
      resetForNextRoll();
    }
  }

  camera.lookAt(ballMesh.position());

  // Update arrow if visible and dragging
  if (arrowVisible && mouseDown) updateArrow();
}

//init called after models loaded in
new GLTFLoader().load(
  '/models/pin.glb',
  (gltf) => {
    pinTemplate = gltf.scene;
    pinTemplate.traverse(node => {
      if (node.isMesh) {
        node.castShadow    = true;
        node.receiveShadow = true;
      }
    });
    pinTemplate.scale.set(0.2, 0.2, 0.2);
    init(start, update);
  },
  undefined,
  (err) => console.error('Failed to load pin model:', err)
);

function resetPinsForNewFrame() {
  for (let i = 0; i < pinBodies.length; i++) {
    const body = pinBodies[i];
    const mesh = pinMeshes[i].o3d;
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.position.copy(pinOriginalPositions[i]);
    body.quaternion.set(0, 0, 0, 1);
    mesh.position.copy(pinOriginalPositions[i]);
    mesh.quaternion.set(0, 0, 0, 1);
    body.sleep();
    standingPins[i] = true;
    mesh.visible = true;
  }
  scoredPins.clear();
}

function resetForNextRoll() {
  // Reset ball to starting position
  ballBody.velocity.setZero();
  ballBody.angularVelocity.setZero();
  ballBody.position.set(0, 0.42, 15);
  ballBody.quaternion.set(0, 0, 0, 1);
  ballMesh.setPosition(Vector3(0, 0.25, 15));
  ballMesh.setRotation(Vector3(0, 0, 0));

  // Hide knocked-down pins ONLY if it's the second roll of a frame (not after strike/new frame)
  // If currentRoll === 2, we just finished the first roll and are about to do the second roll
  if (currentRoll === 2 && currentFrame <= 10) {
    for (let i = 0; i < standingPins.length; i++) {
      if (!standingPins[i]) {
        pinMeshes[i].o3d.visible = false;
      }
    }
  }

  // Reset launch state
  hasLaunched = false;
  rollCommitted = false;
  pinsThisRoll = 0;
  scoredPins.clear();
  autoResetPending = false;
}

// mouse control variables
let mouseDown = false;
let dragStart = null;
let dragEnd = null;
let arrowHelper = null;
let arrowVisible = false;

// Utility: convert screen coords to world coords at a given y-plane
function screenToWorld(x, y, yPlane = 0.25) {
  if (!window.renderer) {
    console.warn('renderer not ready for screenToWorld');
    return new THREE.Vector3(0, yPlane, 0);
  }
  const rect = window.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((x - rect.left) / rect.width) * 2 - 1,
    -((y - rect.top) / rect.height) * 2 + 1
  );
  const cameraObj = getCamera().o3d;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, cameraObj);
  const dir = raycaster.ray.direction;
  const origin = raycaster.ray.origin;
  // Intersect with y = yPlane
  const t = (yPlane - origin.y) / dir.y;
  const worldPos = origin.clone().add(dir.clone().multiplyScalar(t));
  console.log('[screenToWorld] Screen:', x, y, '-> World:', worldPos);
  return worldPos;
}

// Mouse event handlers
function onMouseDown(e) {
  if (hasLaunched || gameOver) {
    console.log('[onMouseDown] Ignored: hasLaunched or gameOver');
    return;
  }
  mouseDown = true;
  dragStart = screenToWorld(e.clientX, e.clientY);
  dragEnd = dragStart.clone();
  showArrow();
  console.log('[onMouseDown] Drag started at', dragStart);
}

function onMouseMove(e) {
  if (!mouseDown) return;
  dragEnd = screenToWorld(e.clientX, e.clientY);
  updateArrow();
  // Debug: show drag vector
  if (dragStart && dragEnd) {
    const dragVec = new THREE.Vector3().subVectors(dragStart, dragEnd);
    console.log('[onMouseMove] Drag vector:', dragVec);
  }
}

function onMouseUp(e) {
  if (!mouseDown) return;
  mouseDown = false;
  hideArrow();
  if (hasLaunched || gameOver) {
    console.log('[onMouseUp] Ignored: hasLaunched or gameOver');
    return;
  }
  // Calculate launch vector
  const from = dragStart;
  const to = dragEnd;
  const dragVec = new THREE.Vector3().subVectors(from, to);
  console.log('[onMouseUp] Drag vector:', dragVec);
  // Only allow forward throws (negative z)
  if (dragVec.length() < 0.2 || dragVec.z >= 0) {
    console.log('[onMouseUp] Drag too short or not forward, ignoring throw.');
    return;
  }
  // Clamp force and angle
  const maxForce = 180; // Lower max force for less energy
  const minForce = 50;
  let force = THREE.MathUtils.clamp(dragVec.length() * 80, minForce, maxForce);
  let dir = dragVec.clone().normalize();
  // Only allow small angles left/right
  dir.y = 0;
  dir.normalize();
  // Apply impulse
  hasLaunched = true;
  ballBody.velocity.setZero();
  ballBody.angularVelocity.setZero();
  ballBody.applyImpulse(
    new CANNON.Vec3(dir.x * force, 0, dir.z * force),
    new CANNON.Vec3(0, 0, 0)
  );
  console.log('[onMouseUp] Ball launched! Direction:', dir, 'Force:', force);
}

function showArrow() {
  if (arrowHelper) {
    getScene().remove(arrowHelper);
    arrowHelper = null;
  }
  const ballPos = ballMesh.position();
  arrowHelper = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(ballPos.x, ballPos.y, ballPos.z + 0.01), // offset to avoid z-fighting
    1.5,
    0xffff00,
    0.7,
    0.4
  );
  getScene().add(arrowHelper);
  arrowVisible = true;
  arrowHelper.visible = true;
  console.log('[showArrow] Arrow shown at', ballPos);
}

function updateArrow() {
  if (!arrowHelper || !dragStart || !dragEnd) return;
  const from = dragStart;
  const to = dragEnd;
  const dragVec = new THREE.Vector3().subVectors(from, to);
  if (dragVec.length() < 0.05) {
    arrowHelper.visible = false;
    return;
  }
  // Only show forward throws
  if (dragVec.z >= 0) {
    arrowHelper.visible = false;
    return;
  }
  arrowHelper.visible = true;
  const ballPos = ballMesh.position();
  arrowHelper.position.copy(ballPos);
  const dir = dragVec.clone().normalize();
  dir.y = 0;
  dir.normalize();
  arrowHelper.setDirection(dir);
  // Clamp arrow length
  let len = THREE.MathUtils.clamp(dragVec.length(), 0.7, 4.0);
  arrowHelper.setLength(len, 0.7, 0.4);
  // Debug
  console.log('[updateArrow] Arrow dir:', dir, 'len:', len);
}

function hideArrow() {
  if (arrowHelper) {
    getScene().remove(arrowHelper);
    arrowHelper = null;
    console.log('[hideArrow] Arrow hidden');
  }
  arrowVisible = false;
}

// Attach mouse listeners after renderer is created
let renderer = null; // will be set in start()
function attachMouseListeners() {
  if (!window.renderer) {
    setTimeout(attachMouseListeners, 50);
    return;
  }
  renderer = window.renderer;
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
  renderer.domElement.addEventListener('mouseleave', onMouseUp);
  // Touch support for mobile
  renderer.domElement.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      onMouseDown(e.touches[0]);
      e.preventDefault();
    }
  });
  renderer.domElement.addEventListener('touchmove', e => {
    if (e.touches.length === 1) {
      onMouseMove(e.touches[0]);
      e.preventDefault();
    }
  });
  renderer.domElement.addEventListener('touchend', e => {
    onMouseUp(e.changedTouches[0]);
    e.preventDefault();
  });
  console.log('[attachMouseListeners] Mouse listeners attached');
}