// import pins/collision detection to keep track of score

export class ScoreManager {
  constructor() {
    this.score = 0;
  }

  reset() {
    this.score = 0;
  }

  add(points = 1) {
    this.score += points;
  }

  getScore() {
    return this.score;
  }
}
