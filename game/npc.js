const {
    GAME_WIDTH,
    GAME_HEIGHT,
    PLAYER_SIZE,
    DIFFICULTY_LEVELS
} = require('./constants');

class NPC {
    constructor(difficulty, npcRef = null) {
        this.difficulty = difficulty;
        this.npcRef = npcRef;

        // Basic parameters
        this.maxSpeed = this.getSpeedByDifficulty();
        this.acceleration = 0.4;
        this.reactionTime = this.getReactionTime();
        this.thinkInterval = Math.max(50, this.reactionTime * 0.5);

        // States and targets
        this.state = 'WANDER';
        this.target = null;
        this.lastThinkTime = 0;

        // Danger response system
        this.lastDangerDetection = 0;
        this.reactionDelay = 0;

        // Movement system
        this.velocity = { x: 0, y: 0 };
        this.desiredVelocity = { x: 0, y: 0 };

        // System for preventing stuck
        this.lastPosition = { x: 0, y: 0 };
        this.stuckCounter = 0;
        this.unstuckTarget = null;
    }

    getSpeedByDifficulty() {
        if (this.difficulty === 'custom' && this.npcRef?.customConfig?.speed) {
            return this.npcRef.customConfig.speed;
        }
        return {
            [DIFFICULTY_LEVELS.EASY]: 3,
            [DIFFICULTY_LEVELS.MEDIUM]: 4.5,
            [DIFFICULTY_LEVELS.HARD]: 6
        }[this.difficulty] || 4;
    }

    getReactionTime() {
        if (this.difficulty === 'custom' && this.npcRef?.customConfig?.reaction) {
            return this.npcRef.customConfig.reaction;
        }
        return {
            [DIFFICULTY_LEVELS.EASY]: 400,
            [DIFFICULTY_LEVELS.MEDIUM]: 250,
            [DIFFICULTY_LEVELS.HARD]: 150
        }[this.difficulty] || 250;
    }

    getEvasionValue() {
        if (this.difficulty === 'custom' && this.npcRef?.customConfig?.evasion !== undefined) {
            return this.npcRef.customConfig.evasion;
        }
        return {
            [DIFFICULTY_LEVELS.EASY]: 0.3,
            [DIFFICULTY_LEVELS.MEDIUM]: 0.6,
            [DIFFICULTY_LEVELS.HARD]: 0.9
        }[this.difficulty] || 0.5;
    }

    // Test readiness to respond to danger
    canReactToDanger(now) {
        return now - this.lastDangerDetection >= this.reactionDelay;
    }

    // IMPROVED: Unified and reliable danger detection
    isBulletDangerous(bullet, npc) {
        const distance = Math.hypot(bullet.x - npc.x, bullet.y - npc.y);

        // First rough filtering by distance
        if (distance > 300) return false;

        // Check future danger (in 0.5 seconds)
        const predictionFrames = 30;
        const futureNpcX = npc.x + this.velocity.x * predictionFrames;
        const futureNpcY = npc.y + this.velocity.y * predictionFrames;
        const futureBulletX = bullet.x + bullet.vx * predictionFrames;
        const futureBulletY = bullet.y + bullet.vy * predictionFrames;

        const futureDistance = Math.hypot(
            futureNpcX - futureBulletX,
            futureNpcY - futureBulletY
        );

        const dangerRadius = 50 + this.getEvasionValue() * 30;
        return futureDistance < dangerRadius;
    }

    // IMPROVED: Analyze all threats without duplication
    analyzeThreats(gameState, npc) {
        const immediate = [];  // < 100 pixels or < 0.3 sec
        const upcoming = [];   // < 300 pixels and within trajectory

        for (const bullet of gameState.bullets || []) {
            const distance = Math.hypot(bullet.x - npc.x, bullet.y - npc.y);

            if (distance < 100) {
                immediate.push(bullet);
                continue;
            }

            if (this.isBulletDangerous(bullet, npc)) {
                upcoming.push(bullet);
            }
        }

        return { immediate, upcoming };
    }

    // IMPROVED: Emergency escape calculation for immediate threats
    calculateEmergencyEscape(npc, threats) {
        if (threats.length === 0) return { x: 0, y: 0 };

        let escapeX = 0;
        let escapeY = 0;

        for (const threat of threats) {
            const dx = npc.x - threat.x;
            const dy = npc.y - threat.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 0) {
                // Maximum weight for immediate threats
                const weight = 200 / (distance + 1);
                escapeX += (dx / distance) * weight;
                escapeY += (dy / distance) * weight;
            }
        }

        const escapeLength = Math.hypot(escapeX, escapeY);
        if (escapeLength === 0) return { x: 0, y: 0 };

        // Emergency speed boost
        const emergencyMultiplier = 1.5 + this.getEvasionValue();
        return {
            x: (escapeX / escapeLength) * this.maxSpeed * emergencyMultiplier,
            y: (escapeY / escapeLength) * this.maxSpeed * emergencyMultiplier
        };
    }

    // IMPROVED: Normal escape calculation for upcoming threats
    calculateEscape(npc, threats) {
        if (threats.length === 0) return { x: 0, y: 0 };

        let escapeX = 0;
        let escapeY = 0;

        for (const threat of threats) {
            const dx = npc.x - threat.x;
            const dy = npc.y - threat.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 0) {
                // Weight inversely proportional to distance
                const weight = 100 / (distance + 10);
                escapeX += (dx / distance) * weight;
                escapeY += (dy / distance) * weight;
            }
        }

        const escapeLength = Math.hypot(escapeX, escapeY);
        if (escapeLength === 0) return { x: 0, y: 0 };

        const evasionMultiplier = 1 + this.getEvasionValue();
        return {
            x: (escapeX / escapeLength) * this.maxSpeed * evasionMultiplier,
            y: (escapeY / escapeLength) * this.maxSpeed * evasionMultiplier
        };
    }

    // IMPROVED: Safe resource finding
    findSafeResource(gameState, npc, threats) {
        if (!gameState.collectibles?.length) return null;

        let bestResource = null;
        let bestScore = -Infinity;

        for (const resource of gameState.collectibles) {
            // Check path safety to resource
            if (!this.isPathSafe(npc, resource, threats)) continue;

            const distance = Math.hypot(resource.x - npc.x, resource.y - npc.y);
            const score = 1000 - distance; // Closer = better

            if (score > bestScore) {
                bestScore = score;
                bestResource = resource;
            }
        }

        return bestResource;
    }

    // NEW: Check path safety
    isPathSafe(from, to, threats, steps = 5) {
        const dx = (to.x - from.x) / steps;
        const dy = (to.y - from.y) / steps;

        for (let i = 1; i <= steps; i++) {
            const checkX = from.x + dx * i;
            const checkY = from.y + dy * i;

            for (const threat of threats) {
                // Check intersection with bullet trajectory
                const distance = this.distanceToLine(
                    checkX, checkY,
                    threat.x, threat.y,
                    threat.x + threat.vx * 60,
                    threat.y + threat.vy * 60
                );

                if (distance < 60) return false; // Dangerous path
            }
        }

        return true;
    }

    // Search for the nearest resource (fallback for when no safe resource found)
    findNearestCollectible(gameState, npc) {
        if (!gameState.collectibles || gameState.collectibles.length === 0) {
            return null;
        }

        let nearest = null;
        let nearestDistance = Infinity;

        for (const collectible of gameState.collectibles) {
            const distance = Math.hypot(collectible.x - npc.x, collectible.y - npc.y);
            if (distance < nearestDistance) {
                nearest = collectible;
                nearestDistance = distance;
            }
        }

        return nearest;
    }

    // Generation of a random target for wandering
    generateWanderTarget(npc) {
        const margin = PLAYER_SIZE * 2;
        const attempts = 5;

        for (let i = 0; i < attempts; i++) {
            const x = margin + Math.random() * (GAME_WIDTH - 2 * margin);
            const y = margin + Math.random() * (GAME_HEIGHT - 2 * margin);

            const distance = Math.hypot(x - npc.x, y - npc.y);
            if (distance > 50) {
                return { x, y };
            }
        }

        // Fallback - Direction from center
        const centerX = GAME_WIDTH / 2;
        const centerY = GAME_HEIGHT / 2;
        const angle = Math.atan2(npc.y - centerY, npc.x - centerX) + (Math.random() - 0.5) * Math.PI;

        return {
            x: npc.x + Math.cos(angle) * 100,
            y: npc.y + Math.sin(angle) * 100
        };
    }

    // IMPROVED: Better stuck detection
    checkStuck(npc) {
        const movement = Math.hypot(npc.x - this.lastPosition.x, npc.y - this.lastPosition.y);
        const expectedMovement = Math.hypot(this.velocity.x, this.velocity.y);

        // Stuck if moving significantly slower than expected
        if (expectedMovement > 1 && movement < expectedMovement * 0.3) {
            this.stuckCounter++;
        } else {
            this.stuckCounter = 0;
        }

        this.lastPosition = { x: npc.x, y: npc.y };

        if (this.stuckCounter > 20) { // Reduced threshold
            this.generateEscapeRoute(npc);
            this.stuckCounter = 0;
            return true;
        }

        return false;
    }

    // NEW: Generate escape route when stuck
    generateEscapeRoute(npc) {
        // Try to move perpendicular to current velocity
        if (Math.hypot(this.velocity.x, this.velocity.y) > 0.1) {
            this.unstuckTarget = {
                x: npc.x - this.velocity.y * 50,
                y: npc.y + this.velocity.x * 50
            };
        } else {
            this.unstuckTarget = this.generateWanderTarget(npc);
        }

        // Ensure target is within bounds
        this.unstuckTarget.x = Math.max(PLAYER_SIZE, Math.min(GAME_WIDTH - PLAYER_SIZE, this.unstuckTarget.x));
        this.unstuckTarget.y = Math.max(PLAYER_SIZE, Math.min(GAME_HEIGHT - PLAYER_SIZE, this.unstuckTarget.y));
    }

    // IMPROVED: Clear priority system for decision making
    makeDecision(npc, gameState) {
        const now = Date.now();

        // Analyze all threats at once
        const allThreats = this.analyzeThreats(gameState, npc);

        // Priority 1: Emergency avoidance for immediate threats
        if (allThreats.immediate.length > 0) {
            this.state = 'EMERGENCY_AVOID';
            this.desiredVelocity = this.calculateEmergencyEscape(npc, allThreats.immediate);
            // Reset danger detection for immediate threats
            this.lastDangerDetection = 0;
            this.reactionDelay = 0;
            return;
        }

        // Priority 2: Normal avoidance for upcoming threats (with reaction time)
        if (allThreats.upcoming.length > 0) {
            // Set reaction delay if this is new danger detection
            if (this.lastDangerDetection === 0 || now - this.lastDangerDetection > 1000) {
                this.lastDangerDetection = now;
                this.reactionDelay = this.reactionTime;
            }

            if (this.canReactToDanger(now)) {
                this.state = 'AVOID';
                this.desiredVelocity = this.calculateEscape(npc, allThreats.upcoming);
                return;
            } else {
                // Not ready to react yet - slow down current action
                if (this.state !== 'AVOID' && this.state !== 'EMERGENCY_AVOID') {
                    this.desiredVelocity.x *= 0.7;
                    this.desiredVelocity.y *= 0.7;
                }
                return;
            }
        } else {
            // No danger - reset timers
            this.lastDangerDetection = 0;
            this.reactionDelay = 0;
        }

        // Priority 3: Unstuck if needed
        if (this.unstuckTarget) {
            this.state = 'UNSTUCK';
            this.target = this.unstuckTarget;

            const dx = this.unstuckTarget.x - npc.x;
            const dy = this.unstuckTarget.y - npc.y;
            const distance = Math.hypot(dx, dy);

            if (distance < 20) {
                this.unstuckTarget = null;
            } else if (distance > 0) {
                this.desiredVelocity = {
                    x: (dx / distance) * this.maxSpeed,
                    y: (dy / distance) * this.maxSpeed
                };
            }
            return;
        }

        // Priority 4: Safe resource collection
        const safeResource = this.findSafeResource(gameState, npc, allThreats.upcoming);
        if (safeResource) {
            this.state = 'COLLECT';
            this.target = safeResource;
            this.moveToTarget(npc, safeResource);
            return;
        }

        // Priority 5: Risky resource collection (if no safe resources available)
        const nearestResource = this.findNearestCollectible(gameState, npc);
        if (nearestResource) {
            this.state = 'COLLECT_RISKY';
            this.target = nearestResource;
            this.moveToTarget(npc, nearestResource, 0.8); // Slower approach
            return;
        }

        // Priority 6: Safe wandering
        this.wanderSafely(npc, allThreats.upcoming);
    }

    // NEW: Move to target helper
    moveToTarget(npc, target, speedMultiplier = 1.0) {
        const dx = target.x - npc.x;
        const dy = target.y - npc.y;
        const distance = Math.hypot(dx, dy);

        if (distance < PLAYER_SIZE * 1.5) {
            // Very close to resource - move slower and more precisely
            this.desiredVelocity = {
                x: (dx / distance) * this.maxSpeed * 0.5 * speedMultiplier,
                y: (dy / distance) * this.maxSpeed * 0.5 * speedMultiplier
            };
        } else if (distance > 0) {
            this.desiredVelocity = {
                x: (dx / distance) * this.maxSpeed * speedMultiplier,
                y: (dy / distance) * this.maxSpeed * speedMultiplier
            };
        }
    }

    // NEW: Safe wandering
    wanderSafely(npc, threats) {
        if (!this.target || Math.hypot(this.target.x - npc.x, this.target.y - npc.y) < 30) {
            // Generate safe wander target
            let attempts = 0;
            do {
                this.target = this.generateWanderTarget(npc);
                attempts++;
            } while (attempts < 5 && !this.isPathSafe(npc, this.target, threats));
        }

        this.state = 'WANDER';
        const dx = this.target.x - npc.x;
        const dy = this.target.y - npc.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0) {
            this.desiredVelocity = {
                x: (dx / distance) * this.maxSpeed * 0.7,
                y: (dy / distance) * this.maxSpeed * 0.7
            };
        }
    }

    // Apply movement physics
    applyMovement(npc, deltaTime) {
        // Smooth approach to desired velocity
        const lerpFactor = this.acceleration * deltaTime * 60;

        this.velocity.x += (this.desiredVelocity.x - this.velocity.x) * lerpFactor;
        this.velocity.y += (this.desiredVelocity.y - this.velocity.y) * lerpFactor;

        // Limit maximum speed
        const speed = Math.hypot(this.velocity.x, this.velocity.y);
        if (speed > this.maxSpeed) {
            this.velocity.x = (this.velocity.x / speed) * this.maxSpeed;
            this.velocity.y = (this.velocity.y / speed) * this.maxSpeed;
        }

        // Apply movement
        npc.x += this.velocity.x * deltaTime * 60;
        npc.y += this.velocity.y * deltaTime * 60;

        // Handle boundaries
        this.handleBoundaries(npc);
    }

    // IMPROVED: Better boundary handling
    handleBoundaries(npc) {
        const margin = PLAYER_SIZE;
        let bounced = false;

        // Softer boundary processing - allow bot to reach edge when collecting resources
        const isCollecting = (this.state === 'COLLECT' || this.state === 'COLLECT_RISKY') && this.target;
        const softMargin = isCollecting ? margin * 0.5 : margin;

        if (npc.x < softMargin) {
            npc.x = softMargin;
            if (!isCollecting) {
                this.velocity.x = Math.abs(this.velocity.x);
                bounced = true;
            }
        }
        if (npc.x > GAME_WIDTH - softMargin) {
            npc.x = GAME_WIDTH - softMargin;
            if (!isCollecting) {
                this.velocity.x = -Math.abs(this.velocity.x);
                bounced = true;
            }
        }
        if (npc.y < softMargin) {
            npc.y = softMargin;
            if (!isCollecting) {
                this.velocity.y = Math.abs(this.velocity.y);
                bounced = true;
            }
        }
        if (npc.y > GAME_HEIGHT - softMargin) {
            npc.y = GAME_HEIGHT - softMargin;
            if (!isCollecting) {
                this.velocity.y = -Math.abs(this.velocity.y);
                bounced = true;
            }
        }

        // If bounced, generate new target (but not when collecting resources)
        if (bounced && this.state === 'WANDER') {
            this.target = this.generateWanderTarget(npc);
        }
    }

    // IMPROVED: Main update method with better logic
    update(npc, gameState, deltaTime = 16/1000) {
        const now = Date.now();

        // Set reference to NPC object
        this.npcRef = npc;

        // Update parameters if custom difficulty
        if (this.difficulty === 'custom') {
            const newReactionTime = this.getReactionTime();
            if (newReactionTime !== this.reactionTime) {
                this.reactionTime = newReactionTime;
                this.thinkInterval = Math.max(50, this.reactionTime * 0.5);
            }
        }

        // Check if stuck
        this.checkStuck(npc);

        // Make decisions with interval based on reaction time
        const shouldThink = (now - this.lastThinkTime > this.thinkInterval) ||
            (this.state === 'EMERGENCY_AVOID') || // Always think for emergency
            ((this.state === 'AVOID') && this.canReactToDanger(now)) ||
            (!this.desiredVelocity.x && !this.desiredVelocity.y);

        if (shouldThink) {
            this.makeDecision(npc, gameState);
            this.lastThinkTime = now;
        }

        // Apply movement
        this.applyMovement(npc, deltaTime);
    }

    // Utility for calculating distance to line
    distanceToLine(x0, y0, x1, y1, x2, y2) {
        const A = x0 - x1;
        const B = y0 - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        if (lenSq === 0) {
            return Math.hypot(A, B);
        }

        const param = dot / lenSq;
        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = x0 - xx;
        const dy = x0 - yy;
        return Math.hypot(dx, dy);
    }

    // Method for debugging
    getDebugInfo() {
        return {
            state: this.state,
            velocity: this.velocity,
            desiredVelocity: this.desiredVelocity,
            target: this.target,
            stuckCounter: this.stuckCounter,
            maxSpeed: this.maxSpeed,
            thinkInterval: this.thinkInterval,
            reactionTime: this.reactionTime,
            lastThinkTime: this.lastThinkTime,
            reactionDelay: this.reactionDelay,
            evasionValue: this.getEvasionValue(),
        };
    }
}

module.exports = NPC;