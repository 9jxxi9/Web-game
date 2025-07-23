const { GAME_WIDTH, GAME_HEIGHT, PLAYER_SIZE, getRandomColor, GAME_MODES } = require('./constants');

function handleJoin(socket, data, gameState, io, callback) {
    if (gameState.mode === GAME_MODES.SINGLE && socket.id !== gameState.leader) {
        socket.emit('joinError', { error: 'Single player mode active' });
        if (callback) callback({ error: 'Single player mode active' });
        return;
    }
    if (Object.keys(gameState.players).length >= 4) {
        socket.emit('joinError', { error: 'Maximum players reached. Please wait for the next game.' });
        if (callback) callback({ error: 'Maximum players reached. Please wait for the next game.' });
        return;
    }
    for (let id in gameState.players) {
        if (gameState.players[id].name === data.name) {
            socket.emit('joinError', { error: 'Name already taken.' });
            if (callback) callback({ error: 'Name already taken.' });
            return;
        }
    }
    gameState.players[socket.id] = {
        id: socket.id,
        name: data.name,
        x: Math.floor(Math.random() * (GAME_WIDTH - PLAYER_SIZE)),
        y: Math.floor(Math.random() * (GAME_HEIGHT - PLAYER_SIZE)),
        score: 0,
        lives: 3,
        alive: true,
        color: data.color || getRandomColor(),
        inputs: {}
    };
    socket.emit('joinSuccess', gameState.players[socket.id]);
    io.emit('lobbyUpdate', gameState.players);
    io.emit('gameMessage', `${data.name} joined the lobby.`);
    if (callback) callback({ success: true });
}

function handlePlayerInput(socket, input, gameState) {
    const player = gameState.players[socket.id];
    if (player && player.alive && gameState.gameStarted) {
        player.inputs[input.key] = input.state;
    }
}

function handleMenuAction(socket, data, gameState, io) {
    const player = gameState.players[socket.id];
    if (player && gameState.gameStarted) {
        io.emit('gameMessage', `${player.name} ${data.action} the game.`);
        if (data.action === 'pause') {
            gameState.paused = true;
        } else if (data.action === 'resume') {
            gameState.paused = false;
        } else if (data.action === 'restart') {
            gameState.paused = false;
            gameState.gameStarted = true;
            gameState.gameEnded = false;
            gameState.bullets = [];
            gameState.collectibles = [];
            gameState.gameStartTime = Date.now();
            Object.keys(gameState.players).forEach(id => {
                const p = gameState.players[id];
                p.score = 0;
                p.lives = 3;
                p.alive = true;
                p.x = Math.floor(Math.random() * (GAME_WIDTH - PLAYER_SIZE));
                p.y = Math.floor(Math.random() * (GAME_HEIGHT - PLAYER_SIZE));
                p.inputs = {};
            });
            io.emit('gameMessage', `${player.name} restarted the game.`);
            io.emit('gameStarted', gameState);
        } else if (data.action === 'quit') {
            delete gameState.players[socket.id];
            io.emit('lobbyUpdate', gameState.players);
            if (Object.keys(gameState.players).length === 0) {
                gameState.paused = false;
                gameState.gameStarted = false;
                gameState.gameEnded = false;
                gameState.bullets = [];
                gameState.collectibles = [];
                gameState.gameStartTime = null;
            }
        }
    }
}

function handleLeaveLobby(socket, gameState, io) {
    if (gameState.players[socket.id]) {
        io.emit('gameMessage', `${gameState.players[socket.id].name} has left the lobby.`);
        delete gameState.players[socket.id];
        io.emit('lobbyUpdate', gameState.players);
    }
}

function handleStartGame(socket, gameState, io) {
    console.log("[SERVER] Обработка startGame. Текущий режим:", gameState.mode);
    
    if (gameState.mode === GAME_MODES.SINGLE) {
        console.log("[SERVER] Запуск Single Player. NPC:", gameState.npcCount);
        
        gameState.players = {};
        gameState.bullets = [];
        gameState.collectibles = [];
        gameState.gameStarted = true;
        gameState.gameStartTime = Date.now();
        
        gameState.players[socket.id] = {
            id: socket.id,
            name: 'Player',
            x: Math.random() * (GAME_WIDTH - PLAYER_SIZE),
            y: Math.random() * (GAME_HEIGHT - PLAYER_SIZE),
            score: 0,
            lives: 3,
            alive: true,
            color: getRandomColor(),
            inputs: {},
            isNPC: false
        };
        
        for (let i = 0; i < gameState.npcCount; i++) {
            const npcId = `npc_${Date.now()}_${i}`;
            gameState.players[npcId] = {
                id: npcId,
                name: `NPC-${i+1} (${gameState.npcDifficulty})`,
                x: Math.random() * (GAME_WIDTH - PLAYER_SIZE),
                y: Math.random() * (GAME_HEIGHT - PLAYER_SIZE),
                score: 0,
                lives: 3,
                alive: true,
                color: '#666666',
                inputs: {},
                isNPC: true,
                difficulty: gameState.npcDifficulty
            };
            console.log("[SERVER] Создан NPC:", npcId);
        }
        
        io.emit('gameStarted', gameState);
        console.log("[SERVER] Событие gameStarted отправлено");
        return;
    }
    if (Object.keys(gameState.players).length < 2) {
        console.log('[DEBUG] Not enough players for multiplayer');
        socket.emit('gameMessage', 'Need at least 2 players');
        return;
    }
    const leadId = Object.keys(gameState.players)[0];
    if (socket.id === leadId && !gameState.gameStarted) {
        gameState.gameStarted = true;
        gameState.gameStartTime = Date.now();
        io.emit('gameStarted', gameState);
        io.emit('gameMessage', 'Game has started!');
    }
    console.log('Starting game in mode:', gameState.mode);
    console.log('Players:', Object.keys(gameState.players));
    console.log('NPC count:', gameState.npcCount);
}

function handleDisconnect(socket, gameState, io) {
    if (gameState.players[socket.id]) {
        io.emit('gameMessage', `${gameState.players[socket.id].name} has disconnected.`);
        delete gameState.players[socket.id];
        io.emit('lobbyUpdate', gameState.players);
    }
}

function registerSocketHandlers(io, gameState) {
    io.on('connection', socket => {
        console.log('A new player connected:', socket.id);
        socket.on('startGame', () => {
            console.log("[SERVER] Получен запрос startGame от:", socket.id);
            handleStartGame(socket, gameState, io);
        });
        
        socket.on('join', (data, callback) => handleJoin(socket, data, gameState, io, callback));
        socket.on('playerInput', input => handlePlayerInput(socket, input, gameState));
        socket.on('menuAction', data => handleMenuAction(socket, data, gameState, io));
        socket.on('leaveLobby', () => handleLeaveLobby(socket, gameState, io));
        socket.on('disconnect', () => handleDisconnect(socket, gameState, io));
        
        socket.on('setGameMode', (data, callback) => {
            gameState.mode = data.mode;
            gameState.npcCount = data.npcCount;
            gameState.npcDifficulty = data.difficulty;
            if(data.mode === 'single'){
                gameState.leader = socket.id;
            }
            if (typeof callback === 'function') {
                callback({ success: true });
            }
        });
    });
}

module.exports = {
    registerSocketHandlers
};