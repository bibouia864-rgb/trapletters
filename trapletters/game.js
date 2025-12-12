// ========== GAME STATE ==========
const state = {
    players: [],
    currentPlayerIndex: 0,
    currentChain: "",
    dictionary: new Set(),
    // prefixMap: Map<prefix -> { nextLetters: Set, example: string }>
    prefixMap: new Map(),
    gameMode: 'custom', // 'custom' | 'solo' | 'duel' | 'multi'
    isGameActive: false,
    gameStartTime: 0,
    roundStartTime: 0,
    roundCount: 0,
    difficulty: 'normal', // 'easy' | 'normal' | 'hard'
    gameHistory: []
};

// AI scheduler handle
state._aiTimer = null;

function clearAiTimer() {
    if (state._aiTimer) {
        clearTimeout(state._aiTimer);
        state._aiTimer = null;
    }
}

function scheduleAiIfNeeded(delayOverride) {
    clearAiTimer();
    if (!state.isGameActive) return;
    const cur = state.players[state.currentPlayerIndex];
    if (!cur || cur.type !== 'ai' || !cur.isAlive) return;
    const think = (typeof delayOverride === 'number') ? delayOverride : (400 + Math.floor(Math.random() * 900));
    const expected = state.currentPlayerIndex;
    state._aiTimer = setTimeout(() => {
        state._aiTimer = null;
        if (!state.isGameActive) return;
        if (state.currentPlayerIndex !== expected) return;
        aiMakeMove(expected);
    }, think);
}

let gameState = "menu"; // "menu" | "playing" | "difficulty-select"

// ========== CONFIG ==========
const CONFIG = {
    minPlayers: 2,
    maxPlayers: 6,
    currentLang: 'fr',
    dictPath: 'dict/fr.txt',
    minWordLength: 4,
    maxPenalties: {
        easy: 15,
        normal: 10,
        hard: 5
    },
    playerColors: [
        '#00d9ff', '#ff1744', '#00ff88', '#ffdd00', '#b020ff', '#ff6b6b'
    ]
};

// Optional remote dictionary to attempt for a much larger wordlist
CONFIG.remoteDictPath = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt';
// Optional full French dictionary placed locally (conjugations/forms)
CONFIG.fullDictPath = 'dict/fr-full.txt';
// Optional online leaderboard endpoint (set in UI)
CONFIG.onlineLeaderboardUrl = '';

// ========== SOUND EFFECTS ==========
const sounds = {
    enabled: true,
    play(type) {
        if (!this.enabled) return;
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const now = audioContext.currentTime;
            
            const freq = {
                success: 800,
                error: 300,
                challenge: 600,
                complete: 1000,
                penalty: 200
            }[type] || 500;
            
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            
            osc.start(now);
            osc.stop(now + 0.1);
        } catch (e) { /* Silencieux si audio non disponible */ }
    }
};

// Fallback Dictionary
const FALLBACK_DICT = [
    "BONJOUR", "MONDE", "JAVASCRIPT", "HTML", "CSS", "PYTHON", "JAVA", "CODE",
    "PROGRAMMATION", "FONCTION", "VARIABLE", "CLASSE", "OBJET", "ARRAY",
    "INTERFACE", "DESIGN", "LOGIQUE", "DÉBOGAGE", "OPTIMISATION", "PERFORMANCE",
    "CHAT", "CHIEN", "MAISON", "TABLE", "ARBRE", "FLEUR", "SOLEIL", "LUNE",
    "EAU", "FEU", "TERRE", "CIEL", "ROUGE", "BLEU", "VERT", "JAUNE",
    "NOIR", "BLANC", "LIVRE", "STYLO", "PORTE", "FENETRE", "JEU", "JOUEUR",
    "GAGNER", "PERDRE", "MOT", "LETTRE", "PHRASE", "TEXTE", "CLAVIER", "SOURIS"
];

// ========== DOM REFERENCES ==========
const dom = {
    screens: {
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
        currentPlayerName: document.getElementById('current-player-name'),
        currentChain: document.getElementById('current-chain'),
        chainLength: document.getElementById('chain-length'),
        chainWarning: document.getElementById('chain-warning'),
        keyboardArea: document.getElementById('keyboard-area'),
        deleteBtn: document.getElementById('delete-btn'),
        challengeBtn: document.getElementById('challenge-btn'),
        messageArea: document.getElementById('message-area'),
        scoresList: document.getElementById('scores-list'),
        menuBtn: document.getElementById('menu-btn'),
        menu: document.getElementById('game-menu'),
        menuBackdrop: document.getElementById('menu-backdrop'),
        timerDisplay: document.getElementById('timer-display'),
        gameOverModal: document.getElementById('game-over-modal'),
        winnerInfo: document.getElementById('winner-info'),
        finalScores: document.getElementById('final-scores')
    }
};

// ========== PLAYERS SETUP ==========
// setupPlayers holds objects: { name, type: 'human'|'ai', aiLevel?: 'easy'|'normal'|'hard' }
let setupPlayers = [];

function updatePlayerListUI() {
    dom.setup.list.innerHTML = "";
    setupPlayers.forEach((p, index) => {
        const div = document.createElement('div');
        div.className = "player-item";
        const label = p.type === 'ai' ? `${p.name} (BOT • ${p.aiLevel})` : p.name;
        // badges (from storage)
        const badges = getBadgesFor(p.name);
        const badgeHtml = badges && badges.length ? `<span class="badge-list">${badges.map(b=>`<span class="badge">${b}</span>`).join('')}</span>` : '';
        div.innerHTML = `
            <span>${label} ${badgeHtml}</span>
            <button class="delete-btn" onclick="removeSetupPlayer(${index})">🗑️</button>
        `;
        dom.setup.list.appendChild(div);
    });

    if (dom.setup.startBtn) {
        dom.setup.startBtn.disabled = setupPlayers.length < CONFIG.minPlayers;
        if (setupPlayers.length >= CONFIG.minPlayers) {
            dom.setup.startBtn.textContent = `🚀 Lancer la Partie (${setupPlayers.length})`;
        } else {
            dom.setup.startBtn.textContent = `⏳ Ajoutez des joueurs (${setupPlayers.length}/${CONFIG.minPlayers})`;
        }
    }
}

function addSetupPlayer() {
    const name = dom.setup.inputName.value.trim();
    if (!name || name.length === 0) return;
    if (setupPlayers.some(s => s.name.toUpperCase() === name.toUpperCase())) {
        alert("❌ Ce nom est déjà pris !");
        return;
    }
    if (setupPlayers.length >= CONFIG.maxPlayers) {
        alert(`❌ Maximum ${CONFIG.maxPlayers} joueurs !`);
        return;
    }
    setupPlayers.push({ name: name.trim(), type: 'human' });
    dom.setup.inputName.value = "";
    updatePlayerListUI();
    dom.setup.inputName.focus();
}

window.removeSetupPlayer = function (index) {
    setupPlayers.splice(index, 1);
    updatePlayerListUI();
};

// Prevent double-click spam
let _addBotDebounce = false;

window.addAIPlayer = function(level) {
    // Debounce: prevent rapid clicks
    if (_addBotDebounce) return;
    _addBotDebounce = true;
    setTimeout(() => { _addBotDebounce = false; }, 300);

    if (setupPlayers.length >= CONFIG.maxPlayers) {
        alert(`❌ Maximum ${CONFIG.maxPlayers} joueurs !`);
        return;
    }
    const count = setupPlayers.filter(p => p.type === 'ai').length + 1;
    const name = `BOT-${count}`;
    setupPlayers.push({ name, type: 'ai', aiLevel: level });
    updatePlayerListUI();
    
    // Big entrance animation
    const list = document.getElementById('players-list');
    if (list) {
        const items = list.querySelectorAll('.player-item');
        const last = items[items.length - 1];
        if (last) {
            last.style.animation = 'slideInLeft 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            last.style.backgroundColor = 'rgba(0, 217, 255, 0.2)';
        }
    }
}

// ========== GAME STATE MANAGEMENT ==========
function updateGameState(newState) {
    gameState = newState;
    console.log("gameState:", gameState);

    if (gameState === "menu") {
        // Hide game screen with animation
        dom.screens.game.style.animation = 'dramatic-screen-exit 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
        setTimeout(() => {
            dom.screens.game.classList.add('hidden');
            dom.screens.game.style.animation = '';
            dom.screens.setup.classList.remove('hidden');
            dom.screens.setup.style.animation = 'dramatic-screen-enter 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
        }, 600);
        document.body.classList.remove('in-game');
    } else {
        // Show game screen with animation
        dom.screens.setup.style.animation = 'dramatic-screen-exit 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
        setTimeout(() => {
            dom.screens.setup.classList.add('hidden');
            dom.screens.setup.style.animation = '';
            dom.screens.game.classList.remove('hidden');
            dom.screens.game.style.animation = 'dramatic-screen-enter 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
        }, 500);
        document.body.classList.add('in-game');
    }
}

// ========== INITIALIZATION ==========
async function init() {
    console.log("🎮 Initialisation du jeu...");
    setupEventListeners();
    await loadDictionary(CONFIG.currentLang);
    updatePlayerListUI();
    updateGameState("menu");
}

function setupEventListeners() {
    // Setup screen
    if (dom.setup.btnAdd) dom.setup.btnAdd.addEventListener('click', addSetupPlayer);
    if (dom.setup.inputName) {
        dom.setup.inputName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addSetupPlayer();
        });
    }
    if (dom.setup.startBtn) dom.setup.startBtn.addEventListener('click', startGame);

    // Add-bot buttons
    const addBotEasy = document.getElementById('add-bot-easy');
    const addBotNormal = document.getElementById('add-bot-normal');
    const addBotHard = document.getElementById('add-bot-hard');
    if (addBotEasy) addBotEasy.addEventListener('click', () => { window.addAIPlayer('easy'); });
    if (addBotNormal) addBotNormal.addEventListener('click', () => { window.addAIPlayer('normal'); });
    if (addBotHard) addBotHard.addEventListener('click', () => { window.addAIPlayer('hard'); });

    // Online leaderboard controls
    const onlineUrlInput = document.getElementById('online-leaderboard-url');
    const btnFetchOnline = document.getElementById('btn-fetch-online');
    const btnPushOnline = document.getElementById('btn-push-online');
    if (onlineUrlInput) {
        onlineUrlInput.value = CONFIG.onlineLeaderboardUrl || '';
        onlineUrlInput.addEventListener('change', (e) => { CONFIG.onlineLeaderboardUrl = e.target.value.trim(); });
    }
    if (btnFetchOnline) btnFetchOnline.addEventListener('click', async () => { await fetchOnlineLeaderboard(); });
    if (btnPushOnline) btnPushOnline.addEventListener('click', async () => {
        showMessage('🔃 Publication en cours...');
        await pushAllLocalScoresOnline();
        showMessage('✅ Publication terminée');
        setTimeout(clearMessage, 1400);
    });
    // Local file loader for full dict
    const fileInput = document.getElementById('file-dict-full');
    const btnLoadDict = document.getElementById('btn-load-dict');
    if (btnLoadDict && fileInput) {
        btnLoadDict.addEventListener('click', () => {
            if (fileInput.files && fileInput.files[0]) {
                const f = fileInput.files[0];
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const txt = ev.target.result;
                    loadDictionaryFromText(txt);
                    renderKeyboard();
                    updateGameUI();
                    showMessage(`✅ Dictionnaire chargé: ${f.name} (${state.dictionary.size} mots)`);
                    setTimeout(clearMessage, 2500);
                };
                reader.readAsText(f, 'utf-8');
            } else {
                alert('Sélectionnez un fichier .txt');
            }
        });
    }

    // Mode selector buttons
    const mSolo = document.getElementById('mode-solo');
    const mDuel = document.getElementById('mode-duel');
    const mMulti = document.getElementById('mode-multi');
    const mCustom = document.getElementById('mode-custom');
    const setMode = (mode) => {
        state.gameMode = mode;
        [mSolo, mDuel, mMulti, mCustom].forEach(b => { if (b) b.classList.remove('active-mode'); });
        const el = ({ solo: mSolo, duel: mDuel, multi: mMulti, custom: mCustom })[mode];
        if (el) el.classList.add('active-mode');
        showMessage(`Mode: ${mode.toUpperCase()}`);
        setTimeout(clearMessage, 1200);
    };
    if (mSolo) mSolo.addEventListener('click', () => setMode('solo'));
    if (mDuel) mDuel.addEventListener('click', () => setMode('duel'));
    if (mMulti) mMulti.addEventListener('click', () => setMode('multi'));
    if (mCustom) mCustom.addEventListener('click', () => setMode('custom'));

    // Init mode button style
    setMode(state.gameMode || 'custom');

    // Game menu
    if (dom.game.menuBtn) {
        dom.game.menuBtn.addEventListener('click', toggleGameMenu);
    }
    if (dom.game.menuBackdrop) {
        dom.game.menuBackdrop.addEventListener('click', closeGameMenu);
    }

    const menuRestart = document.getElementById('menu-restart');
    const menuQuit = document.getElementById('menu-quit');
    if (menuRestart) menuRestart.addEventListener('click', restartGame);
    if (menuQuit) menuQuit.addEventListener('click', quitGame);

    // Game actions
    if (dom.game.deleteBtn) dom.game.deleteBtn.addEventListener('click', deleteLastLetter);
    if (dom.game.challengeBtn) dom.game.challengeBtn.addEventListener('click', initiateChallenge);
    // Hint button (shows a suggested continuation)
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) hintBtn.addEventListener('click', showHint);

    // Difficulty selector buttons (in menu)
    const dEasy = document.getElementById('diff-easy');
    const dNormal = document.getElementById('diff-normal');
    const dHard = document.getElementById('diff-hard');
    if (dEasy) dEasy.addEventListener('click', () => { state.difficulty = 'easy'; showMessage('🟢 Facile'); closeGameMenu(); updateScores(); });
    if (dNormal) dNormal.addEventListener('click', () => { state.difficulty = 'normal'; showMessage('🟡 Normal'); closeGameMenu(); updateScores(); });
    if (dHard) dHard.addEventListener('click', () => { state.difficulty = 'hard'; showMessage('🔴 Difficile'); closeGameMenu(); updateScores(); });

    // Game over modal
    const playAgainBtn = document.getElementById('play-again-btn');
    const goHomeBtn = document.getElementById('go-home-btn');
    if (playAgainBtn) playAgainBtn.addEventListener('click', playAgain);
    if (goHomeBtn) goHomeBtn.addEventListener('click', goHome);

    // Keyboard shortcuts (ignore when typing in inputs)
    document.addEventListener('keydown', (e) => {
        try {
            if (!state.isGameActive) return;
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
            if (e.repeat) return;

            const rawKey = e.key || '';
            const key = String(rawKey).toUpperCase();
            const azerty = 'AZERTYUIOPQSDFGHJKLMWXCVBN';

            if (azerty.includes(key)) {
                e.preventDefault();
                handleLetterSelection(key);
            } else if (rawKey === 'Backspace') {
                e.preventDefault();
                deleteLastLetter();
            } else if (rawKey === ' ') {
                e.preventDefault();
                initiateChallenge();
            }
        } catch (err) {
            console.warn('Keyboard handler error', err);
        }
    });

    setupModalListeners();
}

async function loadDictionary(lang) {
    // Try remote large list first, then local file, then fallback array
    let text = null;
    const tryFetch = async (url) => {
        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error('not ok');
            return await r.text();
        } catch (e) {
            return null;
        }
    };

    // Prefer local full French file if present, then local fr, then remote
    if (CONFIG.currentLang === 'fr') {
        text = await tryFetch(CONFIG.fullDictPath) || await tryFetch(CONFIG.dictPath) || await tryFetch(CONFIG.remoteDictPath);
    } else {
        text = await tryFetch(CONFIG.remoteDictPath) || await tryFetch(CONFIG.dictPath);
    }

    // Use helper to populate dictionary/prefixMap
    if (text) {
        loadDictionaryFromText(text);
        console.log(`✅ ${state.dictionary.size} mots chargés (avec préfixes ${state.prefixMap.size})`);
    } else {
        // fallback
        loadDictionaryFromText(FALLBACK_DICT.join('\n'));
        console.warn("⚠️ Dictionnaire non trouvé, utilisation du fallback");
    }
}

function loadDictionaryFromText(text) {
    state.dictionary.clear();
    state.prefixMap.clear();
    const words = text.split(/\r?\n/);
    words.forEach(word => {
        const cleanWord = String(word || '').trim().toUpperCase();
        if (!cleanWord || cleanWord.length < CONFIG.minWordLength) return;
        state.dictionary.add(cleanWord);

        for (let i = 0; i < cleanWord.length; i++) {
            const prefix = cleanWord.slice(0, i).toUpperCase();
            const next = cleanWord[i];
            let entry = state.prefixMap.get(prefix);
            if (!entry) {
                entry = { nextLetters: new Set(), example: cleanWord };
                state.prefixMap.set(prefix, entry);
            }
            entry.nextLetters.add(next);
            if (!entry.example) entry.example = cleanWord;
        }
    });
}

// ========== GAME START & CONTROL ==========
function startGame() {
    // Prepare players list depending on selected mode
    let playersToUse = [...setupPlayers];
    if (state.gameMode === 'solo') {
        // ensure at least one human
        if (!playersToUse.some(p => p.type !== 'ai')) {
            alert('Ajoutez au moins votre pseudo avant de lancer le mode solo.');
            return;
        }
        // fill with bots to 4 players
        while (playersToUse.length < 4) {
            const count = playersToUse.filter(p => p.type === 'ai').length + 1;
            playersToUse.push({ name: `BOT-${count}`, type: 'ai', aiLevel: 'normal' });
        }
    } else if (state.gameMode === 'duel') {
        // make sure there are exactly 2 players (fill with bot if needed)
        while (playersToUse.length < 2) {
            const count = playersToUse.filter(p => p.type === 'ai').length + 1;
            playersToUse.push({ name: `BOT-${count}`, type: 'ai', aiLevel: 'normal' });
        }
    } else if (state.gameMode === 'multi') {
        // 4-player match
        while (playersToUse.length < 4) {
            const count = playersToUse.filter(p => p.type === 'ai').length + 1;
            playersToUse.push({ name: `BOT-${count}`, type: 'ai', aiLevel: 'normal' });
        }
    } else {
        if (playersToUse.length < CONFIG.minPlayers) return;
    }

    state.players = playersToUse.map((p, index) => ({ 
        name: p.name || p,
        type: p.type || 'human',
        aiLevel: p.aiLevel,
        score: 0,
        isAlive: true,
        color: CONFIG.playerColors[index % CONFIG.playerColors.length],
        roundsWon: 0,
        challengesWon: 0
    }));
    state.isGameActive = true;
    state.currentPlayerIndex = 0;
    state.currentChain = "";
    state.roundCount = 0;
    state.gameHistory = [];
    state.gameStartTime = Date.now();
    state.roundStartTime = Date.now();

    updateGameState("playing");
    applyPlayerColors();
    updateGameUI();
    updateScores();
    renderKeyboard();
    closeGameMenu();

    showMessage("⚡ C'est parti ! À vous de jouer !");
    startTimer();
    // If first player is AI, schedule its move via centralized scheduler
    scheduleAiIfNeeded();
}

function toggleGameMenu() {
    const menu = dom.game.menu;
    const backdrop = dom.game.menuBackdrop;
    
    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        backdrop.classList.remove('hidden');
    } else {
        closeGameMenu();
    }
}

function closeGameMenu() {
    dom.game.menu.classList.add('hidden');
    dom.game.menuBackdrop.classList.add('hidden');
}

function quitGame() {
    if (!confirm("❌ Quitter la partie ? Les scores seront perdus.")) return;
    state.isGameActive = false;
    clearAiTimer();
    state.currentChain = "";
    setupPlayers = [];
    updatePlayerListUI();
    closeGameMenu();
    updateGameState("menu");
}

function restartGame() {
    if (!confirm("🔄 Recommencer une nouvelle partie ?")) return;
    closeGameMenu();
    clearAiTimer();
    state.currentChain = "";
    state.currentPlayerIndex = 0;
    state.players.forEach(p => p.score = 0);
    state.gameStartTime = Date.now();
    state.roundStartTime = Date.now();
    updateScores();
    updateGameUI();
    showMessage("🎮 Nouvelle partie lancée !");
    startTimer();
    scheduleAiIfNeeded();
}

function playAgain() {
    closeGameOverModal();
    restartGame();
}

function goHome() {
    closeGameOverModal();
    quitGame();
}

// ========== TIMER ==========
let timerInterval = null;

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.roundStartTime) / 1000);
        if (dom.game.timerDisplay) {
            dom.game.timerDisplay.textContent = `⏱️ ${elapsed}s`;
        }
    }, 100);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ========== KEYBOARD & DISPLAY ==========
const KEY_ROWS = [
    ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M"],
    ["W", "X", "C", "V", "B", "N"]
];

// ========== Dictionary helpers ==========
function hasPrefix(prefix) {
    if (!prefix) return true;
    prefix = prefix.toUpperCase();
    // If any word equals the prefix it's still valid (will be penalized later for completion)
    if (state.dictionary.has(prefix)) return true;
    const entry = state.prefixMap.get(prefix);
    return !!(entry && entry.nextLetters && entry.nextLetters.size > 0);
}

function getAllowedNextLetters() {
    const prefix = state.currentChain.toUpperCase();
    const entry = state.prefixMap.get(prefix);
    if (!prefix) {
        const root = state.prefixMap.get("");
        return root ? new Set(root.nextLetters) : new Set();
    }
    return entry ? new Set(entry.nextLetters) : new Set();
}

function getSuggestion() {
    const prefix = state.currentChain.toUpperCase();
    const entry = state.prefixMap.get(prefix);
    if (entry && entry.example) return entry.example;
    // Fallback: scan dictionary (rare)
    for (const w of state.dictionary) {
        if (w.startsWith(prefix) && w.length >= Math.max(CONFIG.minWordLength, prefix.length + 1)) {
            return w;
        }
    }
    return null;
}

function renderKeyboard() {
    dom.game.keyboardArea.innerHTML = "";
    const allowed = getAllowedNextLetters();
    KEY_ROWS.forEach(rowKeys => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'keyboard-row';
        rowKeys.forEach(letter => {
            const btn = document.createElement('button');
            btn.className = 'key-button';
            btn.textContent = letter;
            // All letters are now clickable - no disabling
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
    if (dom.game.currentPlayerName) {
        dom.game.currentPlayerName.textContent = player.name;
        dom.game.currentPlayerName.style.color = player.color;
        dom.game.currentPlayerName.style.textShadow = `0 0 12px ${player.color}`;
    }

    // Update chain display
    dom.game.currentChain.innerHTML = "";
    const letters = state.currentChain.split('');
    letters.forEach((letter, index) => {
        const span = document.createElement('span');
        span.className = 'letter-pill';
        span.textContent = letter;
        span.style.borderColor = player.color;
        if (index === letters.length - 1) span.classList.add('pop');
        dom.game.currentChain.appendChild(span);
    });

    const cursorSpan = document.createElement('span');
    cursorSpan.className = 'cursor';
    cursorSpan.textContent = '█';
    cursorSpan.style.color = player.color;
    dom.game.currentChain.appendChild(cursorSpan);

    // Update chain length
    if (dom.game.chainLength) {
        dom.game.chainLength.textContent = `(${state.currentChain.length} lettres)`;
    }

    // Update buttons
    if (dom.game.deleteBtn) {
        dom.game.deleteBtn.disabled = state.currentChain.length === 0;
    }
    if (dom.game.challengeBtn) {
        dom.game.challengeBtn.disabled = state.currentChain.length < 2;
    }

    // Check for word completion
    checkWordCompletion();
}

function checkWordCompletion() {
    if (state.currentChain.length < CONFIG.minWordLength) {
        if (dom.game.chainWarning) dom.game.chainWarning.innerHTML = "";
        return;
    }

    if (state.dictionary.has(state.currentChain)) {
        if (dom.game.chainWarning) {
            dom.game.chainWarning.innerHTML = `⚠️ ATTENTION ! "${state.currentChain}" est un mot complet !`;
        }
    } else {
        if (dom.game.chainWarning) dom.game.chainWarning.innerHTML = "";
    }
}

function nextTurn() {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    
    // Skip eliminated players
    while (!state.players[state.currentPlayerIndex].isAlive && state.isGameActive) {
        state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    }
    
    state.roundStartTime = Date.now();
    updateGameUI();
    clearMessage();
    // If next player is an AI, schedule its move
    scheduleAiIfNeeded();
}

function deleteLastLetter() {
    if (state.currentChain.length > 0) {
        state.currentChain = state.currentChain.slice(0, -1);
        updateGameUI();
    }
}

function handleLetterSelection(letter) {
    if (!state.isGameActive) return;

    const newChain = (state.currentChain + letter).toUpperCase();

    // If the new chain is not a prefix of any dictionary word -> immediate penalty
    if (!hasPrefix(newChain)) {
        const player = state.players[state.currentPlayerIndex];
        
        // Play shake animation on chain display
        const chainDisplay = dom.game.currentChain;
        if (chainDisplay) {
            chainDisplay.style.animation = 'shake 0.5s ease-in-out';
            setTimeout(() => { chainDisplay.style.animation = ''; }, 500);
        }
        
        applyPenalty(state.currentPlayerIndex);
        sounds.play('error');
        showMessage(`❌ Chaîne impossible — ${player.name} reçoit +1`);
        setTimeout(endRound, 1800);
        return;
    }

    // Accept letter
    state.currentChain = newChain;
    sounds.play('success');
    updateGameUI();
    renderKeyboard();

    // If completing a valid word (>= min length) -> penalty
    if (state.currentChain.length >= CONFIG.minWordLength && state.dictionary.has(state.currentChain)) {
        const player = state.players[state.currentPlayerIndex];
        applyPenalty(state.currentPlayerIndex);
        sounds.play('penalty');
        showMessage(`❌ ${player.name} a complété "${state.currentChain}" ! +1`);
        setTimeout(endRound, 2200);
        return;
    }

    // otherwise pass turn
    nextTurn();
}

function showHint() {
    if (!state.isGameActive) return;
    const suggestion = getSuggestion();
    if (!suggestion) {
        showMessage('❌ Aucun mot possible depuis cette chaîne');
        sounds.play('error');
        return;
    }
    // Highlight next letter and show a short hint (not revealing full word)
    const nextChar = suggestion[state.currentChain.length];
    showMessage(`💡 Suggestion: ajoute "${nextChar}"`);
    sounds.play('challenge');
    // briefly flash the corresponding key if rendered
    const buttons = document.querySelectorAll('.key-button');
    buttons.forEach(b => {
        if (b.textContent === nextChar) {
            b.classList.add('pop');
            setTimeout(() => b.classList.remove('pop'), 600);
        }
    });
}

// ========== AI Opponents ==========
function chooseAiLetter(level) {
    const allowedArr = Array.from(getAllowedNextLetters());
    if (allowedArr.length === 0) return null;
    const prefix = state.currentChain.toUpperCase();
    if (level === 'easy') {
        const pick = allowedArr[Math.floor(Math.random() * allowedArr.length)];
        console.log('AI easy pick', pick, 'allowed', allowedArr);
        return pick;
    }

    const scoreForLetter = (letter) => {
        const newPrefix = prefix + letter;
        const completes = state.dictionary.has(newPrefix);
        const entry = state.prefixMap.get(newPrefix);
        const nextCount = entry && entry.nextLetters ? entry.nextLetters.size : 0;
        let score = nextCount;
        if (completes) score -= 10000; // strongly avoid completing
        return score;
    };

    if (level === 'normal') {
        allowedArr.sort((a, b) => scoreForLetter(b) - scoreForLetter(a));
        console.log('AI normal picks', allowedArr[0], 'candidates', allowedArr.slice(0,4));
        return allowedArr[0];
    }

    // hard: simple two-step lookahead
    if (level === 'hard') {
        let best = null;
        let bestVal = -Infinity;
        allowedArr.forEach(letter => {
            const newPrefix = prefix + letter;
            if (state.dictionary.has(newPrefix)) return; // avoid immediate completion
            const entry = state.prefixMap.get(newPrefix);
            const nextLetters = entry ? Array.from(entry.nextLetters) : [];
            // evaluate worst-case (minimum options) after opponent move
            let worstForUs = Infinity;
            if (nextLetters.length === 0) {
                worstForUs = 0;
            } else {
                nextLetters.forEach(l2 => {
                    const p2 = newPrefix + l2;
                    const e2 = state.prefixMap.get(p2);
                    const options = e2 ? e2.nextLetters.size : 0;
                    if (options < worstForUs) worstForUs = options;
                });
            }
            if (worstForUs === Infinity) worstForUs = 0;
            if (worstForUs > bestVal) { bestVal = worstForUs; best = letter; }
        });
        if (best) { console.log('AI hard pick', best); return best; }
        // fallback
        allowedArr.sort((a, b) => scoreForLetter(b) - scoreForLetter(a));
        console.log('AI hard fallback', allowedArr[0]);
        return allowedArr[0];
    }

    return allowedArr[0];
}

function aiMakeMove(playerIndex) {
    if (!state.isGameActive) return;
    if (state.currentPlayerIndex !== playerIndex) return;
    const player = state.players[playerIndex];
    if (!player || player.type !== 'ai') return;
    console.log('aiMakeMove starting for', player.name, 'idx', playerIndex);
    const letter = chooseAiLetter(player.aiLevel || 'normal');
    if (!letter) {
        applyPenalty(playerIndex);
        sounds.play('error');
        showMessage(`${player.name} n'a aucune option et reçoit +1`);
        setTimeout(endRound, 1500);
        return;
    }
    const delay = 500 + Math.floor(Math.random() * 900);
    setTimeout(() => {
        if (state.isGameActive && state.currentPlayerIndex === playerIndex) {
            // animate the corresponding key briefly
            const buttons = document.querySelectorAll('.key-button');
            let found = null;
            buttons.forEach(b => { if (b.textContent === letter) found = b; });
            if (found) {
                found.classList.add('pop');
                setTimeout(() => found.classList.remove('pop'), 350);
            }
            handleLetterSelection(letter);
        }
    }, delay);
}

// ========== CHALLENGE SYSTEM ==========
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
    if (state.currentChain.length < 2) {
        showMessage("❌ Chaîne trop courte pour challenger !");
        return;
    }

    const challengerIndex = state.currentPlayerIndex;
    let challengedIndex = (state.currentPlayerIndex - 1 + state.players.length) % state.players.length;

    const challenged = state.players[challengedIndex];
    openChallengeModal(
        `⚔️ ${challenged.name}, à quoi tu penses après "${state.currentChain}" ?`,
        (word) => resolveChallenge(word, challengerIndex, challengedIndex)
    );
}

function resolveChallenge(word, challengerIndex, challengedIndex) {
    word = word.trim().toUpperCase();
    if (!word || word.length <= state.currentChain.length) {
        sounds.play('error');
        showMessage("❌ Mot invalide ou trop court !");
        return;
    }

    const challenger = state.players[challengerIndex];
    const challenged = state.players[challengedIndex];
    const isValid = verifyWord(word);
    
    closeChallengeModal();

    if (isValid) {
        applyPenalty(challengerIndex);
        state.players[challengedIndex].challengesWon += 1;
        sounds.play('challenge');
        showMessage(`✅ ${challenged.name} gagne ! "${word}" existe. ${challenger.name} +1`);
    } else {
        applyPenalty(challengedIndex);
        state.players[challengerIndex].challengesWon += 1;
        sounds.play('success');
        showMessage(`🎯 ${challenger.name} gagne ! "${word}" n'existe pas. ${challenged.name} +1`);
    }
    
    setTimeout(endRound, 3000);
}

function verifyWord(word) {
    // Word must start with current chain
    if (!word.startsWith(state.currentChain)) return false;
    // Word must be longer than current chain
    if (word.length <= state.currentChain.length) return false;
    // Word must exist in dictionary
    if (!state.dictionary.has(word)) return false;
    return true;
}

// ========== SCORING & END GAME ==========
function applyPenalty(playerIndex) {
    state.players[playerIndex].score += 1;
    
    // Shake animation on penalty
    const chain = document.getElementById('current-chain');
    if (chain) {
        chain.style.animation = 'none';
        setTimeout(() => {
            chain.style.animation = 'shake 0.5s ease-in-out';
        }, 10);
    }
    
    const currentMax = CONFIG.maxPenalties[state.difficulty] || CONFIG.maxPenalties.normal;
    if (state.players[playerIndex].score >= currentMax) {
        state.players[playerIndex].isAlive = false;
        showMessage(`💀 ${state.players[playerIndex].name} est éliminé !`);
        checkGameOver();
    }
    
    updateScores();
}
function updateScores() {
    if (dom.game.scoresList) {
        dom.game.scoresList.innerHTML = "";
        const maxPenalties = CONFIG.maxPenalties[state.difficulty] || CONFIG.maxPenalties.normal;
        state.players.forEach((player, index) => {
            const li = document.createElement('li');
            li.className = 'player-score-card';
            if (!player.isAlive) li.classList.add('eliminated');
            const status = player.score >= maxPenalties ? '💀' : '🎮';
            li.innerHTML = `<span class="score-label">${status} ${player.name}</span> <span class="score-value">${player.score}/${maxPenalties}</span>`;
            li.style.borderColor = player.color;
            li.style.boxShadow = `0 0 15px ${player.color}40`;
            const scoreLabel = li.querySelector('.score-label');
            if (scoreLabel) {
                scoreLabel.style.color = player.color;
                scoreLabel.style.textShadow = `0 0 8px ${player.color}`;
            }
            dom.game.scoresList.appendChild(li);
        });
    }
}

function applyPlayerColors() {
    updateScores();
    const currentPlayerName = dom.game.currentPlayerName;
    if (currentPlayerName && state.players[state.currentPlayerIndex]) {
        const color = state.players[state.currentPlayerIndex].color;
        currentPlayerName.style.color = color;
        currentPlayerName.style.textShadow = `0 0 12px ${color}`;
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
    state.roundCount += 1;
    state.roundStartTime = Date.now();
    updateGameUI();
    updateScores();
    renderKeyboard();
    showMessage(`📍 Manche ${state.roundCount} • Nouvelle chaîne...`);
    setTimeout(clearMessage, 1500);
    // allow AI to act if next player is AI
    scheduleAiIfNeeded();
}

function checkGameOver() {
    const alive = state.players.filter(p => p.isAlive);
    if (alive.length <= 1) {
        endGame();
    }
}

function endGame() {
    state.isGameActive = false;
    stopTimer();
    clearAiTimer();
    
    const winner = state.players.reduce((prev, current) => 
        (prev.score < current.score) ? prev : current
    );
    
    // Victory sound
    sounds.play('complete');
    // Update leaderboard and badges
    registerWin(winner.name);
    if (winner.score === 0) awardBadge(winner.name, 'Impeccable');
    awardBadge(winner.name, 'Champion');

    displayGameOver(winner);
}

function displayGameOver(winner) {
    if (dom.game.gameOverModal) {
        // Winner info
        dom.game.winnerInfo.innerHTML = `
            <div class="trophy">🏆</div>
            <div class="name">${winner.name}</div>
            <p style="margin-top: 8px; color: #94a3b8; font-size: 0.9rem;">${winner.score} pénalité${winner.score > 1 ? 's' : ''}</p>
            <p style="font-size: 0.85rem; color: #7dd3fc; margin-top: 12px;">
                🎯 ${winner.challengesWon} défi${winner.challengesWon > 1 ? 's' : ''} gagné${winner.challengesWon > 1 ? 's' : ''}
            </p>
        `;
        
        // Final scores sorted
        const sorted = [...state.players].sort((a, b) => a.score - b.score);
        dom.game.finalScores.innerHTML = sorted.map((p, i) => `
            <li style="border-color: ${p.color}; box-shadow: 0 0 12px ${p.color}40;">
                <span class="rank" style="color: ${p.color};">#${i + 1}</span>
                <span style="color: ${p.color};">${p.name}</span>
                <span class="score">${p.score}</span>
            </li>
        `).join('');
        
        dom.game.gameOverModal.classList.remove('hidden');
    }
}

function closeGameOverModal() {
    if (dom.game.gameOverModal) {
        dom.game.gameOverModal.classList.add('hidden');
    }
}

// ========== MODAL LISTENERS ==========
function setupModalListeners() {
    // Challenge modal
    const validateBtn = document.getElementById('challenge-validate');
    const cancelBtn = document.getElementById('challenge-cancel');
    const backdrop = document.querySelector('.modal-backdrop');
    const input = document.getElementById('challenge-input');
    
    const closeHandler = () => closeChallengeModal();

    if (validateBtn) {
        validateBtn.addEventListener('click', () => {
            if (input && input.value.trim() && modalCallback) {
                modalCallback(input.value);
            }
        });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', closeHandler);
    if (backdrop) backdrop.addEventListener('click', closeHandler);
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && input.value.trim() && modalCallback) {
                modalCallback(input.value);
            }
        });
    }
}

// ========== Leaderboard & Badges (localStorage) ==========
const LB_KEY = 'trapletters_leaderboard_v1';
const BADGE_KEY = 'trapletters_badges_v1';

function loadLeaderboard() {
    try {
        const raw = localStorage.getItem(LB_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}

function saveLeaderboard(lb) {
    try { localStorage.setItem(LB_KEY, JSON.stringify(lb)); } catch (e) {}
}

function registerWin(name) {
    if (!name) return;
    const lb = loadLeaderboard();
    lb[name] = (lb[name] || 0) + 1;
    saveLeaderboard(lb);
    updateLeaderboardUI();
    // try to push single score online if configured
    if (CONFIG.onlineLeaderboardUrl) {
        postOnlineScore({ name, wins: lb[name] }).catch(err => console.warn('push online failed', err));
    }
}

async function fetchOnlineLeaderboard() {
    const url = (CONFIG.onlineLeaderboardUrl || '').trim();
    if (!url) { showMessage('❌ URL non configurée'); return; }
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('fetch failed');
        const json = await r.json();
        const el = document.getElementById('leaderboard-list');
        if (!el) return;
        // expect array of {name, score}
        if (Array.isArray(json)) {
            el.innerHTML = json.slice(0,10).map(i=>`<li>${i.name} — ${i.score}</li>`).join('');
        } else {
            el.innerHTML = '<li style="color:var(--text-secondary);">Aucun classement en ligne</li>';
        }
    } catch (e) {
        console.warn('fetchOnlineLeaderboard failed', e);
        showMessage('❌ Échec chargement en ligne');
        setTimeout(clearMessage, 1400);
    }
}

async function postOnlineScore(payload) {
    const url = (CONFIG.onlineLeaderboardUrl || '').trim();
    if (!url) { throw new Error('no url'); }
    try {
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (e) { throw e; }
}

async function pushAllLocalScoresOnline() {
    const url = (CONFIG.onlineLeaderboardUrl || '').trim();
    if (!url) { showMessage('❌ URL manquante'); setTimeout(clearMessage,1200); return; }
    const lb = loadLeaderboard();
    const entries = Object.entries(lb).map(([name,score])=>({ name, score }));
    for (const e of entries) {
        try { await postOnlineScore(e); } catch (err) { console.warn('push failed', e); }
    }
}

function updateLeaderboardUI() {
    const el = document.getElementById('leaderboard-list');
    if (!el) return;
    const lb = loadLeaderboard();
    const items = Object.entries(lb).sort((a,b)=>b[1]-a[1]).slice(0,10);
    el.innerHTML = items.map(([n,s])=>`<li>${n} — ${s}</li>`).join('') || '<li style="color:var(--text-secondary);">Aucun score</li>';
}

function loadBadges() {
    try { const r = localStorage.getItem(BADGE_KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; }
}

function saveBadges(b) { try { localStorage.setItem(BADGE_KEY, JSON.stringify(b)); } catch (e) {} }

function getBadgesFor(name) {
    const all = loadBadges();
    return all[name] || [];
}

function awardBadge(name, badge) {
    if (!name || !badge) return;
    const all = loadBadges();
    all[name] = all[name] || [];
    if (!all[name].includes(badge)) {
        all[name].push(badge);
        saveBadges(all);
        // show toast
        showBadgeToast(name, badge);
    }
}

function showBadgeToast(name, badge) {
    try {
        const t = document.createElement('div');
        t.className = 'badge-toast';
        t.innerHTML = `🏅 ${badge} — ${name}`;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('visible'), 20);
        setTimeout(() => t.classList.remove('visible'), 2600);
        setTimeout(() => t.remove(), 3000);
    } catch (e) { /* ignore */ }
}

// expose leaderboard update on init
updateLeaderboardUI();

// ========== INIT ==========
init();
