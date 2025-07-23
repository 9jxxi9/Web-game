require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const ngrok = require('ngrok');

const { initGameState, updateGame } = require('./game/logic');
const { registerSocketHandlers } = require('./game/socket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

app.use(express.static('public'));

let gameState = initGameState();
registerSocketHandlers(io, gameState);

setInterval(() => {
  updateGame(gameState, io);
  io.emit('gameState', gameState);
}, 16);

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  socket.on('error', (err) => {
    console.error('Socket error:', err);
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