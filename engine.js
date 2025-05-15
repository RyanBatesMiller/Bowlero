// engine.js
// NOTE: this uses a Unity-like Transform system for camera and objects

import * as THREE from 'three';

// core objects (filled in init)
let scene, camera, renderer;


// input state
const keyStates     = {};
const keyDownStates = {};

// time tracking for deltaTime
let deltaTime = 0;
let lastTime = performance.now();

// coroutine scheduler
const coroutines = [];

export class Transform {
    constructor(o3d) { this.o3d = o3d; }

    position() {
        // returns world position as a THREE.Vector3
        return this.o3d.position.clone();
    }
    rotation() {
        // returns rotation in degrees as a THREE.Vector3
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

    // local-space translate respecting object rotation
    translate(o) {
        this.o3d.translateX(o.x);
        this.o3d.translateY(o.y);
        this.o3d.translateZ(o.z);
    }

    // world-space translate
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
        // unwrap Transform or accept raw Object3D
        const parent = parentTransform instanceof Transform
            ? parentTransform.o3d
            : parentTransform;

        // ensure world matrices are current
        this.o3d.updateMatrixWorld(true);
        parent.updateMatrixWorld(true);

        // extract world transform
        const worldPos   = new THREE.Vector3();
        const worldQuat  = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        this.o3d.matrixWorld.decompose(worldPos, worldQuat, worldScale);

        // attach to new parent
        parent.add(this.o3d);

        // compute local from world: local = parent^-1 * world
        const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
        const localMat = new THREE.Matrix4().multiplyMatrices(parentInv, this.o3d.matrixWorld);
        const locPos   = new THREE.Vector3();
        const locQuat  = new THREE.Quaternion();
        const locScale = new THREE.Vector3();
        localMat.decompose(locPos, locQuat, locScale);

        // apply local transform so world stays the same
        this.o3d.position.copy(locPos);
        this.o3d.quaternion.copy(locQuat);
        this.o3d.scale.copy(locScale);
    }
}

// input polling
export function getKey(k) { return !!keyStates[k]; }
export function getKeyDown(k) {
    if (keyDownStates[k]) { keyDownStates[k] = false; return true; }
    return false;
}
window.addEventListener('keydown', e => {
    if (!keyStates[e.key]) keyDownStates[e.key] = true;
    keyStates[e.key] = true;
});
window.addEventListener('keyup', e => { keyStates[e.key] = false; });

// camera helper
export function getCamera() { return new Transform(camera); }

// spawners
export function spawnCube(pos, rot, scl, color = 0x00ff00) {
    const geo = new THREE.BoxGeometry(scl.x, scl.y, scl.z);
    const mat = new THREE.MeshPhongMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
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
    const m = new THREE.Mesh(geo, mat);
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
            if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
            else node.material.dispose();
        }
    });
}

export function Vector3(x = 0, y = 0, z = 0) { return new THREE.Vector3(x, y, z); }
export function getDeltaTime() { return deltaTime; }

// start a coroutine: pass a generator function or iterator
export function startCoroutine(genFunc, ...args) {
    // obtain iterator
    const iterator = (typeof genFunc === 'function' && genFunc.constructor.name === 'GeneratorFunction')
        ? genFunc(...args)
        : genFunc;
    coroutines.push({ iterator, wait: 0 });
}

// engine init & loop
export function init(startCallback, updateCallback) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xFFFFFF));
    const dl = new THREE.DirectionalLight(0xffffff, 1.5);
    dl.position.set(5, 5, 5);
    dl.castShadow = true;
    dl.shadow.camera.near = 0.01;
    dl.shadow.camera.far  = 50;
    dl.shadow.camera.left   = -100;
    dl.shadow.camera.right  =  100;
    dl.shadow.camera.top    =  100;
    dl.shadow.camera.bottom = -100;
    dl.shadow.mapSize.width  = 4096;
    dl.shadow.mapSize.height = 4096;

    scene.add( dl.target );
    scene.add(dl);

    startCallback();

    (function animate(time) {
        requestAnimationFrame(animate);
        const now = time || performance.now();
        deltaTime = Math.min((now - lastTime) / 1000, 1 / 60);
        lastTime = now;

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
                // default: wait one frame
                c.wait = 1;
            }
        }

        updateCallback();
        renderer.render(scene, camera);
    })();
}

// Example coroutine in main.js:
// function* blinkCube(cube) {
//   while (true) {
//     cube.o3d.visible = !cube.o3d.visible;
//     yield 30; // wait 30 frames
//   }
// }
// startCoroutine(blinkCube, playerCube);
