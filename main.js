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

import * as CANNON from 'cannon-es';
import { ScoreManager } from './ScoreManager.js';

//models
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let pinTemplate = null;    // will hold the loaded Blender pin model

const uiContainer = document.createElement('div');
Object.assign(uiContainer.style, {
  position: 'absolute',
  top: '5%',               // vertically center
  left: '50%',              // horizontally center
  transform: 'translate(-50%, -50%)',
  backgroundColor: 'rgba(30, 30, 30, 0.8)',  // dark semi‑transparent box
  padding: '16px 24px',
  borderRadius: '12px',
  textAlign: 'center',
  color: '#FF8856',
  fontFamily: 'Arial, sans-serif',
  zIndex: 10,
  pointerEvents: 'none'
});

const titleElem = document.createElement('h1');
titleElem.innerText = 'Bowlero';
titleElem.style.fontSize = '36px';
titleElem.style.margin = '0 0 8px 0';
uiContainer.appendChild(titleElem);

const scoreElem = document.createElement('div');
scoreElem.innerText = 'Score: ';
scoreElem.style.fontSize = '28px';
scoreElem.style.margin = '0';
uiContainer.appendChild(scoreElem);

document.body.appendChild(uiContainer);

let score = new ScoreManager;
let world;
let ballBody;
let ballMesh;
const pinBodies = [];
const pinMeshes = [];
let camera;
let hasLaunched = false;
const scoredPins = new Set();
const pinOriginalPositions = [];

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
  const margin = 0.02;  // small gap so it doesn’t intersect floor

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
  const startZ = -4;          // apex row position
  const rowSpacing = 1.2;     // spacing between rows
  const xSpacing = 1.2;       // spacing between pins

  rows.forEach((count, r) => {
    const z = startZ - r * rowSpacing;
    const offset = ((count - 1) * xSpacing) / 2;
    for (let i = 0; i < count; i++) {
      const x = (i * xSpacing) - offset;
      spawnPin(Vector3(x, 0, z), pinMaterial); // Pass position with y=0, adjusted in spawnPin
    }
  });
}

// Setup scene, physics, and camera
function start() {

  const { pinMaterial, ballMaterial } = createPhysics();

  // Lane surface

  // 1) load the texture
  const texLoader = new THREE.TextureLoader();
  const laneTex = texLoader.load('textures/bowling.jpg', tex => {
  // once loaded, tell it to repeat
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // tile 4 times along X, 10 times along Y (adjust to taste)
  tex.repeat.set(4, 10);
  tex.encoding = THREE.sRGBEncoding;  // optional, for correct colors
});

  // 2) optionally repeat it
  laneTex.wrapS = laneTex.wrapT = THREE.RepeatWrapping;
  laneTex.repeat.set(4, 4);               // adjust to taste
  laneTex.encoding = THREE.sRGBEncoding;  // if you want correct color

  // 3) make a material & mesh
  const laneMat = new THREE.MeshPhongMaterial({ map: laneTex });
  const laneGeo = new THREE.PlaneGeometry( 10, 40 );  // same size as your cube
  const laneMesh = new THREE.Mesh(laneGeo, laneMat);

  // 4) rotate so it’s flat on the XZ-plane
  laneMesh.rotation.x = -Math.PI/2;
  laneMesh.position.set(0, 0, -5);    // match your old cube’s center
  laneMesh.receiveShadow = true;

  // 5) add to the scene
  getScene().add(laneMesh);

  // Pins
  spawnAllPins(pinMaterial);

  // Camera
  camera = getCamera();
  camera.setPosition(Vector3(0, 3, 7));
  camera.setRotation(Vector3(0, 0, 0));

  // Ball mesh
  ballMesh = spawnSphere(
    Vector3(0, 0.25, 3),
    Vector3(0, 0, 0),
    Vector3(0.42, 0.42, 0.42),
    0x7777FF
  );

  // Ball physics body
  const ballShape = new CANNON.Sphere(0.42);
  ballBody = new CANNON.Body({ mass: 5.9, material: ballMaterial }); // 13 lbs
  ballBody.addShape(ballShape);
  ballBody.position.set(0, 0.42, 3);
  ballBody.linearDamping = 0.05;
  world.addBody(ballBody);

  hasLaunched = false;

}

function reset() {
  for (const body of world.bodies) {
    if (body.mass > 0) {
      world.removeBody(body);
    }
  }
  world.removeBody(ballBody);
  ballBody = null;
  ballMesh = null;
  pinBodies.length = 0; 
  scoredPins.clear();
  start();
}


// Main loop: physics step, sync meshes, input handling
function update() {
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
  pinBodies.forEach((pinBody, idx) => {
    if (scoredPins.has(idx)) return;
    const orig = pinOriginalPositions[idx];
    const cur  = pinBody.position;
    const dist = Math.hypot(
      cur.x - orig.x,
      cur.y - orig.y,
      cur.z - orig.z
    );
    if (dist > 0.4) {
      scoredPins.add(idx);
      score.add(1);
      scoreElem.innerText = `Score: ${score.getScore()}`;
    }
  });

  if (getKeyDown('ArrowUp') && !hasLaunched) {
    hasLaunched = true;
    ballBody.applyLocalImpulse(
      new CANNON.Vec3(0, 0, -150),
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