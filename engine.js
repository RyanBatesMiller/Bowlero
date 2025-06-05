// engine.js
// NOTE: this uses a Unity‐like Transform system for camera and objects
import * as THREE from 'three';

// core objects (filled in init)
let scene, camera, renderer;

const DEG2RAD = Math.PI / 180;

// input state
const keyStates     = {};
const keyDownStates = {};

// time tracking for deltaTime
let deltaTime = 0;
let lastTime  = performance.now();

// coroutine scheduler
const coroutines = [];

export class Transform {
  constructor(o3d) {
    this.o3d = o3d;
  }

  position() {
    return this.o3d.position.clone();
  }

  rotation() {
    const e = this.o3d.rotation;
    return new THREE.Vector3(
      e.x * 180 / Math.PI,
      e.y * 180 / Math.PI,
      e.z * 180 / Math.PI
    );
  }

  lookAt(o) {
    this.o3d.lookAt(o.x, o.y, o.z);
  }

  translate(o) {
    this.o3d.translateX(o.x);
    this.o3d.translateY(o.y);
    this.o3d.translateZ(o.z);
  }

  translateWorld(o) {
    this.o3d.position.add(o.clone());
  }

  setPosition(p) {
    this.o3d.position.set(p.x, p.y, p.z);
  }

  rotate(e) {
    this.o3d.rotateX(e.x * DEG2RAD);
    this.o3d.rotateY(e.y * DEG2RAD);
    this.o3d.rotateZ(e.z * DEG2RAD);
  }

  setRotation(e) {
    this.o3d.rotation.set(
      e.x * DEG2RAD,
      e.y * DEG2RAD,
      e.z * DEG2RAD
    );
  }

  setParent(parentTransform) {
    const parent = parentTransform instanceof Transform
      ? parentTransform.o3d
      : parentTransform;

    this.o3d.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);

    const worldPos   = new THREE.Vector3();
    const worldQuat  = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    this.o3d.matrixWorld.decompose(worldPos, worldQuat, worldScale);

    parent.add(this.o3d);

    const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const localMat  = new THREE.Matrix4().multiplyMatrices(parentInv, this.o3d.matrixWorld);

    const locPos   = new THREE.Vector3();
    const locQuat  = new THREE.Quaternion();
    const locScale = new THREE.Vector3();
    localMat.decompose(locPos, locQuat, locScale);

    this.o3d.position.copy(locPos);
    this.o3d.quaternion.copy(locQuat);
    this.o3d.scale.copy(locScale);
  }
}

// input polling
export function getKey(k) {
  return !!keyStates[k];
}

export function getKeyDown(k) {
  if (keyDownStates[k]) {
    keyDownStates[k] = false;
    return true;
  }
  return false;
}

window.addEventListener('keydown', e => {
  if (!keyStates[e.key]) keyDownStates[e.key] = true;
  keyStates[e.key] = true;
});

window.addEventListener('keyup', e => {
  keyStates[e.key] = false;
});

// camera helper
export function getCamera() {
  return new Transform(camera);
}

// spawners
export function spawnCube(pos, rot, scl, color = 0x00ff00) {
  const geo = new THREE.BoxGeometry(scl.x, scl.y, scl.z);
  const mat = new THREE.MeshPhongMaterial({ color });
  const m   = new THREE.Mesh(geo, mat);
  m.position.set(pos.x, pos.y, pos.z);
  m.rotation.set(rot.x * DEG2RAD, rot.y * DEG2RAD, rot.z * DEG2RAD);
  scene.add(m);

  m.castShadow    = true;
  m.receiveShadow = true;

  return new Transform(m);
}

export function spawnSphere(pos, rot, scl, color = 0xff0000) {
  const geo = new THREE.SphereGeometry(1, 16, 16);
  const mat = new THREE.MeshPhongMaterial({ color });
  const m   = new THREE.Mesh(geo, mat);
  m.position.set(pos.x, pos.y, pos.z);
  m.rotation.set(rot.x * DEG2RAD, rot.y * DEG2RAD, rot.z * DEG2RAD);
  m.scale.set(scl.x, scl.y, scl.z);
  scene.add(m);

  m.castShadow    = true;
  m.receiveShadow = true;

  return new Transform(m);
}

export function destroy(obj) {
  const target = obj instanceof Transform ? obj.o3d : obj;
  if (!target) return;
  scene.remove(target);
  target.traverse(node => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach(m => m.dispose());
      } else {
        node.material.dispose();
      }
    }
  });
}

export function Vector3(x = 0, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}

export function getDeltaTime() {
  return deltaTime;
}

// start a coroutine: pass a generator function or iterator
export function startCoroutine(genFunc, ...args) {
  const iterator = (typeof genFunc === 'function' && genFunc.constructor.name === 'GeneratorFunction')
    ? genFunc(...args)
    : genFunc;
  coroutines.push({ iterator, wait: 0 });
}

export function getScene() {
  return scene;
}

// engine init & loop
export function init(startCallback, updateCallback) {
  // 1) Create the Scene
  scene = new THREE.Scene();

  // ========================================================================
  // <--- RETRO BACKGROUND: assign "retro-bowling-ball-and-pins.jpg" to scene.background --->
  // ========================================================================
  const loader = new THREE.TextureLoader();
  loader.setPath('/textures/');

  const retroBgTexture = loader.load(
    'retro-bowling-ball-and-pins.jpg',
    (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4, 2);
      texture.encoding = THREE.sRGBEncoding;
      scene.background = texture;
    },
    undefined,
    (err) => {
      console.error('Failed to load retro background:', err);
    }
  );




  // 2) Create the Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  // Position camera for good view of the lane
  camera.position.set(0, 0, 8); 
  camera.lookAt(0, 0.5, -8);

  // 3) Create and configure the Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  window.renderer = renderer;

  const ambient = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambient);

  const dl = new THREE.DirectionalLight(0xffffcc, 1.8);

  const horizDist = 8;
  const xOffset = Math.sin(Math.PI / 6) * horizDist;
  const zOffset = horizDist;
  dl.position.set(xOffset, 5, zOffset);
  dl.castShadow = true;

  dl.shadow.camera.near   = 0.1;
  dl.shadow.camera.far    = 50;
  dl.shadow.camera.left   = -15;
  dl.shadow.camera.right  = 15;
  dl.shadow.camera.top    = 25;
  dl.shadow.camera.bottom = -25;
  dl.shadow.mapSize.width  = 4096;
  dl.shadow.mapSize.height = 4096;

  // Aim at the pins around z = –12:
  dl.target.position.set(0, 0, -12);
  scene.add(dl.target);
  scene.add(dl);

  const sideLight = new THREE.DirectionalLight(0xffffff, 1);

  const sideX = -Math.sin(Math.PI / 6) * horizDist;
  const sideZ = horizDist;
  sideLight.position.set(sideX, 5, sideZ);

  sideLight.target.position.set(0, 0, -12);
  scene.add(sideLight.target);
  scene.add(sideLight);

  // 5) Call the user‐provided "start" callback
  startCallback();

  // 6) Animate loop
  (function animate(time) {
    requestAnimationFrame(animate);
    const now = time || performance.now();
    deltaTime  = Math.min((now - lastTime) / 1000, 1 / 60);
    lastTime   = now;

    // advance coroutines
    for (let i = coroutines.length - 1; i >= 0; i--) {
      const c = coroutines[i];
      if (c.wait > 0) {
        c.wait--;
        continue;
      }
      const { value, done } = c.iterator.next();
      if (done) {
        coroutines.splice(i, 1);
      } else if (typeof value === 'number') {
        c.wait = value;
      } else {
        c.wait = 1;
      }
    }

    updateCallback();
    renderer.render(scene, camera);
  })();
}