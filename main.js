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

let neonTex = null;

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

  body.position.set(position.x,
                    position.y + halfH + margin,
                    position.z);
  body.sleep();
  world.addBody(body);

  body.angularFactor.set(1, 0, 1);
  body.angularDamping  = 0.8;
  body.linearDamping   = 0.1;

  const wrapper = new THREE.Group();
  wrapper.position.copy(body.position);
  wrapper.quaternion.copy(body.quaternion);

  const mesh = pinTemplate.clone(true);
  mesh.position.set(0, -halfH, 0);
  wrapper.add(mesh);

  getScene().add(wrapper);

  // track for sync & scoring —
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

let iconMesh = null;
let iconVisible = true;
let iconTimer = 0;

// Setup scene, physics, and camera
function start() {

  const { pinMaterial, ballMaterial } = createPhysics();

  const texLoader = new THREE.TextureLoader();
  const laneTex = texLoader.load('textures/bowling.jpg', tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 15);
    tex.encoding = THREE.sRGBEncoding;
  });
  const lane2Tex = texLoader.load('textures/bowling2.jpg', tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 15);
    tex.encoding = THREE.sRGBEncoding;
  });

  const laneMat = new THREE.MeshPhongMaterial({
    map: laneTex,
    shininess: 100,
    specular: 0xaaaaaa
  });

  const laneGeo = new THREE.BoxGeometry(6, 60.2, 0.2);
  const laneMesh = new THREE.Mesh(laneGeo, laneMat);
  laneMesh.rotation.x = -Math.PI / 2;
  laneMesh.position.set(0, -0.1, -15);
  laneMesh.receiveShadow = true;
  getScene().add(laneMesh);

  const lane2Mat = new THREE.MeshPhongMaterial({
    map: lane2Tex,
    shininess: 20,
    specular: 0xaaaaaa
  });

  const lane2Geo = new THREE.BoxGeometry(70, 90, 0.2);
  const lane2Mesh = new THREE.Mesh(lane2Geo, lane2Mat);
  lane2Mesh.rotation.x = -Math.PI / 2;
  lane2Mesh.position.set(0, -0.3, -15);
  lane2Mesh.receiveShadow = true;
  getScene().add(lane2Mesh);

  //rails
  const neonLoader = new THREE.TextureLoader();
  neonTex = neonLoader.load('textures/neon.jpg', tex => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.center.set(0.5, 0.5);
    tex.rotation = -Math.PI / 2;
    tex.repeat.set(20, 1);

    tex.encoding = THREE.sRGBEncoding;
  });

  const laneWidth = 4.7;
  const laneLength = 60;

  // 1) Create a long, thin box for the rail geometry:
  const railThickness = 0.5;
  const railHeight = 0.2;
  const railGeo = new THREE.BoxGeometry(
    railThickness,
    railHeight,
    laneLength
  );

  // 2) Give it a blue emissive material:
  const railMat = new THREE.MeshPhongMaterial({
    map: neonTex,
    emissive: 0xFF0000,
    emissiveIntensity: 0.1,
    shininess: 20
  });

  // 3) Make two rails and position them on either side of the lane:
  const leftRail = new THREE.Mesh(railGeo, railMat);
  leftRail.position.set(
    - (laneWidth / 2 + railThickness / 2), // x = −(half‐lane − half‐thickness)
    0,                        // y = raise it just above the floor
    -15                                     // z = same as laneMesh.position.z
  );
  leftRail.receiveShadow = true;
  leftRail.castShadow = false;
  getScene().add(leftRail);

  const rightRail = leftRail.clone();
  rightRail.position.x = + (laneWidth / 2 + railThickness / 2);
  getScene().add(rightRail);

  //archways

  const archLoader = new THREE.TextureLoader();
	const archTex = archLoader.load('textures/neon2.png', tex => {
	  tex.wrapS = THREE.RepeatWrapping;
	  tex.wrapT = THREE.RepeatWrapping;
	  tex.repeat.set(1, 1);
	  tex.encoding = THREE.sRGBEncoding;
	});

	const archMat = new THREE.MeshBasicMaterial({
	  map: archTex,
	  transparent: false,
	  side: THREE.DoubleSide,
	});

	const pinZ          = -17;
	const postHeight    = 4;
	const postThickness = 0.4;
	const postDepth     = 10;

	const postGeo = new THREE.BoxGeometry(
	  postThickness,
	  postHeight,
	  postDepth
	);

	const leftPost = new THREE.Mesh(postGeo, archMat);
	leftPost.position.set(
	  - (laneWidth / 2 + postThickness + 1.5),
	    postHeight / 2,
	  pinZ
	);
	getScene().add(leftPost);

	const rightPost = leftPost.clone();
	rightPost.position.x =   (laneWidth / 2 + postThickness + 1.5);
	getScene().add(rightPost);

	const postGeo2 = new THREE.BoxGeometry(
		7, postHeight,
	  postDepth
	);

	const postGeo3 = new THREE.BoxGeometry(
		15, postHeight * 4.2,
	  postDepth
	);

	const backMat = new THREE.MeshBasicMaterial({
	  map: lane2Tex,
	  color: 0x444444,
	  transparent: false,
	  side: THREE.DoubleSide,
	});

	const backMat2 = new THREE.MeshBasicMaterial({
	  color: 0x353535,
	  transparent: false,
	  side: THREE.DoubleSide,
	});
	const backPost = new THREE.Mesh(postGeo2, backMat);
	backPost.position.set(
	  0, postHeight / 2, pinZ - 5
	);
	getScene().add(backPost);

	const backPost2 = new THREE.Mesh(postGeo3, backMat2);
	backPost2.position.set(
	  0, postHeight, pinZ - 7
	);
	getScene().add(backPost2);

	//icon
	const iconLoader = new THREE.TextureLoader();
  const iconTex = iconLoader.load('textures/icon.png', tex => {
    tex.encoding = THREE.sRGBEncoding;
  });
  const iconMat = new THREE.MeshBasicMaterial({
    map: iconTex,
    transparent: true,
    side: THREE.DoubleSide
  });
  const iconGeo = new THREE.PlaneGeometry(8, 6);
  iconMesh = new THREE.Mesh(iconGeo, iconMat);
  // position it above the arch beam:
  iconMesh.position.set(0,
    postHeight + (postThickness + 0.5) / 2 + 2.5,
    pinZ
  );
  getScene().add(iconMesh);

	const archWidth = laneWidth + postThickness * 2 + 1.3;
	const beamGeo = new THREE.BoxGeometry(
	  archWidth + 2,
	  postThickness + 0.5,
	  postDepth + 0.3
	);

	const archBeam = new THREE.Mesh(beamGeo, archMat);
	archBeam.position.set(
	  0, postHeight, pinZ
	);
	getScene().add(archBeam);

  // Pins
  spawnAllPins(pinMaterial);

  // Camera - adjusted for longer lane
  camera = getCamera();
  camera.setPosition(Vector3(0, 4.2, 20));
  camera.setRotation(Vector3(0, 0, 0));

  // Ball mesh - start position adjusted
    ballMesh = spawnSphere(
    Vector3(0, 0.25, 15),
    Vector3(0, 0, 0),
    Vector3(0.42, 0.42, 0.42),
    0xFFFFFF
  );

  const loader = new THREE.TextureLoader();
  loader.load('textures/ball.png', texture => {
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    const threeMesh = ballMesh.o3d;
    threeMesh.material = new THREE.MeshPhongMaterial({ 
    map: texture,
    shininess: 15,
    specular: 0xeeeeee
    });
  });

  const ballShape = new CANNON.Sphere(0.42);
  ballBody = new CANNON.Body({ mass: 6.35, material: ballMaterial });
  ballBody.addShape(ballShape);
  ballBody.position.set(0, 0.42, 15);
  ballBody.linearDamping = 0.12;
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
    showFxMessage('STRIKE!');
  } else if (currentRoll === 2 && score.rolls[score.rolls.length - 2] + pinsThisRoll === 10) {
    // Spare formatting
    setRoll(currentFrame, currentRoll, '/');
    showFxMessage('SPARE!');
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

  // --- Frame progression logic ---
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
    // --- 10th frame logic ---
    // Track how many pins were knocked down on first roll
    if (currentRoll === 1) {
      if (pinsThisRoll === 10) {
        // Strike: reset all pins for second roll
        resetPinsForNewFrame();
      } else {
        // Not a strike: hide knocked-down pins for second roll
        for (let i = 0; i < standingPins.length; i++) {
          if (!standingPins[i]) {
            pinMeshes[i].o3d.visible = false;
          }
        }
      }
      currentRoll = 2;
    } else if (currentRoll === 2) {
      const firstRoll = score.rolls[score.rolls.length - (pinsThisRoll === 10 ? 2 : 2)];
      const secondRoll = pinsThisRoll;
      const firstWasStrike = firstRoll === 10;
      const spare = !firstWasStrike && (firstRoll + secondRoll === 10);

      if (firstWasStrike || spare) {
        // If strike or spare in first two rolls, reset all pins for third roll
        resetPinsForNewFrame();
        currentRoll = 3;
      } else {
        // Otherwise, game over after second roll
        currentFrame++;
        gameOver = true;
      }
    } else {
      // Third roll (only possible after strike or spare in first two rolls)
      currentFrame++;
      gameOver = true;
    }
  }

  pinsThisRoll = 0;

  // --- Show end popup if game over ---
  if (gameOver) {
    // Calculate final score
    const frameScores = score.getFrameScores();
    let total = 0;
    for (let i = 0; i < frameScores.length; ++i) {
      if (frameScores[i] != null) total += frameScores[i];
    }
    // Update high score if needed
    const mode = getMode();
    setHighScore(mode, total);
    updateRecordScoreUI();
    showEndPopup(total, getHighScores()[mode]);
  }
}


let rollCommitted = false;
let iconTime = 0;

// Main loop: physics step, sync meshes, input handling
function update() {
  if (gameOver) return;
  const dt = getDeltaTime();
  world.step(1/120, dt, 10);

  if (neonTex) {
    const scrollSpeed = 2.0;
    neonTex.offset.x += scrollSpeed * dt;
  }

  iconTime += getDeltaTime() * 2;
	const intensity = 0.6 + 0.3 * Math.sin(iconTime * 2.0);
	iconMesh.material.color.setRGB(intensity, intensity, intensity);

  const mesh = ballMesh.o3d;
  mesh.position.copy(ballBody.position);
  mesh.quaternion.copy(ballBody.quaternion);

  // — Ball sync —
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

    // Wait 5 seconds after launch for longer lane
    if (now - launchTime >= 5000) {
      rollCommitted = true;
      commitRoll();
      launchTime = null; // reset for next turn
      hasLaunched = false;
      resetForNextRoll();
    }
  }

  camera.lookAt(ballMesh.position().add(new THREE.Vector3(0, 2, 0)));

  // Update arrow if visible and dragging
  if (arrowVisible && mouseDown) updateArrow();
}

//init called after models loaded in
new GLTFLoader().load(
  '/models/pin.glb',
  (gltf) => {
    pinTemplate = gltf.scene;
    pinTemplate.traverse((node) => {
      if (node.isMesh) {
        const oldMat = node.material;
        node.material = new THREE.MeshPhongMaterial({
          map: oldMat.map || null,
          color: oldMat.color || new THREE.Color(0xffffff),
          shininess: 100,
          specular: 0xdddddd
        });
        node.castShadow    = true;
        node.receiveShadow = true;
      }
    });
    pinTemplate.scale.set(0.2, 0.2, 0.2);
    init(start, update);
  },
  undefined,
  (err) => console.error(err)
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

  // --- 10th frame special handling ---
  if (currentFrame === 10) {
    if (currentRoll === 2) {
      // After first roll, if not strike, hide knocked-down pins for second roll
      // (handled in commitRoll, but ensure here too for safety)
      for (let i = 0; i < standingPins.length; i++) {
        if (!standingPins[i]) {
          pinMeshes[i].o3d.visible = false;
        }
      }
    }
    // After strike or spare, pins are reset in commitRoll
  } else {
    // Hide knocked-down pins ONLY if it's the second roll of a frame (not after strike/new frame)
    if (currentRoll === 2 && currentFrame <= 10) {
      for (let i = 0; i < standingPins.length; i++) {
        if (!standingPins[i]) {
          pinMeshes[i].o3d.visible = false;
        }
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

let aimOffsetSeed = Math.random() * 10000;
const AIM_FREQUENCY = 0.005;
const AIM_AMPLITUDE = 0.042;

function onMouseUp(e) {
  if (!mouseDown) return;
  mouseDown = false;
  hideArrow();
  if (hasLaunched || gameOver) return;

  const from = dragStart;
  const to = dragEnd;
  const dragVec = new THREE.Vector3().subVectors(from, to);
  if (dragVec.length() < 0.2 || dragVec.z >= 0) return;

  // Compute base direction
  let dir = dragVec.clone().normalize();
  dir.y = 0;
  dir.normalize();

  // Apply time-varying sine-wave offset along X:
  const t = performance.now() * AIM_FREQUENCY + aimOffsetSeed;
  const wobble = Math.sin(t) * AIM_AMPLITUDE;
  dir.x += wobble;
  dir.normalize();

  const maxForce = 180;
  const minForce = 50;
  let force = THREE.MathUtils.clamp(dragVec.length() * 80, minForce, maxForce);

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
  if (dragVec.z >= 0) {
    arrowHelper.visible = false;
    return;
  }
  arrowHelper.visible = true;
  const ballPos = ballMesh.position();
  arrowHelper.position.copy(ballPos);

  let dir = dragVec.clone().normalize();
  dir.y = 0;
  dir.normalize();

  // apply the same time-varying sine‐wave offset
  const t = performance.now() * AIM_FREQUENCY + aimOffsetSeed;
  const wobble = Math.sin(t) * AIM_AMPLITUDE;
  dir.x += wobble;
  dir.normalize();

  arrowHelper.setDirection(dir);

  let len = THREE.MathUtils.clamp(dragVec.length(), 0.7, 4.0);
  arrowHelper.setLength(len, 0.7, 0.4);
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

// Add strike/spare message UI (centered, with black background)
const fxMessage = document.createElement('div');
fxMessage.id = 'fx-message';
Object.assign(fxMessage.style, {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  fontFamily: "'Press Start 2P', sans-serif",
  color: '#ff00ff',
  fontSize: '64px',
  textShadow: '0 0 16px #ff00ff, 0 0 32px #ff00ff',
  zIndex: 1002,
  pointerEvents: 'none',
  opacity: 0,
  transition: 'opacity 0.3s',
  background: 'rgba(0,0,0,0.85)',
  padding: '32px 64px',
  borderRadius: '18px',
  border: '2px solid #ff00ff',
  boxSizing: 'border-box'
});
document.body.appendChild(fxMessage);

function showFxMessage(text) {
  fxMessage.innerText = text;
  fxMessage.style.opacity = 1;
  setTimeout(() => {
    fxMessage.style.opacity = 0;
  }, 1200);
}

// --- High Score Logic ---
function getMode() {
  // Use window.bowleroMode if set (from game.html), otherwise default to 'easy'
  return (window.bowleroMode === 'hard') ? 'hard' : 'easy';
}
function getHighScores() {
  let hs = { easy: 0, hard: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem('bowleroHighScores'));
    if (saved && typeof saved.easy === 'number' && typeof saved.hard === 'number') {
      hs = saved;
    }
  } catch {}
  return hs;
}
function setHighScore(mode, score) {
  let hs = getHighScores();
  if (score > hs[mode]) {
    hs[mode] = score;
    localStorage.setItem('bowleroHighScores', JSON.stringify(hs));
  }
}
function getCurrentHighScore() {
  return getHighScores()[getMode()];
}

// --- Record Score UI (always visible) ---
const recordScoreDiv = document.createElement('div');
recordScoreDiv.id = 'record-score';
Object.assign(recordScoreDiv.style, {
  position: 'absolute',
  top: '1%',
  right: '2%', // <-- move to top right
  fontFamily: "'Press Start 2P', sans-serif",
  color: '#ff00ff',
  fontSize: '18px',
  background: 'rgba(0,0,0,0.7)',
  padding: '10px 18px',
  borderRadius: '10px',
  border: '2px solid #ff00ff',
  zIndex: 1003,
  textShadow: '0 0 6px #ff00ff'
});
document.body.appendChild(recordScoreDiv);
function updateRecordScoreUI() {
  recordScoreDiv.innerHTML = `RECORD: <span style="color:#fff">${getCurrentHighScore()}</span>`;
}
updateRecordScoreUI();

// --- End Game Popup ---
const endPopup = document.createElement('div');
endPopup.id = 'end-popup';
Object.assign(endPopup.style, {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  fontFamily: "'Press Start 2P', sans-serif",
  color: '#ff00ff',
  fontSize: '32px',
  background: 'rgba(0,0,0,0.95)',
  padding: '48px 64px',
  borderRadius: '20px',
  border: '2px solid #ff00ff',
  zIndex: 2001,
  textAlign: 'center',
  display: 'none',
  boxShadow: '0 0 32px #ff00ff'
});
endPopup.innerHTML = `
  <div id="end-score" style="font-size:40px; margin-bottom:18px;"></div>
  <div id="end-record" style="font-size:22px; margin-bottom:32px;"></div>
  <button id="replay-btn" style="
    font-family: 'Press Start 2P', sans-serif;
    font-size: 22px;
    color: #fff;
    background: #222;
    border: 2px solid #ff00ff;
    border-radius: 12px;
    padding: 18px 48px;
    cursor: pointer;
    text-shadow: 0 0 6px #ff00ff;
    transition: background 0.2s;
  ">REPLAY</button>
`;
document.body.appendChild(endPopup);

function showEndPopup(finalScore, recordScore) {
  document.getElementById('end-score').innerHTML = `Your Score: <span style="color:#fff">${finalScore}</span>`;
  document.getElementById('end-record').innerHTML = `All-Time Best: <span style="color:#fff">${recordScore}</span>`;
  endPopup.style.display = 'block';
}
function hideEndPopup() {
  endPopup.style.display = 'none';
}
document.getElementById('replay-btn').onclick = () => {
  hideEndPopup();
  resetGame();
};

// --- Game Reset Logic ---
function resetGame() {
  // Remove all pins and meshes
  for (let i = 0; i < pinMeshes.length; i++) {
    if (pinMeshes[i] && pinMeshes[i].o3d && pinMeshes[i].o3d.parent) {
      pinMeshes[i].o3d.parent.remove(pinMeshes[i].o3d);
    }
  }
  pinBodies.length = 0;
  pinMeshes.length = 0;
  pinOriginalPositions.length = 0;
  standingPins.length = 0;
  scoredPins.clear();
  // Reset score and state
  score.reset && score.reset();
  currentFrame = 1;
  currentRoll = 1;
  pinsThisRoll = 0;
  hasLaunched = false;
  rollCommitted = false;
  gameOver = false;
  launchTime = null;
  autoResetPending = false;
  // Remove ball mesh if present
  if (ballMesh && ballMesh.o3d && ballMesh.o3d.parent) {
    ballMesh.o3d.parent.remove(ballMesh.o3d);
  }
  ballMesh = null;
  ballBody = null;
  // Remove any arrows
  hideArrow();
  // Remove fx message if visible
  if (fxMessage) fxMessage.style.opacity = 0;
  // Recreate everything
  start();
  updateRecordScoreUI();
}