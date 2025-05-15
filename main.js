// main.js
import { init, getCamera, spawnCube, 
    spawnSphere, getKey, getKeyDown,
    getDeltaTime, destroy, Vector3, startCoroutine } from './engine.js';

//Transform: translate(Vector3), translateWorld, setPosition, rotate, setRotation, lookAt
//NOTE: rotation y = 0 faces towards -z direction

let ball = null;
let camera = null;
let pin = null;

function start() {

    //******* platform scenery *******

    //base
    spawnCube(
        Vector3(0, -0.5, -5),
        Vector3(0, 0, 0),
        Vector3(5, .75, 20),
        0xfac75a
    );

    pin = spawnCube(
        Vector3(0, 0.2, -5),
        Vector3(0, 0, 0),
        Vector3(0.5, 1, 0.5),
        0xFFFFFF
    );

    //******* platform end *******

    camera = getCamera();

    camera.setPosition(Vector3(0, 3, 7))
    camera.setRotation(Vector3(0, 0, 0))

    //bowling ball!
    ball = spawnSphere(
      Vector3(0, 0.25, 3),
      Vector3(0, 0, 0),
      Vector3(0.42, 0.42, 0.42),
      0x7777FF
    );

    //little dots on ball
    let dot1 = spawnSphere(
        Vector3(0, .6, 3.1),
          Vector3(0, 0, 0),
          Vector3(0.1, 0.1, 0.1),
          0xAAAAFF
    );
    dot1.setParent(ball);

    let dot2 = spawnSphere(
        Vector3(-0.15, .39, 3.3),
          Vector3(0, 0, 0),
          Vector3(0.1, 0.1, 0.1),
          0xAAAAFF
    );
    dot2.setParent(ball);

    let dot3 = spawnSphere(
        Vector3(0.15, .39, 3.3),
          Vector3(0, 0, 0),
          Vector3(0.1, 0.1, 0.1),
          0xAAAAFF
    );
    dot3.setParent(ball);

    ball.translateWorld(Vector3(0,0,0.5));

    camera.lookAt(ball.position())
}

let pinHit = false;
function* ejectPin(obj) {
    let time = 1.5;
    for (let i = 0; i < time; i += getDeltaTime()) {
        let speed = time - i;
        pin.translateWorld(Vector3(
            -speed * getDeltaTime(), 0, 
            -speed * getDeltaTime() * 2));
        pin.rotate(Vector3(
            getDeltaTime() * -speed * 75, 0, 0
        ));
        yield 0;
    }
}

//NOTE: this is a "coroutine" from unity; invoke with startCoroutine(func())
function* rollBall(obj) {
    let time = 2;
    for (let i = 0; i < time; i += getDeltaTime()) {
        let speed = time - i;
        obj.translateWorld(Vector3(0, 0, getDeltaTime() * speed * -8));
        obj.rotate(Vector3(getDeltaTime() * speed * -1000, 0, 0));

        if (ball.position().z < pin.position().z + 0.1 && !pinHit) {
            pinHit = true;
            startCoroutine(ejectPin(pin));
        }
        yield 0;
    }
}

function update() {
    let deltaTime = getDeltaTime();

    if (getKeyDown('ArrowUp'))  {
        startCoroutine(rollBall(ball));
    }

    if (getKey('ArrowDown')) {
        ball.translateWorld(Vector3(0, 0, deltaTime * 4));
        ball.rotate(Vector3(deltaTime * 1000, 0, 0));
    }

    camera.lookAt(ball.position());
}

init(start, update);