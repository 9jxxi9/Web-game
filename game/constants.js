const GAME_WIDTH = 1200;
const GAME_HEIGHT = 800;
const PLAYER_SIZE = 40;
const BULLET_SIZE = 10;
const COLLECTIBLE_SIZE = 20;
const BULLET_SPEED = 4;
const PLAYER_SPEED = 5;
const GAME_DURATION = 120000;
const GAME_MODES = {
  SINGLE: 'single',
  MULTI: 'multi'
};

const DIFFICULTY_LEVELS = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
};

function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function checkCollision(a, aw, ah, b, bw, bh) {
  return a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
}

module.exports = {
  GAME_WIDTH,
  GAME_HEIGHT,
  PLAYER_SIZE,
  BULLET_SIZE,
  COLLECTIBLE_SIZE,
  BULLET_SPEED,
  PLAYER_SPEED,
  GAME_DURATION,
  getRandomColor,
  checkCollision,
  GAME_MODES,
  DIFFICULTY_LEVELS
};