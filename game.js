// État du jeu
const state = {
    players: [], // { name: "Ben", score: 0 }
    currentPlayerIndex: 0,
    currentChain: "",
    dictionary: new Set(),
    isGameActive: false
};

let gameState = "menu"; // "menu" | "playing"

// Configuration
const CONFIG = {
    minPlayers: 2,
    currentLang: 'fr',
    dictPath: 'dict/fr.txt'
};

// Dictionnaire de secours
const DICTIONNAIRE = [
    "CHAT", "CHIEN", "MAISON", "TABLE", "ARBRE", "FLEUR", "SOLEIL",
    "LUNE", "EAU", "FEU", "TERRE", "CIEL", "ROUGE", "BLEU", "VERT",
    "JAUNE", "NOIR", "BLANC", "LIVRE", "STYLO", "PORTE", "FENETRE",
    "JEU", "JOUEUR", "GAGNER", "PERDRE", "MOT", "LETTRE", "TRAP",
    "GRAVITY", "CODE", "WEB", "HTML", "CSS", "SCRIPT", "LISTE"
];

// Éléments du DOM (Mise à jour pour nouvelle structure)
const dom = {
    screens: {
        // 'menu' n'existe plus en tant que container global, 
        // on utilise setup comme écran principal
        setup: document.getElementById('setup-screen'),
        game: document.getElementById('screen-game')
    },
    setup: {
        inputName: document.getElementById('new-player-name'),
        btnAdd: document.getElementById('add-player-btn'),
        list: document.getElementById('players-list'),
        startBtn: document.getElementById('start-game-btn')
    },
    game: {
        modeTitle: document.getElementById('mode-title'),
        currentPlayerName: document.getElementById('current-player-name'),
        currentChain: document.getElementById('current-chain'),
        keyboardArea: document.getElementById('keyboard-area'),
        deleteBtn: document.getElementById('delete-btn'),
        challengeBtn: document.getElementById('challenge-btn'),
        messageArea: document.getElementById('message-area'),
        scoresList: document.getElementById('scores-list'),
        menuBtn: document.getElementById('menu-btn'),
        menu: document.getElementById('game-menu'),
        menuBackdrop: document.getElementById('menu-backdrop')
    }
};

// --- Gestion des Joueurs (Setup) ---
let setupPlayers = [];

function updatePlayerListUI() {
    dom.setup.list.innerHTML = "";
    setupPlayers.forEach((name, index) => {
        const div = document.createElement('div');
        div.className = "player-item"; // Assurez-vous d'avoir du CSS pour ça ou c'est juste du texte
        div.style.cssText = "display:flex; justify-content:space-between; padding:8px; background:rgba(255,255,255,0.1); margin-bottom:5px; border-radius:8px;";
        div.innerHTML = `<span>${name}</span> <span style="cursor:pointer; color:red;" onclick="removeSetupPlayer(${index})">🗑️</span>`;
        dom.setup.list.appendChild(div);
    });

    if (dom.setup.startBtn) {
        dom.setup.startBtn.disabled = setupPlayers.length < CONFIG.minPlayers;
        if (setupPlayers.length >= CONFIG.minPlayers) {
            dom.setup.startBtn.textContent = `Lancer (${setupPlayers.length})`;
        } else {
            dom.setup.startBtn.textContent = `Ajoutez des joueurs (${setupPlayers.length}/${CONFIG.minPlayers})`;
        }
    }
}

function addSetupPlayer() {
    const name = dom.setup.inputName.value.trim();
    if (!name) return;
    if (setupPlayers.includes(name)) {
        alert("Ce nom est déjà pris !");
        return;
    }
    setupPlayers.push(name);
    dom.setup.inputName.value = "";
    updatePlayerListUI();
    dom.setup.inputName.focus();
}

window.removeSetupPlayer = function (index) {
    setupPlayers.splice(index, 1);
    updatePlayerListUI();
};


// --- Gestion de l'état global ---
function updateGameState(newState) {
    gameState = newState;
    console.log("gameState:", gameState);

    if (gameState === "menu") {
        dom.screens.setup.classList.remove('hidden');
        dom.screens.game.classList.add('hidden');
        document.body.classList.remove('in-game');
    } else {
        dom.screens.setup.classList.add('hidden');
        dom.screens.game.classList.remove('hidden');
        document.body.classList.add('in-game');
    }
}

// --- Initialisation ---
async function init() {
    console.log("Initialisation du jeu...");
    setupEventListeners();
    await loadDictionary(CONFIG.currentLang);
    updatePlayerListUI(); // Reset
    updateGameState("menu");
}

function setupEventListeners() {
    // Setup listeners
    if (dom.setup.btnAdd) dom.setup.btnAdd.addEventListener('click', addSetupPlayer);
    if (dom.setup.inputName) {
        dom.setup.inputName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addSetupPlayer();
        });
    }
    if (dom.setup.startBtn) dom.setup.startBtn.addEventListener('click', startGame);

    // Game listeners
    if (dom.game.menuBtn) {
        dom.game.menuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleGameMenu();
        });
    }
    if (dom.game.menuBackdrop) {
        dom.game.menuBackdrop.addEventListener('click', closeGameMenu);
    }
    const menuRestart = document.getElementById('menu-restart');
    const menuQuit = document.getElementById('menu-quit');
    if (menuRestart) menuRestart.addEventListener('click', restartGame);
    if (menuQuit) menuQuit.addEventListener('click', quitGame);

    if (dom.game.deleteBtn) dom.game.deleteBtn.addEventListener('click', deleteLastLetter);
    if (dom.game.challengeBtn) dom.game.challengeBtn.addEventListener('click', initiateChallenge);

    setupModalListeners();
}

async function loadDictionary(lang) {
    try {
        const response = await fetch(CONFIG.dictPath);
        if (!response.ok) throw new Error("Erreur");
        const text = await response.text();
        const words = text.split(/\r?\n/);
        state.dictionary.clear();
        words.forEach(word => {
            const cleanWord = word.trim().toUpperCase();
            if (cleanWord) state.dictionary.add(cleanWord);
        });
    } catch (error) {
        state.dictionary.clear();
        DICTIONNAIRE.forEach(w => state.dictionary.add(w));
    }
}

function startGame() {
    if (setupPlayers.length < CONFIG.minPlayers) return;

    state.players = setupPlayers.map(name => ({ name, score: 0 }));
    state.isGameActive = true;
    state.currentPlayerIndex = 0;
    state.currentChain = "";

    updateGameState("playing");
    updateGameUI();
    updateScores();
    renderKeyboard();
    closeGameMenu();

    showMessage("C'est parti !");
}

function quitGame() {
    state.isGameActive = false;
    state.currentChain = "";
    setupPlayers = []; // Reset list on quit? Or keep? Let's clear for new game.
    updatePlayerListUI();
    closeGameMenu();
    updateGameState("menu");
}

function restartGame() {
    if (!confirm("Recommencer ?")) return;
    closeGameMenu();
    state.currentChain = "";
    state.currentPlayerIndex = 0;
    state.players.forEach(p => p.score = 0);
    updateScores();
    updateGameUI();
    showMessage("Partie recommencée !");
}

/* --- CLAVIER & JEU (inchangés ou adaptés) --- */
const KEY_ROWS = [
    ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
    ["W", "X", "C", "V", "B", "N"]
];

function renderKeyboard() {
    dom.game.keyboardArea.innerHTML = "";
    KEY_ROWS.forEach(rowKeys => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'keyboard-row';
        rowKeys.forEach(letter => {
            const btn = document.createElement('button');
            btn.className = 'key-button';
            btn.textContent = letter;
            btn.addEventListener('click', () => {
                btn.style.transform = "scale(0.9)";
                setTimeout(() => btn.style.transform = "scale(1)", 100);
                handleLetterSelection(letter);
            });
            rowDiv.appendChild(btn);
        });
        dom.game.keyboardArea.appendChild(rowDiv);
    });
}

function updateGameUI() {
    const player = state.players[state.currentPlayerIndex];
    if (dom.game.currentPlayerName) dom.game.currentPlayerName.textContent = player.name;

    dom.game.currentChain.innerHTML = "";
    const letters = state.currentChain.split('');
    letters.forEach((letter, index) => {
        const span = document.createElement('span');
        span.className = 'letter-pill';
        span.textContent = letter;
        if (index === letters.length - 1) span.classList.add('pop');
        if (letters.length === 1 && index === 0) span.classList.add('pulse');
        dom.game.currentChain.appendChild(span);
    });

    const cursorSpan = document.createElement('span');
    cursorSpan.className = 'cursor';
    cursorSpan.textContent = '|';
    dom.game.currentChain.appendChild(cursorSpan);

    if (dom.game.challengeBtn) dom.game.challengeBtn.disabled = state.currentChain.length === 0;
}

function nextTurn() {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    updateGameUI();
    clearMessage();
}

function deleteLastLetter() {
    if (state.currentChain.length > 0) {
        state.currentChain = state.currentChain.slice(0, -1);
        updateGameUI();
    }
}

function handleLetterSelection(letter) {
    if (!state.isGameActive) return;
    state.currentChain += letter;

    if (state.currentChain.length >= 4 && state.dictionary.has(state.currentChain)) {
        const player = state.players[state.currentPlayerIndex];
        applyPenalty(state.currentPlayerIndex);
        showMessage(`❌ Perdu ! "${state.currentChain}" existe. ${player.name} +1.`);
        setTimeout(endRound, 2500);
        return;
    }
    nextTurn();
}

/* --- CHALLENGE --- */
let modalCallback = null;

function openChallengeModal(questionText, callbackOnValidate) {
    const modal = document.getElementById('challenge-modal');
    const question = document.getElementById('challenge-question');
    const input = document.getElementById('challenge-input');
    if (!modal) return;
    question.textContent = questionText;
    modalCallback = callbackOnValidate;
    modal.classList.remove('hidden');
    input.value = "";
    setTimeout(() => input.focus(), 100);
}

function closeChallengeModal() {
    const modal = document.getElementById('challenge-modal');
    if (modal) modal.classList.add('hidden');
    modalCallback = null;
}

function initiateChallenge() {
    const challengerIndex = state.currentPlayerIndex;
    let challengedIndex = state.currentPlayerIndex - 1;
    if (challengedIndex < 0) challengedIndex = state.players.length - 1;

    openChallengeModal(
        `Quel mot avais-tu en tête commençant par ${state.currentChain} ?`,
        (word) => resolveChallenge(word, challengerIndex, challengedIndex)
    );
}

function resolveChallenge(word, challengerIndex, challengedIndex) {
    word = word.trim().toUpperCase();
    if (!word) { alert("Mot requis"); return; }

    const challenger = state.players[challengerIndex];
    const challenged = state.players[challengedIndex];
    const isValid = verifyWord(word);
    closeChallengeModal();

    if (isValid) {
        applyPenalty(challengerIndex);
        showMessage(`❌ Challenge raté ! "${word}" existe. ${challenger.name} +1.`);
    } else {
        applyPenalty(challengedIndex);
        showMessage(`✅ Bien vu ! "${word}" invalide. ${challenged.name} +1.`);
    }
    setTimeout(endRound, 3000);
}

function verifyWord(word) {
    if (!state.dictionary.has(word)) return false;
    if (!word.startsWith(state.currentChain)) return false;
    if (word.length <= state.currentChain.length) return false;
    return true;
}

function applyPenalty(playerIndex) {
    state.players[playerIndex].score += 1;
    updateScores();
}

function updateScores() {
    if (dom.game.scoresList) {
        dom.game.scoresList.innerHTML = "";
        state.players.forEach(player => {
            const li = document.createElement('li');
            li.className = 'player-score-card';
            li.innerHTML = `<span class="score-label">${player.name}</span> <span class="score-value">${player.score}</span>`;
            dom.game.scoresList.appendChild(li);
        });
    }
}

function showMessage(msg) {
    if (dom.game.messageArea) {
        dom.game.messageArea.textContent = msg;
        dom.game.messageArea.classList.remove('hidden');
    }
}

function clearMessage() {
    if (dom.game.messageArea) {
        dom.game.messageArea.classList.add('hidden');
        dom.game.messageArea.textContent = "";
    }
}

function endRound() {
    state.currentChain = "";
    updateGameUI();
    showMessage("Nouveau Round");
    setTimeout(clearMessage, 2000);
}

function setupModalListeners() {
    const validateBtn = document.getElementById('challenge-validate');
    const cancelBtn = document.getElementById('challenge-cancel');
    const backdrop = document.querySelector('.modal-backdrop');
    const input = document.getElementById('challenge-input');
    const closeHandler = () => closeChallengeModal();

    if (validateBtn) validateBtn.addEventListener('click', () => {
        if (input && input.value.trim() && modalCallback) modalCallback(input.value);
    });
    if (cancelBtn) cancelBtn.addEventListener('click', closeHandler);
    if (backdrop) backdrop.addEventListener('click', closeHandler);
    if (input) input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim() && modalCallback) modalCallback(input.value);
    });
}

init();
