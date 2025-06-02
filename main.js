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

// Initialize the physics world
function createPhysics() {
  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.solver.iterations = 20; // Increase solver iterations for better accuracy

  // Define materials
  const groundMaterial = new CANNON.Material('ground');
  const pinMaterial = new CANNON.Material('pin');
  const ballMaterial = new CANNON.Material('ball');

  // Ground plane
  const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // Contact materials
  world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, pinMaterial, {
    friction: 0.8,    // High friction to keep pins stable
    restitution: 0.1  // Low restitution to prevent bouncing
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, pinMaterial, {
    friction: 0.2,    // Moderate friction for ball-pin interaction
    restitution: 0.1  // Lower restitution to reduce ball bouncing off pins
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(pinMaterial, pinMaterial, {
    friction: 0.5,    // Adjusted for realistic pin-to-pin sliding
    restitution: 0.2  // Slightly increased for pin-to-pin collisions
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
    friction: 0.05,   // Low friction for slippery lane
    restitution: 0.0  // No bouncing off the ground
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
    mass: 1.54,
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
  ballBody = new CANNON.Body({ mass: 5.9, material: ballMaterial }); // 13 lbs
  ballBody.addShape(ballShape);
  ballBody.position.set(0, 0.42, 15);
  ballBody.linearDamping = 0.05;
  world.addBody(ballBody);

  hasLaunched = false;

  pinsThisRoll = 0;
  
}

function recordKnock() { pinsThisRoll++; }
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
  // normal rules
  if (pinsThisRoll === 10 && currentRoll === 1) {
    setRoll(currentFrame, 1, 'X');
    currentFrame++;
    currentRoll = 1;
  } else if (currentRoll === 1) {
    currentRoll = 2;
  } else {
    if (score.rolls[score.rolls.length - 2] + pinsThisRoll === 10) {
      setRoll(currentFrame, 2, '/');
    } else {
      setRoll(currentFrame, 2, pinsThisRoll);
    }
    currentFrame++;
    currentRoll = 1;
  }
} else {
  // 10th frame logic
  setRoll(currentFrame, currentRoll, pinsThisRoll === 10 ? 'X' : pinsThisRoll);

  // allow up to 3 rolls
  if (currentRoll === 1) {
    currentRoll = 2;
  } else if (currentRoll === 2) {
    const lastTwo = score.rolls.slice(-2);
    if (lastTwo[0] === 10 || lastTwo[0] + lastTwo[1] === 10) {
      currentRoll = 3;
    } else {
      currentFrame++; 
      gameOver = true; // end of game
    }
  } else {
    currentFrame++; 
    gameOver = true; // end of game
  }
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
    const wrapper = pinMeshes[i].o3d;  // unwrap THREE.Group

    wrapper.position.copy(body.position);
    wrapper.quaternion.copy(body.quaternion);
  }

  // — Scoring & input (unchanged) —
  pinBodies.forEach((b,i) => {
    if (!scoredPins.has(i) && b.position.distanceTo(pinOriginalPositions[i])>0.2) {
      scoredPins.add(i); recordKnock();
    }
  });

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

  if (getKeyDown('ArrowUp') && !hasLaunched) {
    hasLaunched = true;
    ballBody.applyLocalImpulse(
      new CANNON.Vec3(0, 0, -200), // Increased force for longer lane
      new CANNON.Vec3(0, 0, 0)
    );
  }

  camera.lookAt(ballMesh.position());
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

function resetForNextRoll() {
  // Reset ball to starting position
  ballBody.velocity.setZero();
  ballBody.angularVelocity.setZero();
  ballBody.position.set(0, 0.42, 15);
  ballBody.quaternion.set(0, 0, 0, 1);
  ballMesh.setPosition(Vector3(0, 0.25, 15));
  ballMesh.setRotation(Vector3(0, 0, 0));

  // Reset pins
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
  }

  // Reset launch state
  hasLaunched = false;
  rollCommitted = false;
  pinsThisRoll = 0;
  scoredPins.clear();
  autoResetPending = false;
}