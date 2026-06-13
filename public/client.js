const socket = io();
let currentRoomId = '';
let myRole = '';
let roomPlayers = [];
const rolesList = ['見習い占い師', 'ひねくれ者', '噂好きの市民', 'ギャンブラー', 'プロファイラー', 'トラッパー'];

// 役職と画像のファイル名の紐付け
const roleImageMap = {
    '人狼': 'wolf.png',
    '見習い占い師': 'seer.png',
    'ひねくれ者': 'twisted.png',
    '噂好きの市民': 'gossip.png',
    'ギャンブラー': 'gambler.png',
    'プロファイラー': 'profiler.png',
    'トラッパー': 'trapper.png'
};

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

// ★ 役職を受け取った時に画像も切り替える
socket.on('yourRole', (role) => {
    myRole = role;
    document.getElementById('myRoleDisplay').innerText = role;
    
    // 画像を動的に設定
    const imgElement = document.getElementById('roleImage');
    if (roleImageMap[role]) {
        imgElement.src = `images/${roleImageMap[role]}`;
        imgElement.style.display = 'block';
    }
});

// 以下、前回のコードと同じ（phaseUpdated, renderActionUI など）...
socket.on('phaseUpdated', (data) => {
    roomPlayers = data.players;
    const phaseNames = { night_wolf: '夜 (人狼の行動)', night_citizen: '夜 (市民の行動)', day_discuss: '昼 (議論)', wolf_guess: '最終日 (役職当て)' };
    document.getElementById('phaseDisplay').innerText = `Day ${data.day} - ${phaseNames[data.phase] || data.phase}`;
    renderActionUI(data.phase, data.day);
    showScreen('game-screen');
});

socket.on('systemLogs', logs => {
    const box = document.getElementById('logArea');
    logs.forEach(l => box.innerHTML += `<div style="color: var(--accent-gold); margin-bottom: 5px; line-height: 1.4;">${l}</div>`);
    box.scrollTop = box.scrollHeight;
});

socket.on('publicLog', log => {
    const box = document.getElementById('logArea');
    box.innerHTML += `<div style="color: white; font-weight: bold; margin-top: 10px; margin-bottom: 5px; border-bottom: 1px solid #333; padding-bottom: 5px;">【全体通知】${log}</div>`;
    box.scrollTop = box.scrollHeight;
});

socket.on('gameOver', data => {
    document.getElementById('winnerText').innerText = data.winner;
    document.getElementById('resultDetails').innerHTML = data.players.map(p => `<p>${p.name} : ${p.role}</p>`).join('');
    showScreen('result-screen');
});

// --- UIの自動生成ロジック ---
function renderActionUI(phase, day) {
    const area = document.getElementById('actionArea');
    area.innerHTML = '';
    
    // 自分のデータと、生きている全プレイヤー（自分を含む）のリストを取得
    const me = roomPlayers.find(p => p.id === socket.id);
    const alivePlayers = roomPlayers.filter(p => p.isAlive);
    
    // ターゲット選択のベースHTML（スキップ ＋ 全員）
    const baseOptions = `<option value="skip">能力を使わない (待機)</option>` + 
                        alivePlayers.map(p => `<option value="${p.id}">${p.id === socket.id ? p.name + ' (自分)' : p.name}</option>`).join('');

    if (phase === 'night_wolf') {
        if (myRole === '人狼') {
            area.innerHTML = `
                <p>対象とスキルを選択</p>
                <select id="skill" style="width:100%; margin-bottom:10px;" onchange="updateWolfTarget()">
                    <option value="1">能力1: 思考妨害 (対象の能力結果を嘘にする)</option>
                    <option value="2">能力2: 情報妨害 (対象を占った人に嘘を見せる)</option>
                    <option value="3">能力3: 擬態 (今日占われても確定で白が出る)</option>
                </select>
                <select id="target" style="width:100%;">${baseOptions}</select>
                <button onclick="submitAction()" class="btn primary mt-20">行動決定</button>
            `;
        } else {
            area.innerHTML = `<p style="color: var(--text-sub);">人狼が行動中です。お待ちください...</p>`;
        }
    } else if (phase === 'night_citizen') {
        if (myRole !== '人狼') {
            // ギャンブラーが既に使用済みの場合の専用UI
            if (myRole === 'ギャンブラー' && me && me.hasUsedGambler) {
                area.innerHTML = `
                    <p style="color: var(--accent-gold); font-weight:bold;">※絶対占いは既に使用済みです。</p>
                    <select id="target" style="display:none;"><option value="skip">skip</option></select>
                    <button onclick="submitAction()" class="btn secondary mt-20">待機する</button>
                `;
            } else {
                let extraUI = '';
                if (myRole === 'プロファイラー') {
                    extraUI = `<p style="margin-top:10px;">予想する役職</p><select id="guessRole" style="width:100%;">${rolesList.map(r => `<option value="${r}">${r}</option>`).join('')}</select>`;
                }
                area.innerHTML = `<p>能力の対象を選択</p><select id="target" style="width:100%;">${baseOptions}</select> ${extraUI} <button onclick="submitAction()" class="btn primary mt-20">行動決定</button>`;
            }
        } else {
            area.innerHTML = `<p style="color: var(--text-sub);">市民が行動中です。お待ちください...</p>`;
        }
    } else if (phase === 'day_discuss') {
        const voteBtnText = day >= 10 ? '処刑する人に投票' : '公開占いする人に投票';
        // 投票は自分以外も選べるが、スキップはできない仕様とする
        area.innerHTML = `<p>議論終了後、投票してください</p><select id="target" style="width:100%;">${alivePlayers.map(p => `<option value="${p.id}">${p.id === socket.id ? p.name + ' (自分)' : p.name}</option>`).join('')}</select><button onclick="submitVote()" class="btn primary mt-20">${voteBtnText}</button>`;
    } else if (phase === 'wolf_guess') {
        if (myRole === '人狼') {
            let guessUI = '<p>生存している市民の役職をすべて当ててください</p>';
            alivePlayers.filter(p => p.id !== socket.id).forEach(p => {
                guessUI += `<div style="margin-bottom:10px;">${p.name}: <select class="wolf-guess" data-id="${p.id}" style="width:100%;">${rolesList.map(r => `<option value="${r}">${r}</option>`).join('')}</select></div>`;
            });
            area.innerHTML = guessUI + `<button onclick="submitWolfGuess()" class="btn primary mt-20">ファイナルアンサー</button>`;
        } else {
            area.innerHTML = `<p style="color: var(--text-sub);">人狼が役職を推理中です...</p>`;
        }
    }
}

// 人狼のスキル選択によってターゲットを自動切り替えする関数（グローバルスコープ）
window.updateWolfTarget = function() {
    const skill = document.getElementById('skill').value;
    const targetSelect = document.getElementById('target');
    
    if (skill === '3') {
        // 能力3：擬態 を選んだ場合は、強制的に自分のみ選択可能にする
        targetSelect.innerHTML = `<option value="${socket.id}">自分</option>`;
    } else {
        // それ以外は通常通り全員＋スキップ
        const alivePlayers = roomPlayers.filter(p => p.isAlive);
        targetSelect.innerHTML = `<option value="skip">能力を使わない (待機)</option>` + 
                                 alivePlayers.map(p => `<option value="${p.id}">${p.id === socket.id ? p.name + ' (自分)' : p.name}</option>`).join('');
    }
};

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