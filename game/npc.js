const { 
    GAME_WIDTH, 
    GAME_HEIGHT, 
    PLAYER_SIZE, 
    BULLET_SPEED,
    DIFFICULTY_LEVELS
} = require('./constants');

class NPC {
    constructor(difficulty) {
        this.difficulty = difficulty;
        this.target = null;
        this.currentSpeed = 0;
        this.maxSpeed = this.getSpeedByDifficulty();
        this.acceleration = 0.3;
        this.reactionTime = this.getReactionTime();
        this.state = 'WANDER';
        this.lastActionTime = 0;
        this.safeDirection = { x: 0, y: 0 };
        this.bulletDangerCache = new Map();
    }

    getSpeedByDifficulty() {
        return {
            [DIFFICULTY_LEVELS.EASY]: 3,
            [DIFFICULTY_LEVELS.MEDIUM]: 4.5,
            [DIFFICULTY_LEVELS.HARD]: 6
        }[this.difficulty];
    }

    getReactionTime() {
        return {
            [DIFFICULTY_LEVELS.EASY]: 400,
            [DIFFICULTY_LEVELS.MEDIUM]: 250,
            [DIFFICULTY_LEVELS.HARD]: 150
        }[this.difficulty];
    }

    findMostDangerousBullet(gameState, npc) {
        const now = Date.now();
        let mostDangerous = null;
        let highestDanger = 0;

        gameState.bullets.forEach(bullet => {
            if (now - this.bulletDangerCache.get(bullet.id)?.time < 100) {
                const cached = this.bulletDangerCache.get(bullet.id);
                if (cached.danger > highestDanger) {
                    mostDangerous = bullet;
                    highestDanger = cached.danger;
                }
                return;
            }

            const futureX = bullet.x + bullet.vx * 30;
            const futureY = bullet.y + bullet.vy * 30;
            
            const toNPC = Math.hypot(futureX - npc.x, futureY - npc.y);
            const bulletSpeed = Math.hypot(bullet.vx, bullet.vy);
            const timeToHit = toNPC / (bulletSpeed + 0.1);
            
            const distanceToTrajectory = this.distanceToLine(
                npc.x, npc.y,
                bullet.x, bullet.y,
                futureX, futureY
            );

            const danger = (1 / (timeToHit + 0.1)) * (1 / (distanceToTrajectory + 5));

            this.bulletDangerCache.set(bullet.id, { time: now, danger });

            if (timeToHit < 1.5 && distanceToTrajectory < 50 && danger > highestDanger) {
                mostDangerous = bullet;
                highestDanger = danger;
            }
        });

        return mostDangerous;
    }

    distanceToLine(x0, y0, x1, y1, x2, y2) {
        const numerator = Math.abs((y2 - y1)*x0 - (x2 - x1)*y0 + x2*y1 - y2*x1);
        const denominator = Math.hypot(y2 - y1, x2 - x1);
        return numerator / (denominator + 0.1);
    }

    calculateEscapeVector(npc, bullet) {
        const predictionSteps = {
            [DIFFICULTY_LEVELS.EASY]: 20,
            [DIFFICULTY_LEVELS.MEDIUM]: 30,
            [DIFFICULTY_LEVELS.HARD]: 1
        }[this.difficulty];

        const bulletFutureX = bullet.x + bullet.vx * predictionSteps;
        const bulletFutureY = bullet.y + bullet.vy * predictionSteps;

        const toBulletFuture = {
            x: bulletFutureX - npc.x,
            y: bulletFutureY - npc.y
        };

        const perpendicular1 = { x: -toBulletFuture.y, y: toBulletFuture.x };
        const perpendicular2 = { x: toBulletFuture.y, y: -toBulletFuture.x };

        const length = Math.hypot(perpendicular1.x, perpendicular1.y);
        const escape1 = {
            x: perpendicular1.x / length * this.maxSpeed,
            y: perpendicular1.y / length * this.maxSpeed
        };
        const escape2 = {
            x: perpendicular2.x / length * this.maxSpeed,
            y: perpendicular2.y / length * this.maxSpeed
        };

        const center = { x: GAME_WIDTH/2, y: GAME_HEIGHT/2 };
        const dot1 = (escape1.x * (npc.x - center.x) + escape1.y * (npc.y - center.y));
        const dot2 = (escape2.x * (npc.x - center.x) + escape2.y * (npc.y - center.y));

        return dot1 > dot2 ? escape1 : escape2;
    }

    updateMovement(npc, targetX, targetY, deltaTime = 16/1000) {
        const dx = targetX - npc.x;
        const dy = targetY - npc.y;
        const distance = Math.hypot(dx, dy);

        this.currentSpeed = this.maxSpeed;

        if (distance > 10) {
            const dirX = dx / distance;
            const dirY = dy / distance;
            npc.x += dirX * this.currentSpeed * deltaTime * 60;
            npc.y += dirY * this.currentSpeed * deltaTime * 60;
        }

        const margin = PLAYER_SIZE;
        if (npc.x < margin) npc.x += this.maxSpeed * deltaTime * 60;
        if (npc.x > GAME_WIDTH - margin) npc.x -= this.maxSpeed * deltaTime * 60;
        if (npc.y < margin) npc.y += this.maxSpeed * deltaTime * 60;
        if (npc.y > GAME_HEIGHT - margin) npc.y -= this.maxSpeed * deltaTime * 60;
    }

    update(npc, gameState, deltaTime = 16/1000) {
        const now = Date.now();
        const dangerBullet = this.findMostDangerousBullet(gameState, npc);

        if (dangerBullet && now - this.lastActionTime > this.reactionTime) {
            this.state = 'AVOID';
            const escapeVector = this.calculateEscapeVector(npc, dangerBullet);
            const targetX = npc.x + escapeVector.x * 2;
            const targetY = npc.y + escapeVector.y * 2;
            this.updateMovement(npc, targetX, targetY, deltaTime);
            this.lastActionTime = now;
            return;
        }

        const bestCollectible = this.findBestCollectible(gameState, npc);
        if (bestCollectible) {
            this.state = 'COLLECT';
            this.updateMovement(npc, bestCollectible.x, bestCollectible.y, deltaTime);
        } else {
            this.state = 'WANDER';
            if (!this.target || Math.hypot(
                this.target.x - npc.x, 
                this.target.y - npc.y
            ) < 50) {
                this.target = {
                    x: Math.random() * (GAME_WIDTH - PLAYER_SIZE * 2) + PLAYER_SIZE,
                    y: Math.random() * (GAME_HEIGHT - PLAYER_SIZE * 2) + PLAYER_SIZE
                };
            }
            this.updateMovement(npc, this.target.x, this.target.y, deltaTime);
        }
    }

    findBestCollectible(gameState, npc) {
        return gameState.collectibles.reduce((best, collectible) => {
            const distance = Math.hypot(
                collectible.x - npc.x,
                collectible.y - npc.y
            );
            return distance < best.distance ? 
                { item: collectible, distance } : best;
        }, { item: null, distance: Infinity }).item;
    }
}

module.exports = NPC;