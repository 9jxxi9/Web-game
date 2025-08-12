const { GAME_WIDTH, GAME_HEIGHT, PLAYER_SIZE, getRandomColor, GAME_MODES } = require('./constants');

function resetPrivateGame(gameState) {
    Object.assign(gameState.adminPrivateGame, {
        active: false,
        gameStarted: false,
        gameEnded: false,
        paused: false,
        players: {},
        bullets: [],
        collectibles: [],
        gameStartTime: null
    });
}

function scheduleSinglePlayerControlsReturn(gameState, io) {
    if (gameState.adminId) {
        setTimeout(() => {
            io.to(gameState.adminId).emit('enableSinglePlayerControls');
        }, 5500);
    }
}


function resetGameState(gameState) {
    const adminId = gameState.adminId;
    gameState.players = {};
    gameState.bullets = [];
    gameState.collectibles = [];
    gameState.npcs = [];
    gameState.mode = null;
    gameState.leader = null;
    gameState.paused = false;
    gameState.gameStarted = false;
    gameState.gameEnded = false;
    gameState.gameStartTime = null;
    gameState.adminId = adminId;

    gameState.adminPrivateGame = {
        active: false,
        players: {},
        bullets: [],
        collectibles: [],
        gameStartTime: null,
        paused: false,
        gameEnded: false,
        gameStarted: false
    };
}

function isAdmin(socket, gameState) {
    return socket.id === gameState.adminId;
}

function handleStartGame(socket, gameState, io) {
    if (!isAdmin(socket, gameState)) {
        socket.emit('gameMessage', 'Only admin can start the game.');
        return;
    }

    console.log("[SERVER] StartGame processing by admin. Current mode:", gameState.mode);
    console.log(`gameState: ${JSON.stringify(gameState)}`)

    if (gameState.mode === GAME_MODES.SINGLE) {
        console.log("[SERVER] Admin launching Private Single Player. NPCs:", gameState.npcs.length);

        gameState.players = {};

        gameState.adminPrivateGame = {
            active: true,
            players: {},
            bullets: [],
            collectibles: [],
            gameStartTime: Date.now(),
            paused: false,
            gameEnded: false,
            gameStarted: true,
            adminId: gameState?.adminId || null,
        };

        gameState.adminPrivateGame.players[socket.id] = {
            id: socket.id,
            name: 'Admin Player',
            x: Math.random() * (GAME_WIDTH - PLAYER_SIZE),
            y: Math.random() * (GAME_HEIGHT - PLAYER_SIZE),
            score: 0,
            lives: 3,
            alive: true,
            color: getRandomColor(),
            inputs: {},
            isNPC: false,
            isAdmin: true
        };

        gameState.npcs.forEach((npcConfig, index) => {
            const npcId = `npc_${Date.now()}_${index}`;
            const { name, difficulty, speed, reaction, evasion } = npcConfig;

            gameState.adminPrivateGame.players[npcId] = {
                id: npcId,
                name: name || `NPC-${index + 1}`,
                x: Math.random() * (GAME_WIDTH - PLAYER_SIZE),
                y: Math.random() * (GAME_HEIGHT - PLAYER_SIZE),
                score: 0,
                lives: 3,
                alive: true,
                color: '#666666',
                inputs: {},
                isNPC: true,
                isAdmin: false,
                difficulty: difficulty || 'custom',
                customConfig: {
                    speed: speed || 3,
                    reaction: reaction || 400,
                    evasion: evasion || 0.3
                }
            };
        });

        socket.emit('adminGameStarted', gameState.adminPrivateGame);
        console.log("[SERVER] Private GameStarted event sent to admin only");
        return;
    }

    if (gameState.mode === GAME_MODES.MULTI) {
        if (gameState.adminPrivateGame.active) {
            gameState.adminPrivateGame.active = false;
            gameState.adminPrivateGame.gameStarted = false;
            socket.emit('adminGameOver', { reason: 'Switched to multiplayer' });
        }

        gameState.npcs = [];

        if (Object.keys(gameState.players).length < 2) {
            socket.emit('gameMessage', 'Need at least 2 players for multiplayer');
            return;
        }

        if (!gameState.gameStarted) {
            gameState.gameStarted = true;
            gameState.gameStartTime = Date.now();
            io.emit('gameStarted', gameState);
            io.emit('gameMessage', 'Admin started multiplayer game!');
        }
    }
}


function handlePlayerInput(socket, input, gameState) {

    if (isAdmin(socket, gameState) && gameState.adminPrivateGame.active) {
        const player = gameState.adminPrivateGame.players[socket.id];
        if (player && player.alive && gameState.adminPrivateGame.gameStarted) {
            player.inputs[input.key] = input.state;
        }
        return;
    }

    const player = gameState.players[socket.id];
    if (player && player.alive && gameState.gameStarted) {
        player.inputs[input.key] = input.state;
    }
}

function handleMenuAction(socket, data, gameState, io) {
    if (data.action === 'quit') {
        if (!gameState.adminPrivateGame.active) {
            if (gameState.players[socket.id].alive) {
                gameState.players[socket.id].alive = false;
            }
        }
    }
    if (!isAdmin(socket, gameState)) {
        socket.emit('gameMessage', 'Only admin can control the game.');
        return;
    }

    if (gameState.adminPrivateGame.active) {
        socket.emit('adminGameMessage', `Admin ${data.action} single player game.`);
        if (data.action === 'pause') {
            gameState.adminPrivateGame.paused = true;
        } else if (data.action === 'resume') {
            gameState.adminPrivateGame.paused = false;
        } else if (data.action === 'restart') {

            gameState.adminPrivateGame.paused = false;
            gameState.adminPrivateGame.gameStarted = true;
            gameState.adminPrivateGame.bullets = [];
            gameState.adminPrivateGame.collectibles = [];
            gameState.adminPrivateGame.gameStartTime = Date.now();
            gameState.adminPrivateGame.gameEnded = false;

            Object.keys(gameState.adminPrivateGame.players).forEach(id => {
                const p = gameState.adminPrivateGame.players[id];
                p.score = 0;
                p.lives = 3;
                p.alive = true;
                p.x = Math.floor(Math.random() * (GAME_WIDTH - PLAYER_SIZE));
                p.y = Math.floor(Math.random() * (GAME_HEIGHT - PLAYER_SIZE));
                p.inputs = {};
            });

            socket.emit('adminGameStarted', gameState.adminPrivateGame);
        } else if (data.action === 'quit') {

            resetPrivateGame(gameState);
            socket.emit('adminGameOver', { reason: 'Admin quit single player' });
            scheduleSinglePlayerControlsReturn(gameState, io);
        }
        return;
    }

    const player = gameState.players[socket.id];
    if (player && gameState.gameStarted) {
        io.emit('gameMessage', `Admin ${data.action} the game.`);
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
            io.emit('gameMessage', `Admin restarted the game.`);
            io.emit('gameStarted', gameState);
        } else if (data.action === 'quit') {
            io.emit('gameMessage', 'Admin ended the game.');
            io.emit('gameOver', { reason: 'Admin ended game' });
            resetGameState(gameState);
            scheduleSinglePlayerControlsReturn(gameState, io);
        }
    }
}

function handleJoin(socket, data, gameState, io, callback) {
    if (gameState.adminPrivateGame && gameState.adminPrivateGame.active && !isAdmin(socket, gameState)) {
        socket.emit('joinError', { error: 'Admin is playing single player game' });
        if (callback) callback({ error: 'Admin is playing single player game' });
        return;
    }

    if (gameState.mode === GAME_MODES.SINGLE && !isAdmin(socket, gameState)) {
        socket.emit('joinError', { error: 'Single player mode active - only admin can control' });
        if (callback) callback({ error: 'Single player mode active - only admin can control' });
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
        inputs: {},
        isAdmin: isAdmin(socket, gameState)
    };
    socket.emit('joinSuccess', gameState.players[socket.id]);
    io.emit('lobbyUpdate', gameState.players);
    io.emit('gameMessage', `${data.name} joined the lobby.`);
    if (callback) callback({ success: true });
}

function handleLeaveLobby(socket, gameState, io) {
    if (gameState.players[socket.id]) {
        const playerName = gameState.players[socket.id].name;

        if (isAdmin(socket, gameState)) {
            if (gameState.adminPrivateGame.active) {
                gameState.adminPrivateGame.active = false;
                gameState.adminPrivateGame.gameStarted = false;
                socket.emit('adminGameOver', { reason: 'Admin left single player' });
            }

            io.emit('gameMessage', `Admin ${playerName} left the lobby. Game ended.`);
            io.emit('gameOver', { reason: 'Admin left the game' });

            Object.keys(gameState.players).forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('forceReturnToMenu');
                }
            });

            resetGameState(gameState);
            scheduleSinglePlayerControlsReturn(gameState, io);
            return;
        }

        io.emit('gameMessage', `${playerName} has left the lobby.`);
        delete gameState.players[socket.id];
        io.emit('lobbyUpdate', gameState.players);
    }
}

function handleDisconnect(socket, gameState, io) {
    if (gameState.players[socket.id]) {
        const playerName = gameState.players[socket.id].name;

        if (isAdmin(socket, gameState)) {
            console.log(`[SERVER] Admin ${playerName} disconnected - ending game for all players`);

            if (gameState.adminPrivateGame.active) {
                gameState.adminPrivateGame.active = false;
                gameState.adminPrivateGame.gameStarted = false;
            }

            Object.keys(gameState.players).forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('gameMessage', `Admin ${playerName} disconnected. Game ended.`);
                    io.to(playerId).emit('gameOver', { reason: 'Admin disconnected' });
                    io.to(playerId).emit('forceReturnToMenu');
                }
            });

            resetGameState(gameState);
            gameState.adminId = null;
            scheduleSinglePlayerControlsReturn(gameState, io);
            return;
        }

        io.emit('gameMessage', `${playerName} has disconnected.`);
        delete gameState.players[socket.id];
        io.emit('lobbyUpdate', gameState.players);
    }
}

function registerSocketHandlers(io, gameState) {
    io.on('connection', socket => {
        console.log('A new player connected:', socket.id);

        socket.on('startGame', () => {
            console.log("[SERVER] StartGame request received from:", socket.id, "Is admin:", isAdmin(socket, gameState));
            handleStartGame(socket, gameState, io);
        });

        socket.on('join', (data, callback) => handleJoin(socket, data, gameState, io, callback));
        socket.on('playerInput', input => handlePlayerInput(socket, input, gameState));
        socket.on('menuAction', data => handleMenuAction(socket, data, gameState, io));
        socket.on('leaveLobby', () => handleLeaveLobby(socket, gameState, io));
        socket.on('disconnect', () => handleDisconnect(socket, gameState, io));

        socket.on('setGameMode', (data, callback) => {
            if (!isAdmin(socket, gameState)) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Only admin can change game mode' });
                }
                socket.emit('gameMessage', 'Only admin can change game mode.');
                return;
            }

            if (data.mode === 'single') {
                gameState.adminPrivateGame = {
                    active: false,
                    players: {},
                    bullets: [],
                    collectibles: [],
                    gameStartTime: null,
                    paused: false,
                    gameEnded: false,
                    gameStarted: false
                };

                gameState.mode = data.mode;
                gameState.leader = socket.id;
                gameState.npcs = data.npcs || [];
                console.log("[SERVER] Admin set single player mode with", gameState.npcs.length, "NPCs");

            } else if (data.mode === 'multi') {
                if (gameState.adminPrivateGame.active) {
                    gameState.adminPrivateGame.active = false;
                    gameState.adminPrivateGame.gameStarted = false;
                    socket.emit('adminGameOver', { reason: 'Mode changed' });
                }
                gameState.mode = data.mode;
                gameState.npcs = [];
                gameState.leader = null;
                console.log("[SERVER] Admin set multiplayer mode");

            } else if (data.mode === 'none') {
                resetGameState(gameState);
                console.log("[SERVER] Admin reset game state");
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