const {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_SIZE,
  BULLET_SIZE,
  COLLECTIBLE_SIZE,
  BULLET_SPEED,
  PLAYER_SPEED,
  GAME_DURATION,
  checkCollision
} = require('./constants');
const NPC = require('./npc');

const npcControllers = {}; // npc controllers outside GameState

let bulletCounter = 0;
let collectibleCounter = 0;
let lastBulletSpawn = Date.now();
let lastCollectibleSpawn = Date.now();
const bulletSpawnInterval = 750;
const collectibleSpawnInterval = 3000;
const bulletsPerSpawn = 2;

function initGameState() {
  return {
    players: {},
    bullets: [],
    collectibles: [],
    paused: false,
    gameStarted: false,
    gameEnded: false,
    gameStartTime: null
  };
}

function spawnBullet(gameState) {
  for (let i = 0; i < bulletsPerSpawn; i++) {
    let side = Math.floor(Math.random() * 3);
    let bullet = {
      id: 'bullet' + (++bulletCounter),
      x: 0,
      y: 0,
      vx: 0,
      vy: 0
    };
    if (side === 0) {
      bullet.x = Math.random() * (GAME_WIDTH - BULLET_SIZE);
      bullet.y = 0 - BULLET_SIZE;
      bullet.vx = (Math.random() - 0.5) * 2;
      bullet.vy = BULLET_SPEED;
    } else if (side === 1) {
      bullet.x = 0 - BULLET_SIZE;
      bullet.y = Math.random() * (GAME_HEIGHT - BULLET_SIZE);
      bullet.vx = BULLET_SPEED;
      bullet.vy = (Math.random() - 0.5) * 2;
    } else {
      bullet.x = GAME_WIDTH;
      bullet.y = Math.random() * (GAME_HEIGHT - BULLET_SIZE);
      bullet.vx = -BULLET_SPEED;
      bullet.vy = (Math.random() - 0.5) * 2;
    }
    gameState.bullets.push(bullet);
  }
}

function spawnCollectible(gameState) {
  const collectible = {
    id: 'collectible' + (++collectibleCounter),
    x: Math.random() * (GAME_WIDTH - COLLECTIBLE_SIZE),
    y: Math.random() * (GAME_HEIGHT - COLLECTIBLE_SIZE)
  };
  gameState.collectibles.push(collectible);
}

function handleCollisions(gameState, io) {
  Object.keys(gameState.players).forEach(id => {
    const player = gameState.players[id];
    if (player.alive) {
      for (let i = 0; i < gameState.bullets.length; i++) {
        const bullet = gameState.bullets[i];
        if (checkCollision(player, PLAYER_SIZE, PLAYER_SIZE, bullet, BULLET_SIZE, BULLET_SIZE)) {
          player.score -= 10;
          player.lives -= 1;
          gameState.bullets.splice(i, 1);
          i--;
          io.emit('playSound', { sound: 'hit' });
          if (player.lives <= 0) {
            player.alive = false;
            io.emit('gameMessage', `${player.name} is out!`);
          }
          break;
        }
      }
      for (let i = 0; i < gameState.collectibles.length; i++) {
        const collectible = gameState.collectibles[i];
        if (checkCollision(player, PLAYER_SIZE, PLAYER_SIZE, collectible, COLLECTIBLE_SIZE, COLLECTIBLE_SIZE)) {
          player.score += 5;
          gameState.collectibles.splice(i, 1);
          i--;
          io.emit('playSound', { sound: 'collectible' });
          break;
        }
      }
    }
  });
}

function updateGame(gameState, io) {
  if (!gameState.gameStarted || gameState.paused || gameState.gameEnded) return;

  const now = Date.now();

  // Create controllers for new NPCs
  Object.values(gameState.players).forEach(player => {
    if (player.isNPC && !npcControllers[player.id]) {
      npcControllers[player.id] = new NPC(player.difficulty, player);
    }
  });

  // update NPC
  Object.entries(npcControllers).forEach(([playerId, npcAI]) => {
    const player = gameState.players[playerId];
    if (!player || !player.alive) {
      delete npcControllers[playerId];
      return;
    }
    npcAI.update(player, gameState);
    // console.log(playerId, npcAI.getDebugInfo());
  });

  // spawn bullets
  if (now - lastBulletSpawn > bulletSpawnInterval) {
    spawnBullet(gameState);
    lastBulletSpawn = now;
  }

  // spawn bonuses
  if (now - lastCollectibleSpawn > collectibleSpawnInterval) {
    spawnCollectible(gameState);
    lastCollectibleSpawn = now;
  }

  // Processing players movement
  Object.keys(gameState.players).forEach(id => {
    const player = gameState.players[id];
    if (!player.isNPC && player.alive) {
      if (player.inputs['ArrowUp'] === 'down') player.y -= PLAYER_SPEED;
      if (player.inputs['ArrowDown'] === 'down') player.y += PLAYER_SPEED;
      if (player.inputs['ArrowLeft'] === 'down') player.x -= PLAYER_SPEED;
      if (player.inputs['ArrowRight'] === 'down') player.x += PLAYER_SPEED;

      player.x = Math.max(0, Math.min(GAME_WIDTH - PLAYER_SIZE, player.x));
      player.y = Math.max(0, Math.min(GAME_HEIGHT - PLAYER_SIZE, player.y));
    }
  });

  // bullets movement
  gameState.bullets.forEach(bullet => {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
  });

  // Removal of bullets that went beyond the boundaries
  gameState.bullets = gameState.bullets.filter(bullet =>
      bullet.x >= -BULLET_SIZE && bullet.x <= GAME_WIDTH &&
      bullet.y >= -BULLET_SIZE && bullet.y <= GAME_HEIGHT
  );

  // Clashes
  handleCollisions(gameState, io);

  // The end of the game
  const alivePlayers = Object.values(gameState.players).filter(p => p.alive);
  if (now - gameState.gameStartTime >= GAME_DURATION || alivePlayers.length <= 1) {
    gameState.gameEnded = true;
    const winner = alivePlayers.length === 1
        ? alivePlayers[0]
        : Object.values(gameState.players).reduce((max, p) => (!max || p.score > max.score ? p : max), null);

    io.emit('playSound', { sound: 'gameover' });
    io.emit('gameOver', { winner, gameState });
    io.emit('gameMessage', `Game Over! Winner: ${winner ? winner.name : "No one"}`);

    setTimeout(() => {
      gameState.bullets = [];
      gameState.collectibles = [];
      gameState.gameStarted = false;
      gameState.gameEnded = false;
      gameState.paused = false;
      gameState.gameStartTime = null;
      gameState.players = {};
      io.emit('lobbyUpdate', gameState.players);
      io.emit('gameMessage', 'Lobby is now open for a new game.');
    }, 5000);

    Object.keys(npcControllers).forEach(id => {
          delete npcControllers[id];
    });
  }
}


module.exports = {
  initGameState,
  updateGame
};