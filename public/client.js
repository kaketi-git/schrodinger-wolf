const socket = io(); // 通信開始
let currentRoomId = '';

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ルールモーダルの開閉
function openRules() { document.getElementById('rules-modal').style.display = 'block'; }
function closeRules() { document.getElementById('rules-modal').style.display = 'none'; }

// モーダルの外枠をクリックしたら閉じる処理
window.onclick = function(event) {
    if (event.target == document.getElementById('rules-modal')) {
        closeRules();
    }
}

// --- 通信アクション ---
function createRoom() {
    const playerName = document.getElementById('playerName').value;
    if (!playerName) return alert("プレイヤー名を入力してください！");
    socket.emit('createRoom', playerName);
}

function joinRoom() {
    const playerName = document.getElementById('playerName').value;
    const roomId = document.getElementById('roomIdInput').value.toUpperCase();
    if (!playerName || !roomId) return alert("プレイヤー名と部屋IDを入力してください！");
    socket.emit('joinRoom', { roomId, playerName });
}

function startGame() {
    socket.emit('startGame', currentRoomId);
}

// --- サーバーからの受信処理 ---
socket.on('joinedRoom', (roomId) => {
    currentRoomId = roomId;
    document.getElementById('displayRoomId').innerText = roomId;
    showScreen('lobby-screen');
});

socket.on('updatePlayers', (players) => {
    const list = document.getElementById('playerList');
    list.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
});

socket.on('error', (msg) => {
    alert(msg);
});

// ゲーム開始時の遷移（仮）
socket.on('phaseUpdated', (data) => {
    document.getElementById('phaseDisplay').innerText = `Day ${data.day} - ${data.phase}`;
    showScreen('game-screen');
});