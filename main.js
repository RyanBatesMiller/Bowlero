import { init, getCamera, spawnCube, spawnSphere, getKeyDown, getDeltaTime, Vector3 } from './engine.js';
import * as CANNON from 'cannon-es';
import { ScoreManager } from './ScoreManager.js';

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

// Spawn a single pin at a given position
function spawnPin(position, pinMaterial) {
  // Visual: single tall cube for body + small sphere for head
  const body = spawnCube(
    Vector3(position.x, 0.75, position.z), // Center the visual at (x, 0.75, z)
    Vector3(0, 0, 0),
    Vector3(0.3, 1.5, 0.3),
    0xFFFFFF
  );
  const head = spawnSphere(
    Vector3(position.x, 1.5, position.z),
    Vector3(0, 0, 0),
    Vector3(0.15, 0.15, 0.15),
    0xFFFFFF
  );
  head.setParent(body);

  // Red band
  const band = spawnCube(
    Vector3(position.x, 1.1, position.z),
    Vector3(0, 0, 0),
    Vector3(0.32, 0.05, 0.32),
    0xFF0000

  );
  band.setParent(body);

  // Physics: single cylinder centered at (x, 0.75, z)
  const pinBody = new CANNON.Body({ mass: 1.54, material: pinMaterial }); // 3.4 lbs
  const cyl = new CANNON.Cylinder(0.15, 0.15, 1.5, 16);
  
  pinBody.addShape(cyl, new CANNON.Vec3(0, 0, 0)); // No offset, centered at body position
  pinBody.position.set(position.x, 0.75, position.z); // Set body position to (x, 0.75, z)
  pinBody.linearDamping = 0.3;
  world.addBody(pinBody);

  pinMeshes.push(body);
  pinBodies.push(pinBody);
  pinOriginalPositions.push(pinBody.position.clone());
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
  spawnCube(
    Vector3(0, -0.5, -5),
    Vector3(0, 0, 0),
    Vector3(5, 0.75, 20),
    0xfac75a
  );

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
  ballBody.position.set(0, 0.25, 3);
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
  world.step(1 / 120, dt, 10); // Use fixed time step for better accuracy

  // Sync ball mesh
  const b = ballBody.position;
  ballMesh.translateWorld(
    Vector3(b.x - ballMesh.position().x,
            b.y - ballMesh.position().y,
            b.z - ballMesh.position().z)
  );

  // Sync pin meshes
  for (let i = 0; i < pinBodies.length; i++) {
    const pb = pinBodies[i].position;
    const pm = pinMeshes[i];
    pm.translateWorld(
      Vector3(pb.x - pm.position().x,
              pb.y - pm.position().y,
              pb.z - pm.position().z)
    );
  }

  pinBodies.forEach((pinBody, idx) => {
    if (scoredPins.has(idx)) return;

    const original = pinOriginalPositions[idx];
    const current  = pinBody.position;

    const dx = current.x - original.x;
    const dy = current.y - original.y;
    const dz = current.z - original.z;
    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

    // if it’s moved more than 0.4 units from spawn
    if (distance > 0.4) {
      scoredPins.add(idx);
      score.add(1);
      scoreElem.innerText = `Score: ${score.getScore()}`;
    }
  });

  /*
  if (getKeyDown('r')) {
    reset();
  }
  */

  if (getKeyDown('ArrowUp') && !hasLaunched) {
    hasLaunched = true;
    ballBody.applyLocalImpulse(
      new CANNON.Vec3(0, 0, -150),
      new CANNON.Vec3(0, 0, 0)
    );
  }

  camera.lookAt(ballMesh.position());
  
}

init(start, update);