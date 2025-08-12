require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const ngrok = require('ngrok');

const { initGameState, updateGame } = require('./game/logic');
const { registerSocketHandlers } = require('./game/socket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

app.use(express.static('public'));

let gameState = initGameState();
// admin storage field
gameState.adminId = null;

registerSocketHandlers(io, gameState);

setInterval(() => {
    updateGame(gameState, io);
    io.emit('gameState', gameState);
}, 16);

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // The first player to connect becomes the administrator
    if (!gameState.adminId) {
        gameState.adminId = socket.id;
        socket.emit('adminStatus', { isAdmin: true });
        console.log(`Admin set: ${socket.id}`);
    } else {
        socket.emit('adminStatus', { isAdmin: false });
    }

    socket.on('error', (err) => {
        console.error('Socket error:', err);
    });

    socket.on('disconnect', () => {
        // If the administrator has disconnected, appoint a new one from the remaining players
        if (socket.id === gameState.adminId) {
            const remainingPlayers = Object.keys(gameState.players).filter(id => id !== socket.id);
            if (remainingPlayers.length > 0) {
                gameState.adminId = remainingPlayers[0];
                io.to(gameState.adminId).emit('adminStatus', { isAdmin: true });
                console.log(`New admin assigned: ${gameState.adminId}`);
            } else {
                gameState.adminId = null;
                console.log('No admin - server empty');
            }
        }
    });
});

server.listen(port, async () => {
    console.log(`✅ Server running on port ${port}`);
    try {
        const url = await ngrok.connect(port);
        console.log(`🚀 ngrok tunnel established at: ${url}`);
    } catch (err) {
        console.error(`❌ ngrok process failed: ${err.message}`);
    }
});