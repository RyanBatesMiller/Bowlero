import { ScoreManager } from './ScoreManager.js'
// other imports as necessary

export class Game {
    constructor(scene, camera, renderer, UI) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        this.UI = UI;
        this.scoreManager = new ScoreManager();
        this.state = null;
        
    }
}