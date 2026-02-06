const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// DATABASE
const DB_FILE = 'database.json';
let users = {};
if (fs.existsSync(DB_FILE)) { users = JSON.parse(fs.readFileSync(DB_FILE)); }

function saveDatabase() { fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2)); }

app.use(express.static(__dirname)); 

// GAME CONSTANTS
const COLORS = ['RED', 'GREEN', 'BLUE', 'YELLOW', 'PINK', 'WHITE'];
let timeLeft = 20;
let activePlayers = {}; 
let roundBets = []; 

// GAME LOOP
setInterval(() => {
    timeLeft--;
    if (timeLeft < 0) {
        let result = [COLORS[Math.floor(Math.random()*6)], COLORS[Math.floor(Math.random()*6)], COLORS[Math.floor(Math.random()*6)]];
        io.emit('game_result', result); 
        processWinners(result);         
        roundBets = [];
        timeLeft = 25; // 5 seconds to show result, then 20 for next round
    } else if (timeLeft <= 20) {
        io.emit('timer_update', timeLeft);
    }
}, 1000);

function processWinners(diceResult) {
    let userBets = {}; 
    roundBets.forEach(bet => {
        if(!userBets[bet.username]) userBets[bet.username] = { socketId: bet.socketId, bets: {} };
        if(!userBets[bet.username].bets[bet.color]) userBets[bet.username].bets[bet.color] = 0;
        userBets[bet.username].bets[bet.color] += bet.amount;
    });

    for (let [username, data] of Object.entries(userBets)) {
        let totalWin = 0;
        for(let [color, amount] of Object.entries(data.bets)) {
            let matches = diceResult.filter(die => die === color).length;
            if (matches > 0) {
                let multiplier = matches + 1;
                totalWin += amount * multiplier;
            }
        }
        if(totalWin > 0) {
            users[username].balance += totalWin;
            saveDatabase();
            io.to(data.socketId).emit('win_notification', { total: totalWin });
            io.to(data.socketId).emit('update_balance', users[username].balance);
        }
    }
}

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        if (!users[data.username]) {
            users[data.username] = { password: data.password, balance: 1000 };
            saveDatabase();
        }
        activePlayers[socket.id] = data.username;
        socket.emit('login_success', { username: data.username, balance: users[data.username].balance });
    });

    socket.on('place_bet', (data) => {
        let username = activePlayers[socket.id];
        if (username && users[username].balance >= data.amount) {
            users[username].balance -= data.amount;
            saveDatabase();
            roundBets.push({ socketId: socket.id, username: username, color: data.color, amount: data.amount });
        }
    });

    socket.on('disconnect', () => { delete activePlayers[socket.id]; });
});

// RAILWAY PORT BINDING
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
