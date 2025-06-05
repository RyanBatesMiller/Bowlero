export class ScoreManager {
  constructor() {
    this.rolls = [];
  }

  reset() {
    this.rolls = [];
  }

  roll(pins) {
    this.rolls.push(pins);
  }

  getScore() {
    return this.getFrameScores().reduce((sum, s) => sum + s, 0);
  }

  getFrameScores() {
    const scores = [];
    let frameIndex = 0;

    for (let frame = 0; frame < 10 && frameIndex < this.rolls.length; frame++) {
      const roll1 = this.rolls[frameIndex];
      const roll2 = this.rolls[frameIndex + 1];
      const roll3 = this.rolls[frameIndex + 2];

      if (roll1 === 10) {
        // Strike
        if (roll2 !== undefined && roll3 !== undefined) {
          scores.push(10 + roll2 + roll3);
        } else {
          scores.push(null); // waiting for bonus rolls
        }
        frameIndex += 1;
      } else if ((roll1 || 0) + (roll2 || 0) === 10) {
        // Spare
        if (roll3 !== undefined) {
          scores.push(10 + roll3);
        } else {
          scores.push(null); // waiting for next roll
        }
        frameIndex += 2;
      } else {
        // Open frame
        if (roll2 !== undefined) {
          scores.push(roll1 + roll2);
        } else {
          scores.push(null); // waiting for second roll
        }
        frameIndex += 2;
      }
    }

    return scores;
  }
}
