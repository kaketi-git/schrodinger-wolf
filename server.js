const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, pingTimeout: 60000 });

app.use(express.static('public'));

const rooms = {};
const CITIZEN_ROLES = ['見習い占い師', 'ひねくれ者', '噂好きの市民', 'ギャンブラー', 'プロファイラー', 'トラッパー'];

// 確率計算関数
const chance = (percent) => Math.random() * 100 < percent;

io.on('connection', (socket) => {
    socket.on('createRoom', (playerName) => {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomId] = { id: roomId, players: [], day: 1, phase: 'lobby', actions: {}, votes: {}, wolfId: null, lastActive: Date.now() };
        joinRoomLogic(socket, roomId, playerName);
    });

    socket.on('joinRoom', ({ roomId, playerName }) => joinRoomLogic(socket, roomId, playerName));

    function joinRoomLogic(socket, roomId, playerName) {
        const room = rooms[roomId];
        if (room && room.phase === 'lobby') {
            room.lastActive = Date.now();
            room.players.push({ id: socket.id, name: playerName, role: null, isAlive: true });
            socket.join(roomId);
            socket.emit('joinedRoom', roomId);
            io.to(roomId).emit('updatePlayers', room.players);
        } else {
            socket.emit('error', '部屋が見つからないか、既に進行中です。');
        }
    }

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.players.length < 3) return io.to(socket.id).emit('error', '3人以上必要です');
        room.lastActive = Date.now();

        const wolfIndex = Math.floor(Math.random() * room.players.length);
        room.players.forEach((p, index) => {
            if (index === wolfIndex) { p.role = '人狼'; room.wolfId = p.id; }
            else { p.role = CITIZEN_ROLES[Math.floor(Math.random() * CITIZEN_ROLES.length)]; }
            io.to(p.id).emit('yourRole', p.role);
        });
        startPhase(room, 'night_wolf');
    });

    socket.on('submitAction', ({ roomId, targetId, actionType, guessRole }) => {
        const room = rooms[roomId];
        if(!room) return;
        room.lastActive = Date.now();
        room.actions[socket.id] = { targetId, actionType, guessRole };
        
        const alivePlayers = room.players.filter(p => p.isAlive);
        if (room.phase === 'night_wolf' && room.actions[room.wolfId]) {
            startPhase(room, 'night_citizen');
        } else if (room.phase === 'night_citizen' && Object.keys(room.actions).length >= alivePlayers.length) {
            resolveNightActions(room);
            startPhase(room, 'day_discuss');
        }
    });

    socket.on('submitVote', ({ roomId, targetId }) => {
        const room = rooms[roomId];
        if(!room) return;
        room.lastActive = Date.now();
        room.votes[socket.id] = targetId;

        const alivePlayers = room.players.filter(p => p.isAlive);
        if (Object.keys(room.votes).length >= alivePlayers.length) {
            resolveVotes(room);
        }
    });

    socket.on('submitWolfGuess', ({ roomId, guesses }) => {
        const room = rooms[roomId];
        if(!room) return;
        let correct = true;
        room.players.filter(p => p.role !== '人狼' && p.isAlive).forEach(p => {
            if (guesses[p.id] !== p.role) correct = false;
        });

        io.to(roomId).emit('gameOver', { 
            winner: correct ? '人狼の逆転勝利！(全役職的中)' : '市民の勝利！(役職当て失敗)', 
            players: room.players 
        });
    });

    function startPhase(room, phase) {
        room.phase = phase;
        if (phase === 'night_wolf') { room.actions = {}; room.votes = {}; }
        io.to(room.id).emit('phaseUpdated', { day: room.day, phase: room.phase, players: room.players });
    }

    // --- 夜の処理（ログの言い回しと能力の改修） ---
    function resolveNightActions(room) {
        const wolfAction = room.actions[room.wolfId] || {};
        let sysLogs = {};
        room.players.forEach(p => sysLogs[p.id] = []);

        // 1. トラッパーの処理
        let trappedWolf = false;
        room.players.filter(p => p.role === 'トラッパー' && p.isAlive).forEach(t => {
            const action = room.actions[t.id];
            if (action && (wolfAction.targetId === action.targetId)) {
                sysLogs[t.id].push(`【罠の発動】あなたが守った対象への人狼の妨害を阻止した（100%）`);
                trappedWolf = true;
            }
        });

        const jammerTarget = trappedWolf ? null : wolfAction.targetId;
        const jammerType = trappedWolf ? null : wolfAction.actionType;

        // 2. 各市民のアクション解決
        room.players.filter(p => p.role !== '人狼' && p.isAlive).forEach(p => {
            const act = room.actions[p.id];
            if (!act || !act.targetId) return;
            const targetPlayer = room.players.find(tp => tp.id === act.targetId);

            const isJammedAction = (jammerType === '1' && jammerTarget === p.id);
            const isJammedTarget = (jammerType === '2' && jammerTarget === act.targetId);
            const isJammed = isJammedAction || isJammedTarget;

            if (p.role === '見習い占い師') {
                let result = chance(60) ? (targetPlayer.role === '人狼') : (targetPlayer.role !== '人狼');
                if (isJammed) result = !result;
                sysLogs[p.id].push(`【占い結果】${targetPlayer.name} は「${result ? '人狼' : '市民陣営'}」だ（60%）`);
            }
            if (p.role === 'ひねくれ者') {
                // 通常は自分以外の役職が選ばれる。妨害時は嘘（自分が本当になっている役職）を教えられる
                let availableRoles = CITIZEN_ROLES.filter(r => r !== targetPlayer.role);
                let notRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];
                if (isJammed && targetPlayer.role !== '人狼') notRole = targetPlayer.role; 
                
                sysLogs[p.id].push(`【あら探し結果】${targetPlayer.name} は「${notRole}」ではない（100%）`);
            }
            if (p.role === '噂好きの市民') {
                // アクションを起こしたか、かけられたかの両方を判定
                let didAct = !!room.actions[targetPlayer.id];
                let wasTargeted = Object.values(room.actions).some(a => a.targetId === targetPlayer.id);

                if (isJammed) { didAct = !didAct; wasTargeted = !wasTargeted; }
                
                sysLogs[p.id].push(`【噂の調査】${targetPlayer.name} はアクションを「${didAct ? '起こした' : '起こしていない'}」（100%）`);
                sysLogs[p.id].push(`【噂の調査】${targetPlayer.name} はアクションを「${wasTargeted ? 'かけられた' : 'かけられていない'}」（100%）`);
            }
            if (p.role === 'ギャンブラー') {
                let result = (targetPlayer.role === '人狼');
                if (isJammed) result = !result;
                sysLogs[p.id].push(`【絶対占い結果】${targetPlayer.name} は「${result ? '人狼' : '市民陣営'}」だ（100%）`);
                if (targetPlayer.role !== '人狼') sysLogs[room.wolfId].push(`【警告】${p.name} がギャンブラーとして能力を使用しました。`);
            }
            if (p.role === 'プロファイラー') {
                // 確率を80%にアップ、言い回しを変更
                let isCorrect = (targetPlayer.role === act.guessRole);
                let result = chance(80) ? isCorrect : !isCorrect;
                if (isJammed) result = !result;
                
                sysLogs[p.id].push(`【プロファイル結果】${targetPlayer.name} は「${act.guessRole}」${result ? 'だ' : 'ではない'}（80%）`);
            }
        });

        Object.keys(sysLogs).forEach(id => {
            if (sysLogs[id].length > 0) io.to(id).emit('systemLogs', sysLogs[id]);
        });
    }

    function resolveVotes(room) {
        const voteCounts = {};
        Object.values(room.votes).forEach(tId => voteCounts[tId] = (voteCounts[tId] || 0) + 1);
        const maxVotes = Math.max(...Object.values(voteCounts));
        const targetId = Object.keys(voteCounts).find(id => voteCounts[id] === maxVotes);
        const targetPlayer = room.players.find(p => p.id === targetId);

        let publicLog = "";

        if (room.day >= 10) {
            targetPlayer.isAlive = false;
            publicLog = `【10日目 処刑】${targetPlayer.name} が処刑されました。`;
            io.to(room.id).emit('publicLog', publicLog);
            
            if (targetPlayer.role === '人狼') {
                room.phase = 'wolf_guess';
                io.to(room.id).emit('phaseUpdated', { day: room.day, phase: room.phase, players: room.players });
            } else {
                io.to(room.id).emit('gameOver', { winner: '人狼の逃げ切り勝利！', players: room.players });
            }
        } else {
            const wolfAction = room.actions[room.wolfId] || {};
            let isBlack = chance(60) ? (targetPlayer.role === '人狼') : (targetPlayer.role !== '人狼');

            if (targetPlayer.role === '人狼' && wolfAction.actionType === '3') isBlack = false;
            if (targetPlayer.role === 'ひねくれ者') isBlack = !isBlack;

            publicLog = `【公開投票結果】${targetPlayer.name} は「${isBlack ? '人狼' : '市民陣営'}」だ（60%）`;
            io.to(room.id).emit('publicLog', publicLog);
            
            room.day++;
            startPhase(room, 'night_wolf');
        }
    }
});

setInterval(() => {
    const now = Date.now();
    Object.keys(rooms).forEach(roomId => {
        if (now - rooms[roomId].lastActive > 2 * 60 * 60 * 1000) delete rooms[roomId];
    });
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));