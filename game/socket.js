const { GAME_WIDTH, GAME_HEIGHT, PLAYER_SIZE, getRandomColor, GAME_MODES } = require('./constants');

function resetGameState(gameState) {
    const adminId = gameState.adminId; // Save the admin
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
    gameState.adminId = adminId; // Restoring admin
}

function isAdmin(socket, gameState) {
    return socket.id === gameState.adminId;
}

function handleJoin(socket, data, gameState, io, callback) {
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

function handlePlayerInput(socket, input, gameState) {
    const player = gameState.players[socket.id];
    if (player && player.alive && gameState.gameStarted) {
        player.inputs[input.key] = input.state;
    }
}

function handleMenuAction(socket, data, gameState, io) {
    // Checking administrator rights to manage the game
    if (!isAdmin(socket, gameState)) {
        socket.emit('gameMessage', 'Only admin can control the game.');
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
            // Admin ends the game for everyone and returns to the main menu
            io.emit('gameMessage', 'Admin ended the game.');
            io.emit('gameOver', { reason: 'Admin ended game' });
            resetGameState(gameState);
        }
    }
}

function handleLeaveLobby(socket, gameState, io) {
    if (gameState.players[socket.id]) {
        const playerName = gameState.players[socket.id].name;

        // If the admin leaves the lobby - we end the game for everyone
        if (isAdmin(socket, gameState)) {
            io.emit('gameMessage', `Admin ${playerName} left the lobby. Game ended.`);
            io.emit('gameOver', { reason: 'Admin left the game' });

            // Send all remaining players to the main screen
            Object.keys(gameState.players).forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('forceReturnToMenu');
                }
            });

            resetGameState(gameState);
            return;
        }

        // regular player leaves the lobby
        io.emit('gameMessage', `${playerName} has left the lobby.`);
        delete gameState.players[socket.id];
        io.emit('lobbyUpdate', gameState.players);
    }
}

function handleStartGame(socket, gameState, io) {
    // Only administrator can run games
    if (!isAdmin(socket, gameState)) {
        socket.emit('gameMessage', 'Only admin can start the game.');
        return;
    }

    console.log("[SERVER] StartGame processing by admin. Current mode:", gameState.mode);

    if (gameState.mode === GAME_MODES.SINGLE) {
        console.log("[SERVER] Admin launching Single Player. NPCs:", gameState.npcs.length);

        gameState.players = {};
        gameState.bullets = [];
        gameState.collectibles = [];
        gameState.gameStarted = true;
        gameState.gameStartTime = Date.now();

        // Admin plays as the only real player
        gameState.players[socket.id] = {
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

            gameState.players[npcId] = {
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
                    speed,
                    reaction,
                    evasion
                }
            };
        });

        io.emit('gameStarted', gameState);
        console.log("[SERVER] GameStarted event sent by admin");
        return;
    }

    if (gameState.mode === GAME_MODES.MULTI) {
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

    console.log('Admin starting game in mode:', gameState.mode);
    console.log('Players:', Object.keys(gameState.players));
    console.log('NPC count:', gameState.npcs.length);
}

function handleDisconnect(socket, gameState, io) {
    if (gameState.players[socket.id]) {
        const playerName = gameState.players[socket.id].name;

        // If the admin disconnected, end the game for everyone
        if (isAdmin(socket, gameState)) {
            console.log(`[SERVER] Admin ${playerName} disconnected - ending game for all players`);

            // notify all other players
            Object.keys(gameState.players).forEach(playerId => {
                if (playerId !== socket.id) {
                    io.to(playerId).emit('gameMessage', `Admin ${playerName} disconnected. Game ended.`);
                    io.to(playerId).emit('gameOver', { reason: 'Admin disconnected' });
                    io.to(playerId).emit('forceReturnToMenu');
                }
            });

            // Reset the game state completely
            resetGameState(gameState);
            gameState.adminId = null; // remove the admin completely
            return;
        }

        // The regular player has disconnected
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
            // Only the administrator can change the game mode.
            if (!isAdmin(socket, gameState)) {
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'Only admin can change game mode' });
                }
                socket.emit('gameMessage', 'Only admin can change game mode.');
                return;
            }

            gameState.mode = data.mode;

            if (data.mode === 'single') {
                gameState.leader = socket.id;
                gameState.npcs = data.npcs || [];
                console.log("[SERVER] Admin set single player mode with", gameState.npcs.length, "NPCs");
            } else if (data.mode === 'multi') {
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