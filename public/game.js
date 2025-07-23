const socket = io({ transports: ['websocket'] });

const hitSound = new Audio('sounds/hit.mp3');
const gameOverSound = new Audio('sounds/gameover.mp3');
const collectibleSound = new Audio('sounds/collectible.mp3');

const landingScreen = document.getElementById('landingScreen');
const multiplayerBtn = document.getElementById('multiplayerBtn');
const joinScreen = document.getElementById('joinScreen');
const joinForm = document.getElementById('joinForm');
const playerNameInput = document.getElementById('playerName');
const joinError = document.getElementById('joinError');
const lobbyInfo = document.getElementById('lobbyInfo');
const lobbyPlayersDiv = document.getElementById('lobbyPlayers');
const startGameBtn = document.getElementById('startGame');
const exitLobbyBtn = document.getElementById('exitLobby');
const gameScreen = document.getElementById('gameScreen');
const gameArea = document.getElementById('gameArea');
const scoreboard = document.getElementById('scoreboard');
const timerDisplay = document.getElementById('timer');
const menu = document.getElementById('menu');
const messagesDiv = document.getElementById('messages');
const menuToggle = document.getElementById('menuToggle');
const resumeBtn = document.getElementById('resume');
const restartBtn = document.getElementById('restart');
const exitGameBtn = document.getElementById('exitGame');

const modeSelector = document.createElement('div');
modeSelector.innerHTML = `
<select id="gameMode">
<option value="multi">Multiplayer</option>
<option value="single">Single Player</option>
</select>
<div id="npcSettings">
<input type="number" id="npcCount" min="1" max="3" value="1">
<select id="npcDifficulty">
<option value="easy">Easy</option>
<option value="medium">Medium</option>
<option value="hard">Hard</option>
</select>
</div>
<button id="startSinglePlayer">Start Single Player</button>
`;
document.body.prepend(modeSelector);

let player = null;
let gameState = null;
let gameStartTime = null;
let pausedTimeAcc = 0;
let pauseStartTime = null;
let animationFrameId = null;
let inGame = false;

const Renderer = (function() {
    const playerElements = {};
    const bulletElements = {};
    const collectibleElements = {};

    function updatePlayers() {
        for (const id in playerElements) {
            if (!gameState.players[id]) {
                playerElements[id].remove();
                delete playerElements[id];
            }
        }
        for (const id in gameState.players) {
            const pData = gameState.players[id];
            if (!playerElements[id]) {
                const playerElem = document.createElement('div');
                playerElem.classList.add('player');
                playerElem.setAttribute('data-id', id);
                playerElem.textContent = pData.name;
                playerElem.style.backgroundColor = pData.color || 'red';
                gameArea.appendChild(playerElem);
                playerElements[id] = playerElem;
                playerElem.lastX = null;
                playerElem.lastY = null;
                playerElem.lastAlive = null;
            }
            const playerElem = playerElements[id];
            if (playerElem.lastX !== pData.x || playerElem.lastY !== pData.y) {
                playerElem.style.transform = `translate(${pData.x}px, ${pData.y}px)`;
                playerElem.lastX = pData.x;
                playerElem.lastY = pData.y;
            }
            if (playerElem.lastAlive !== pData.alive) {
                playerElem.style.opacity = pData.alive ? 1 : 0.5;
                playerElem.lastAlive = pData.alive;
            }
        }
    }

    function updateBullets() {
        for (const id in bulletElements) {
            if (!gameState.bullets.some(bullet => bullet.id === id)) {
                bulletElements[id].remove();
                delete bulletElements[id];
            }
        }
        gameState.bullets.forEach(bullet => {
            if (!bulletElements[bullet.id]) {
                const bulletElem = document.createElement('div');
                bulletElem.classList.add('bullet');
                bulletElem.setAttribute('data-id', bullet.id);
                gameArea.appendChild(bulletElem);
                bulletElements[bullet.id] = bulletElem;
                bulletElem.lastX = null;
                bulletElem.lastY = null;
            }
            const bulletElem = bulletElements[bullet.id];
            if (bulletElem.lastX !== bullet.x || bulletElem.lastY !== bullet.y) {
                bulletElem.style.transform = `translate(${bullet.x}px, ${bullet.y}px)`;
                bulletElem.lastX = bullet.x;
                bulletElem.lastY = bullet.y;
            }
        });
    }

    function updateCollectibles() {
        for (const id in collectibleElements) {
            if (!gameState.collectibles.some(collectible => collectible.id === id)) {
                collectibleElements[id].remove();
                delete collectibleElements[id];
            }
        }
        gameState.collectibles.forEach(collectible => {
            if (!collectibleElements[collectible.id]) {
                const collectibleElem = document.createElement('div');
                collectibleElem.classList.add('collectible');
                collectibleElem.setAttribute('data-id', collectible.id);
                gameArea.appendChild(collectibleElem);
                collectibleElements[collectible.id] = collectibleElem;
                collectibleElem.lastX = null;
                collectibleElem.lastY = null;
            }
            const collectibleElem = collectibleElements[collectible.id];
            if (collectibleElem.lastX !== collectible.x || collectibleElem.lastY !== collectible.y) {
                collectibleElem.style.transform = `translate(${collectible.x}px, ${collectible.y}px)`;
                collectibleElem.lastX = collectible.x;
                collectibleElem.lastY = collectible.y;
            }
        });
    }

    function updateScoreboard() {
        scoreboard.innerHTML = '';
        for (let id in gameState.players) {
            const pData = gameState.players[id];
            const scoreItem = document.createElement('div');
            scoreItem.textContent = `${pData.name}: ${pData.score} | Lives: ${pData.lives}`;
            scoreboard.appendChild(scoreItem);
        }
    }

    function updateTimer() {
        if (!gameState) {
            timerDisplay.textContent = "00:00";
            return;
        }
        if (!gameStartTime || (gameState && gameState.gameEnded)) {
            timerDisplay.textContent = "00:00";
            return;
        }
        if (gameState.paused) {
            if (pauseStartTime === null) {
                pauseStartTime = Date.now();
            }
            const elapsed = pauseStartTime - gameStartTime - pausedTimeAcc;
            const minutes = String(Math.floor(elapsed / 60000)).padStart(2, '0');
            const seconds = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
            timerDisplay.textContent = `${minutes}:${seconds}`;
        } else {
            if (pauseStartTime !== null) {
                pausedTimeAcc += Date.now() - pauseStartTime;
                pauseStartTime = null;
            }
            const elapsed = Date.now() - gameStartTime - pausedTimeAcc;
            const minutes = String(Math.floor(elapsed / 60000)).padStart(2, '0');
            const seconds = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
            timerDisplay.textContent = `${minutes}:${seconds}`;
        }
    }

    return {
        updatePlayers,
        updateBullets,
        updateCollectibles,
        updateScoreboard,
        updateTimer
    };
})();

multiplayerBtn.addEventListener('click', () => {
    landingScreen.classList.add('hidden');
    joinScreen.classList.remove('hidden');
    joinForm.classList.remove('hidden');
    lobbyInfo.classList.add('hidden');
});

joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let name = playerNameInput.value.trim();
    if (name === '') return;
    socket.emit('join', { name: name });
});

socket.on('joinSuccess', (data) => {
    player = data;
    joinForm.classList.add('hidden');
    lobbyInfo.classList.remove('hidden');
});

socket.on('joinError', (data) => {
    joinError.textContent = data.error;
});

socket.on('lobbyUpdate', (players) => {
    lobbyPlayersDiv.innerHTML = '';
    const ids = Object.keys(players);
    ids.forEach(id => {
        const p = document.createElement('div');
        p.textContent = players[id].name;
        lobbyPlayersDiv.appendChild(p);
    });
    if (player && ids.length > 0 && ids[0] === player.id) {
        startGameBtn.classList.remove('hidden');
    } else {
        startGameBtn.classList.add('hidden');
    }
});

exitLobbyBtn.addEventListener('click', () => {
    socket.emit('leaveLobby');
    player = null;
    joinForm.classList.remove('hidden');
    lobbyInfo.classList.add('hidden');
    joinForm.reset();
    joinScreen.classList.add('hidden');
    landingScreen.classList.remove('hidden');
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

socket.on('gameStarted', (state) => {
    console.log('[CLIENT] Game started! Players:', state.players);
    console.log("[CLIENT] Game started!", state);
    landingScreen.classList.add('hidden'); 
    joinScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameStartTime = state.gameStartTime;
    pausedTimeAcc = 0;
    pauseStartTime = null;
    inGame = true;
    menu.classList.add('hidden');
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
});

socket.on('playSound', (data) => {
    if (data.sound === 'hit') {
        hitSound.play();
    } else if (data.sound === 'gameover') {
        gameOverSound.play();
    } else if (data.sound === 'collectible') {
        collectibleSound.play();
    }
});

menuToggle.addEventListener('click', () => {
    if (inGame) {
        socket.emit('menuAction', { action: 'pause' });
        menu.classList.remove('hidden');
    }
});

resumeBtn.addEventListener('click', () => {
    socket.emit('menuAction', { action: 'resume' });
    menu.classList.add('hidden');
});

restartBtn.addEventListener('click', () => {
    socket.emit('menuAction', { action: 'restart' });
    menu.classList.add('hidden');
});

exitGameBtn.addEventListener('click', () => {
    socket.emit('menuAction', { action: 'quit' });
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    gameStartTime = null;
    pausedTimeAcc = 0;
    pauseStartTime = null;
    inGame = false;
    gameScreen.classList.add('hidden');
    joinScreen.classList.add('hidden');
    landingScreen.classList.remove('hidden');
    joinForm.reset();
    player = null;
    gameState = null;
});

socket.on('gameMessage', (msg) => {
    const p = document.createElement('p');
    p.textContent = msg;
    messagesDiv.appendChild(p);
    setTimeout(() => {
        messagesDiv.removeChild(p);
    }, 5000);
});

socket.on('gameState', (state) => {
    gameState = state;
    Renderer.updatePlayers();
    Renderer.updateBullets();
    Renderer.updateCollectibles();
    Renderer.updateScoreboard();
});

socket.on('gameOver', (data) => {
    timerDisplay.textContent = "00:00";
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    gameStartTime = null;
    menu.classList.add('hidden');
    socket.emit('leaveLobby');
    setTimeout(() => {
        inGame = false;
        gameScreen.classList.add('hidden');
        joinScreen.classList.add('hidden');
        landingScreen.classList.remove('hidden');
        joinForm.reset();
        player = null;
        gameState = null;
    }, 5000);
});

document.addEventListener('keydown', (event) => {
    socket.emit('playerInput', { key: event.key, state: 'down' });
});
document.addEventListener('keyup', (event) => {
    socket.emit('playerInput', { key: event.key, state: 'up' });
});

document.getElementById('startSinglePlayer').addEventListener('click', () => {
    const npcCount = parseInt(document.getElementById('npcCount').value);
    const difficulty = document.getElementById('npcDifficulty').value;
    
    console.log('[CLIENT] Emitting setGameMode');
    socket.emit('setGameMode', {
        mode: 'single',
        npcCount,
        difficulty
    }, (response) => {
        console.log('[CLIENT] setGameMode response:', response);
        if (response.success) {
            console.log('[CLIENT] Emitting join');
            socket.emit('join', { name: 'Player' }, (joinResponse) => {
                console.log('[CLIENT] join response:', joinResponse);
                
                if (!joinResponse?.error) {
                    console.log('[CLIENT] Emitting startGame');
                    socket.emit('startGame');
                }
            });
        }
    });
});

let lastFrameTime = 0;
const fpsInterval = 1000 / 60;

function gameLoop(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const elapsed = timestamp - lastFrameTime;
    if (elapsed > fpsInterval) {
        lastFrameTime = timestamp - (elapsed % fpsInterval);
        Renderer.updateTimer();
    }
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);