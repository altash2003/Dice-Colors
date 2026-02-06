const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DB_FILE = 'database.json';
let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};

app.use(express.static(__dirname));
const COLORS = ['RED', 'GREEN', 'BLUE', 'YELLOW', 'PINK', 'WHITE'];
let timeLeft = 20;
let roundBets = [];
let activePlayers = {};

setInterval(() => {
    timeLeft--;
    if (timeLeft < 0) {
        let result = [COLORS[Math.floor(Math.random()*6)], COLORS[Math.floor(Math.random()*6)], COLORS[Math.floor(Math.random()*6)]];
        io.emit('game_result', result);
        processWinners(result);
        roundBets = [];
        timeLeft = 25; // Reset cycle
    } else if (timeLeft <= 20) {
        io.emit('timer_update', timeLeft);
    }
}, 1000);

function processWinners(diceResult) {
    let userWins = {};
    roundBets.forEach(bet => {
        let matches = diceResult.filter(d => d === bet.color).length;
        if (matches > 0) {
            let win = bet.amount * (matches + 1);
            userWins[bet.username] = (userWins[bet.username] || 0) + win;
            users[bet.username].balance += win;
        }
    });
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    for (let user in userWins) {
        let sid = Object.keys(activePlayers).find(k => activePlayers[k] === user);
        if (sid) {
            io.to(sid).emit('win_notification', { total: userWins[user] });
            io.to(sid).emit('update_balance', users[user].balance);
        }
    }
}

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        if (!users[data.username]) users[data.username] = { password: data.password, balance: 1000 };
        activePlayers[socket.id] = data.username;
        socket.emit('login_success', { username: data.username, balance: users[data.username].balance });
    });

    socket.on('place_bet', (data) => {
        let user = activePlayers[socket.id];
        if (user && users[user].balance >= data.amount) {
            users[user].balance -= data.amount;
            roundBets.push({ username: user, color: data.color, amount: data.amount });
        }
    });

    socket.on('disconnect', () => delete activePlayers[socket.id]);
});

server.listen(3000, () => console.log('Server live on port 3000'));
