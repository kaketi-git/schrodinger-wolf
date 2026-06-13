const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// 部屋データを管理するオブジェクト
const rooms = {};

// 確率計算用ヘルパー
const chance = (percent) => Math.random() * 100 < percent;

io.on('connection', (socket) => {
    console.log(`[接続] Player: ${socket.id}`);

    // 1. 部屋の作成
    socket.on('createRoom', (playerName) => {
        // 4桁のランダムな英数字の部屋IDを生成
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        rooms[roomId] = {
            id: roomId,
            players: [],
            day: 1,
            phase: 'lobby',
            actions: {},
            votes: {},
            wolfId: null
        };
        joinRoomLogic(socket, roomId, playerName);
    });

    // 2. 部屋への参加
    socket.on('joinRoom', ({ roomId, playerName }) => {
        joinRoomLogic(socket, roomId, playerName);
    });

    // 入室処理の共通ロジック
    function joinRoomLogic(socket, roomId, playerName) {
        const room = rooms[roomId];
        if (room && room.phase === 'lobby') {
            room.players.push({ id: socket.id, name: playerName, role: null, isAlive: true });
            socket.join(roomId);
            
            // 自分に入室成功を通知
            socket.emit('joinedRoom', roomId);
            // 部屋の全員に最新のプレイヤーリストを送信
            io.to(roomId).emit('updatePlayers', room.players);
        } else {
            socket.emit('error', '部屋が見つからないか、既にゲームが開始されています。');
        }
    }

    // 3. ゲーム開始（役職の割り当て）
    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        // 開発テスト用に一時的に1人でも開始できるようにする場合は条件を変更できますが、本来は3人以上です
        // if (!room || room.players.length < 3) return io.to(socket.id).emit('error', '3人以上必要です');
        if (!room) return;

        // ここから役職割り当て等のゲーム進行処理を追加していきます
        room.phase = 'night_wolf';
        io.to(roomId).emit('phaseUpdated', { day: room.day, phase: '夜（人狼の行動）' });
    });

    // 切断時の処理
    socket.on('disconnect', () => {
        console.log(`[切断] Player: ${socket.id}`);
        // ※ 本格的な運用では、ここで部屋からプレイヤーを削除したり、切断状態を管理する処理が入ります
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});