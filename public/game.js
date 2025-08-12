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

const singlePlayerModeControls = document.createElement('div');
singlePlayerModeControls.innerHTML = `
  <div id="npcList"></div>
  <button id="addNpcBtn">➕ Add NPC</button>
  <button id="startSinglePlayer">Start Single Player</button>
`;
document.body.prepend(singlePlayerModeControls);

const npcList = document.getElementById('npcList');
const addNpcBtn = document.getElementById('addNpcBtn');

let npcCounter = 1;
let npcs = [];

function renderNpcList() {
    npcList.innerHTML = '';
    npcs.forEach((npc, index) => {
        const npcDiv = document.createElement('div');
        npcDiv.className = 'npc-entry';
        npcDiv.innerHTML = `
      <label>Name: <input type="text" class="npc-name" data-index="${index}" value="${npc.name}"></label>
      <label>Preset:
        <select class="npc-preset" data-index="${index}">
          <option value="">Custom</option>
          <option value="easy"${npc.preset === 'easy' ? ' selected' : ''}>Easy</option>
          <option value="medium"${npc.preset === 'medium' ? ' selected' : ''}>Medium</option>
          <option value="hard"${npc.preset === 'hard' ? ' selected' : ''}>Hard</option>
        </select>
      </label>
      <label>Speed: <input type="number" class="npc-speed" data-index="${index}" value="${npc.speed}" step="0.1" min="0"></label>
      <label>Reaction Time (ms): <input type="number" class="npc-reaction" data-index="${index}" value="${npc.reaction}" min="0"></label>
      <label>Evasion (0–1): <input type="number" class="npc-evasion" data-index="${index}" value="${npc.evasion ?? 0.5}" step="0.1" min="0" max="1"></label>
      <button class="removeNpcBtn" data-index="${index}">❌</button>
    `;
        npcList.appendChild(npcDiv);
    });
}

addNpcBtn.addEventListener('click', () => {
    if (npcs.length >= 3) {
        alert("You can only add up to 3 NPCs.");
        return;
    }
    npcs.push({
        name: `NPC-${npcCounter++}`,
        preset: 'easy',
        speed: 3,
        reaction: 400,
        evasion: 0.3,
    });
    renderNpcList();
});

npcList.addEventListener('input', (e) => {
    const index = parseInt(e.target.dataset.index);
    const npc = npcs[index];

    if (e.target.classList.contains('npc-name')) {
        npc.name = e.target.value;
    } else if (e.target.classList.contains('npc-speed')) {
        npc.speed = parseFloat(e.target.value);
        npc.preset = ''; // drop the preset with manual input
        npcList.querySelector(`.npc-preset[data-index="${index}"]`).value = '';
    } else if (e.target.classList.contains('npc-reaction')) {
        npc.reaction = parseInt(e.target.value);
        npc.preset = '';
        npcList.querySelector(`.npc-preset[data-index="${index}"]`).value = '';
    } else if (e.target.classList.contains('npc-evasion')) {
        npc.evasion = parseFloat(e.target.value);
        npc.preset = '';
        npcList.querySelector(`.npc-preset[data-index="${index}"]`).value = '';
    } else if (e.target.classList.contains('npc-preset')) {
        const preset = e.target.value;
        npc.preset = preset;

        if (preset === 'easy') {
            npc.speed = 3;
            npc.reaction = 400;
            npc.evasion = 0.3;
        } else if (preset === 'medium') {
            npc.speed = 4.5;
            npc.reaction = 250;
            npc.evasion = 0.6;
        } else if (preset === 'hard') {
            npc.speed = 6;
            npc.reaction = 150;
            npc.evasion = 0.9;
        }
        renderNpcList();
    }
});

npcList.addEventListener('click', (e) => {
    if (e.target.classList.contains('removeNpcBtn')) {
        const index = parseInt(e.target.dataset.index);
        npcs.splice(index, 1);
        renderNpcList();
    }
});

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
                playerElem.textContent = getShortName(pData.name);
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

        function getShortName(name) {
            if (!name || typeof name !== 'string') return '';

            // Cleaning: remove symbols @ # _ . - and extra spaces
            const cleaned = name
                .trim()
                .replace(/[@#._\-]/g, ' ')
                .replace(/\s+/g, ' ');

            const parts = cleaned.split(' ').filter(Boolean);

            if (parts.length >= 3) {
                // Return initials from first 3 words
                return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
            } else if (parts.length === 2) {
                // Returning initials from 2 words
                return (parts[0][0] + parts[1][0]).toUpperCase();
            } else if (parts.length === 1) {
                const word = parts[0].toUpperCase();
                return word.length <= 3 ? word : word.slice(0, 3);
            }

            return '';
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
    socket.emit('setGameMode', { mode: 'multi' });

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

let isInAdminPrivateGame = false;

socket.on('adminGameStarted', (privateGameState) => {
    console.log('[CLIENT] Admin private game started!', privateGameState);
    isInAdminPrivateGame = true;
    singlePlayerModeControls.style.display = 'none';

    landingScreen.classList.add('hidden');
    joinScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameStartTime = privateGameState.gameStartTime;
    pausedTimeAcc = 0;
    pauseStartTime = null;
    inGame = true;
    menu.classList.add('hidden');

    gameState = privateGameState;

    Renderer.updatePlayers();
    Renderer.updateBullets();
    Renderer.updateCollectibles();
    Renderer.updateScoreboard();

    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
});

socket.on('adminGameState', (privateGameState) => {
    if (isInAdminPrivateGame) {

        gameState = privateGameState;
        Renderer.updatePlayers();
        Renderer.updateBullets();
        Renderer.updateCollectibles();
        Renderer.updateScoreboard();
    }
});

socket.on('adminGameOver', (data) => {
    console.log('[CLIENT] Admin private game ended:', data.reason);
    isInAdminPrivateGame = false;

    timerDisplay.textContent = "00:00";
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    gameStartTime = null;
    menu.classList.add('hidden');

    setTimeout(() => {
        inGame = false;
        gameScreen.classList.add('hidden');
        landingScreen.classList.remove('hidden');
        gameState = null;
    }, 5000);
});

socket.on('adminGameMessage', (msg) => {
    const p = document.createElement('p');
    p.textContent = msg;
    p.style.color = '#ff6b6b';
    messagesDiv.appendChild(p);
    setTimeout(() => {
        if (messagesDiv.contains(p)) {
            messagesDiv.removeChild(p);
        }
    }, 5000);
});

let isCurrentUserAdmin = false;

socket.on('adminStatus', (data) => {
    isCurrentUserAdmin = data.isAdmin;
    if (data.isAdmin) {

        singlePlayerModeControls.style.display = 'block';
        document.body.classList.add('admin-user');
    } else {

        singlePlayerModeControls.style.display = 'none';
        document.body.classList.remove('admin-user');
    }
});

socket.on('forceReturnToMenu', () => {

    isInAdminPrivateGame = false;

    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    gameStartTime = null;
    pausedTimeAcc = 0;
    pauseStartTime = null;
    inGame = false;

    gameScreen.classList.add('hidden');
    joinScreen.classList.add('hidden');
    landingScreen.classList.remove('hidden');
    menu.classList.add('hidden');

    joinForm.reset();
    player = null;
    gameState = null;

    console.log('Game ended because admin left or disconnected.');
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
        const playerData = players[id];

        const adminLabel = playerData.isAdmin ? ' [ADMIN]' : '';
        p.textContent = playerData.name + adminLabel;
        if (playerData.isAdmin) {
            p.style.fontWeight = 'bold';
            p.style.color = '#ff6b6b';
        }
        lobbyPlayersDiv.appendChild(p);
    });

    if (isCurrentUserAdmin) {
        startGameBtn.classList.remove('hidden');
        startGameBtn.textContent = 'Start Game (Admin)';
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

socket.off('gameStarted');
socket.on('gameStarted', (state) => {

    if (!isInAdminPrivateGame) {
        if (isCurrentUserAdmin) {
            singlePlayerModeControls.style.display = 'none';
        }
        console.log('[CLIENT] Multiplayer game started! Players:', state.players);
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
    }
    console.log(`game started animationFrameId: ${animationFrameId}`);
});

socket.on('playSound', (data) => {
    if (animationFrameId) {
        if (data.sound === 'hit') {
            hitSound.play();
        } else if (data.sound === 'gameover') {
            gameOverSound.play();
        } else if (data.sound === 'collectible') {
            collectibleSound.play();
        }
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
    console.log(`exitBtn event listener animationFrameId: ${animationFrameId}`);
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

socket.off('gameState');
socket.on('gameState', (state) => {

    if (!isInAdminPrivateGame) {
        gameState = state;
        Renderer.updatePlayers();
        Renderer.updateBullets();
        Renderer.updateCollectibles();
        Renderer.updateScoreboard();
    }
});

socket.off('gameOver');
socket.on('gameOver', (data) => {

    console.log(`isInAdminPrivateGame: ${isInAdminPrivateGame}`)
    if (!isInAdminPrivateGame) {
        console.log(`animationFrameId: ${animationFrameId}`)
        timerDisplay.textContent = "00:00";
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        gameStartTime = null;
        menu.classList.add('hidden');

        setTimeout(() => {
            socket.emit('leaveLobby');
            inGame = false;
            gameScreen.classList.add('hidden');
            joinScreen.classList.add('hidden');
            landingScreen.classList.remove('hidden');
            joinForm.reset();
            player = null;
            gameState = null;
        }, 5000);
    }
});

socket.on('enableSinglePlayerControls', () => {
    singlePlayerModeControls.style.display = 'block';
    document.body.classList.add('admin-user');
});

document.addEventListener('keydown', (event) => {
    if (animationFrameId) {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
        }
        socket.emit('playerInput', {key: event.key, state: 'down'});
    }
});
document.addEventListener('keyup', (event) => {
    if (animationFrameId) {
        socket.emit('playerInput', {key: event.key, state: 'up'});
    }
});

document.getElementById('startSinglePlayer').addEventListener('click', () => {
    if (npcs.length < 1) {
        alert("At least 1 NPC is required to start a single-player game.");
        return;
    }
    const npcData = npcs.map(npc => ({
        name: npc.name || 'NPC',
        difficulty: npc.preset || 'custom',
        speed: npc.speed,
        reaction: npc.reaction,
        evasion: npc.evasion
    }));

    socket.emit('setGameMode', {
        mode: 'single',
        npcs: npcData
    }, (response) => {
        if (response.success) {
            socket.emit('join', { name: 'Player' }, (joinResponse) => {
                if (!joinResponse?.error) {
                    socket.emit('startGame');
                }
            });
        }
    });
});

const style = document.createElement('style');
style.textContent = `
    #gameArea {
        position: relative;
        overflow: hidden;
        transform: translateZ(0);
        will-change: transform;
    }
    
    .player, .bullet, .collectible {
        position: absolute;
        transform: translateZ(0);
        will-change: transform;
    }
    
    .admin-user #singlePlayerModeControls {
        display: block !important;
    }
    
    body:not(.admin-user) #singlePlayerModeControls {
        display: none !important;
    }
`;
document.head.appendChild(style);

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