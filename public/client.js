const socket = io();
let currentRoomId = '';
let myRole = '';
let roomPlayers = [];
const rolesList = ['見習い占い師', 'ひねくれ者', '噂好きの市民', 'ギャンブラー', 'プロファイラー', 'トラッパー'];

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function openRules() { document.getElementById('rules-modal').style.display = 'block'; }
function closeRules() { document.getElementById('rules-modal').style.display = 'none'; }
window.onclick = function(event) { if (event.target == document.getElementById('rules-modal')) closeRules(); }

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

function startGame() { socket.emit('startGame', currentRoomId); }

socket.on('joinedRoom', (roomId) => {
    currentRoomId = roomId;
    document.getElementById('displayRoomId').innerText = roomId;
    showScreen('lobby-screen');
});

socket.on('updatePlayers', (players) => {
    roomPlayers = players;
    document.getElementById('playerList').innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
});

socket.on('error', (msg) => alert(msg));

socket.on('yourRole', (role) => {
    myRole = role;
    document.getElementById('myRoleDisplay').innerText = role;
});

// フェイズ更新とUIの自動生成
socket.on('phaseUpdated', (data) => {
    roomPlayers = data.players;
    const phaseNames = { night_wolf: '夜 (人狼の行動)', night_citizen: '夜 (市民の行動)', day_discuss: '昼 (議論)', wolf_guess: '最終日 (役職当て)' };
    document.getElementById('phaseDisplay').innerText = `Day ${data.day} - ${phaseNames[data.phase] || data.phase}`;
    renderActionUI(data.phase, data.day);
    showScreen('game-screen');
});

// ログの受信
socket.on('systemLogs', logs => {
    const box = document.getElementById('logArea');
    logs.forEach(l => box.innerHTML += `<div style="color: var(--accent-gold); margin-bottom: 5px;">【個別通知】${l}</div>`);
    box.scrollTop = box.scrollHeight;
});

socket.on('publicLog', log => {
    const box = document.getElementById('logArea');
    box.innerHTML += `<div style="color: white; font-weight: bold; margin-top: 10px; border-bottom: 1px solid #333;">【全体通知】${log}</div>`;
    box.scrollTop = box.scrollHeight;
});

// ゲーム終了
socket.on('gameOver', data => {
    document.getElementById('winnerText').innerText = data.winner;
    document.getElementById('resultDetails').innerHTML = data.players.map(p => `<p>${p.name} : ${p.role}</p>`).join('');
    showScreen('result-screen');
});

// UI生成ロジック
function renderActionUI(phase, day) {
    const area = document.getElementById('actionArea');
    area.innerHTML = '';
    const aliveOthers = roomPlayers.filter(p => p.isAlive && p.id !== socket.id);
    let options = aliveOthers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    if (phase === 'night_wolf') {
        if (myRole === '人狼') {
            area.innerHTML = `
                <p>対象とスキルを選択</p>
                <select id="target" style="width:100%; margin-bottom:10px;">${options}</select>
                <select id="skill" style="width:100%;">
                    <option value="1">能力1: 思考妨害 (対象の能力結果を嘘にする)</option>
                    <option value="2">能力2: 情報妨害 (対象を占った人に嘘を見せる)</option>
                    <option value="3">能力3: 擬態 (今日占われても確定で白が出る)</option>
                </select>
                <button onclick="submitAction()" class="btn primary mt-20">行動決定</button>
            `;
        } else {
            area.innerHTML = `<p style="color: var(--text-sub);">人狼が行動中です。お待ちください...</p>`;
        }
    } else if (phase === 'night_citizen') {
        if (myRole !== '人狼') {
            let extraUI = '';
            if (myRole === 'プロファイラー') {
                extraUI = `<select id="guessRole" style="width:100%; margin-top:10px;">${rolesList.map(r => `<option value="${r}">${r}</option>`).join('')}</select>`;
            }
            area.innerHTML = `<p>能力の対象を選択</p><select id="target" style="width:100%;">${options}</select> ${extraUI} <button onclick="submitAction()" class="btn primary mt-20">行動決定</button>`;
        } else {
            area.innerHTML = `<p style="color: var(--text-sub);">市民が行動中です。お待ちください...</p>`;
        }
    } else if (phase === 'day_discuss') {
        const voteBtnText = day >= 10 ? '処刑する人に投票' : '公開占いする人に投票';
        area.innerHTML = `<p>議論終了後、投票してください</p><select id="target" style="width:100%;">${roomPlayers.filter(p=>p.isAlive).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select><button onclick="submitVote()" class="btn primary mt-20">${voteBtnText}</button>`;
    } else if (phase === 'wolf_guess') {
        if (myRole === '人狼') {
            let guessUI = '<p>生存している市民の役職をすべて当ててください</p>';
            aliveOthers.forEach(p => {
                guessUI += `<div style="margin-bottom:10px;">${p.name}: <select class="wolf-guess" data-id="${p.id}" style="width:100%;">${rolesList.map(r => `<option value="${r}">${r}</option>`).join('')}</select></div>`;
            });
            area.innerHTML = guessUI + `<button onclick="submitWolfGuess()" class="btn primary mt-20">ファイナルアンサー</button>`;
        } else {
            area.innerHTML = `<p style="color: var(--text-sub);">人狼が役職を推理中です...</p>`;
        }
    }
}

function submitAction() {
    socket.emit('submitAction', { 
        roomId: currentRoomId, 
        targetId: document.getElementById('target')?.value, 
        actionType: document.getElementById('skill')?.value,
        guessRole: document.getElementById('guessRole')?.value
    });
    document.getElementById('actionArea').innerHTML = '<p>他のプレイヤーを待機中...</p>';
}

function submitVote() {
    socket.emit('submitVote', { roomId: currentRoomId, targetId: document.getElementById('target').value });
    document.getElementById('actionArea').innerHTML = '<p>他のプレイヤーの投票を待機中...</p>';
}

function submitWolfGuess() {
    let guesses = {};
    document.querySelectorAll('.wolf-guess').forEach(sel => guesses[sel.getAttribute('data-id')] = sel.value);
    socket.emit('submitWolfGuess', { roomId: currentRoomId, guesses });
}