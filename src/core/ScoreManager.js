// import pins/collision detection to keep track of score

export class ScoreManager {
    constructor() {
        this.reset();

    }

    reset() {
        this.frames = [];
        this.currentFrameIndex = 0;
        this.bonusRolls = [];
    }
}