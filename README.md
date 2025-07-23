# Dom Hell

DOM Hell is a web-based, bullet-hell style game played directly in your browser.

## install

1.**Clone the Repository**

```bash
  git clone https://github.com/9jxxi9/Web-game.git
  cd web-game 
```

2.**Install Dependencies**

```bash
npm install
```

3.**Ngrok setup**

```bash
npx ngrok authtoken <YOUR AUTH TOKEN>
```

4.**Start the Server**

```bash
npm start
```

The server will start on port 3000. An ngrok tunnel will also be established automatically for remote play.

## Controls

- **Movement**: Use the Arrow keys to move your character.
- **Menu**: Press the Menu button to pause, resume, restart, or exit the game.

## Game rules

- **Objective**: Survive by avoiding incoming projectiles and collecting green collectibles to earn points.
- **Lives**: Each player starts with 3 lives. Getting hit by a projectile costs a life.
- **Winning**: The game ends after 2 minutes, or when only one player remains. The winner is determined by either being the last player alive or having the highest score.
- **Multiplayer**: At least 2 players are required to start the game. Players join the lobby with a unique name.