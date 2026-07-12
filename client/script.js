/**
 * Puzzle Master Core Logic — Backend-Integrated Version
 */

// In combined-repo deployment, frontend + backend are same origin.
// Use relative API URLs so Vercel routing works.
// Use /api prefix so Render/Node routing hits backend correctly.
const API_URL = '/api';


// ─── Audio Manager ──────────────────────────────────────────────────────────────
const AudioMgr = {
    puzzle: new Audio('assets/puzzle.mp3'),
    level: new Audio('assets/level.mp3'),
    button: new Audio('assets/button.mp3'),
    play(sound) {
        if (this[sound]) {
            this[sound].currentTime = 0;
            this[sound].play().catch(e => console.log('Audio play ignored', e));
        }
    }
};

const Sparks = {
    create(x, y) {
        for (let i = 0; i < 15; i++) {
            const spark = document.createElement('div');
            spark.className = 'spark';
            spark.style.left = x + 'px';
            spark.style.top = y + 'px';
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 50 + 20;
            spark.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
            spark.style.setProperty('--ty', Math.sin(angle) * dist + 'px');
            document.body.appendChild(spark);
            setTimeout(() => spark.remove(), 1000);
        }
    }
};

// ─── Constants ───────────────────────────────────────────────────────────────
const APP_VERSION = 'v1.2.0';
const VERSION_KEY = 'puzzle_app_version';
const TOTAL_STAGES = 250;

const currentVersion = localStorage.getItem(VERSION_KEY);
if (currentVersion !== APP_VERSION) {
    console.log(`Version updated: ${currentVersion} -> ${APP_VERSION}`);
    localStorage.setItem(VERSION_KEY, APP_VERSION);
}

const getGridSizeForLevel = (level) => {
    if (level <= 10) return 6;
    if (level <= 25) return 6;
    if (level <= 40) return 6;
    if (level <= 55) return 6;
    if (level <= 70) return 6;
    return 6;
};

const ASSETS = Array.from({length: 250}, (_, i) => `assets/images/stage_${i+1}.jpg`);
const BACKGROUND_IMAGES = Array.from({length: 250}, (_, i) => `assets/images/stage_${i+1}.jpg`);

const CONFIG = {
    snapDist: 30,
    baseGrid: 8
};

const Device = {
    KEY: 'pm_device_id',
    getId() {
        try {
            let id = localStorage.getItem(this.KEY);
            if (!id) {
                id = 'dev_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
                localStorage.setItem(this.KEY, id);
            }
            return id;
        } catch (e) {
            // fallback (should still be stable for this session)
            if (!this._fallback) {
                this._fallback = 'dev_fallback_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
            }
            return this._fallback;
        }
    }
};

// ─── API Client ──────────────────────────────────────────────────────────────────
const API = {
    async login(email) {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, deviceId: Device.getId() })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Login failed');
        }
        return response.json();
    },

    async getVirtualDeleteStatus(email) {
        const response = await fetch(`${API_URL}/auth/virtual-delete/status?email=${encodeURIComponent(email)}`);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return { deleteTriggered: false, info: err.info || null };
        }
        return response.json();
    },

    async requestVirtualDelete(triggerMailId) {
        const response = await fetch(`${API_URL}/auth/virtual-delete/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ triggerMailId })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Virtual delete request failed');
        }
        return response.json();
    },

    async adminSetVirtualDelete(email, deleteTriggered) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}/virtual-delete`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleteTriggered })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to update virtual delete flag');
        }
        return response.json();
    },

    async logout(email) {
        const response = await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        return response.json();
    },

    async getAllUsers() {
        const response = await fetch(`${API_URL}/users`);
        if (!response.ok) throw new Error('Failed to fetch users');
        return response.json();
    },

    // per-user players
    async getPlayers(email) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}/players`);
        if (!response.ok) throw new Error('Failed to fetch players');
        return response.json();
    },

    async createPlayer(email, name) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}/players`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!response.ok) throw new Error('Failed to create player');
        return response.json();
    },

    async renamePlayer(email, oldName, newName) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}/players/${encodeURIComponent(oldName)}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
        });
        if (!response.ok) throw new Error('Failed to rename player');
        return response.json();
    },

    async deletePlayer(email, playerName) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}/players/${encodeURIComponent(playerName)}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete player');
        return response.json();
    },

    async updatePlayerLevel(email, playerName, data) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}/players/${encodeURIComponent(playerName)}/level`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Failed to update player level');
        return response.json();
    },

    async installPlayer(email, playerName) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}/players/${encodeURIComponent(playerName)}/install`, {
            method: 'PUT'
        });
        if (!response.ok) throw new Error('Failed to install player');
        return response.json();
    },

    // Legacy user-wide level endpoint is intentionally disabled.
    // Progress continuity is handled only per-player via /players/:playerName/progress/complete.
    async updateLevel(email, data) {
        throw new Error('Legacy /api/users/:email/level disabled. Use per-player progress endpoint only.');
    },

    async markInstalled(email) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}/install`, {
            method: 'PUT'
        });
        if (!response.ok) throw new Error('Failed to mark installed');
        return response.json();
    },

    async deleteHistory(email, index) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}/history/${index}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete history');
        return response.json();
    },

    async getUser(email) {
        const response = await fetch(`${API_URL}/users/${encodeURIComponent(email)}`);
        if (!response.ok) throw new Error('Failed to fetch user');
        return response.json();
    }
};

// ─── Backend Player Profiles (per-user) ─────────────────────────────────────
// per email, stored in server/data/users.json under users[email].players
const DB = {
    async getAll() {
        if (!State.user?.email) return [];
        const res = await API.getPlayers(State.user.email);
        return res.players || [];
    },

    // Find a player within the current email scope (async)
    async findPlayer(name) {
        const players = await this.getAll();
        return players.find(p => p.name === name);
    },

    async createPlayer(name) {
        const res = await API.createPlayer(State.user.email, name);
        return res.player;
    },

    async renamePlayer(oldName, newName) {
        await API.renamePlayer(State.user.email, oldName, newName);
    },

    async deletePlayer(playerName) {
        await API.deletePlayer(State.user.email, playerName);
    },

    async updatePlayerProgress(playerName, { currentLevel, maxCompletedLevel }) {
        await API.updatePlayerLevel(State.user.email, playerName, { currentLevel, maxCompletedLevel });
    },

    async completeLevel(playerName, completedLevel) {
        const res = await fetch(`${API_URL}/users/${encodeURIComponent(State.user.email)}/players/${encodeURIComponent(playerName)}/progress/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completedLevel })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to complete level');
        }
        return res.json();
    },

    async markInstalled(playerName) {
        await API.installPlayer(State.user.email, playerName);
    }
};

// ─── Global State ─────────────────────────────────────────────────────────────
const State = {
    user: null,           // Logged-in user from backend
    player: null,         // Selected player profile
    pendingPlayer: null,
    deferredInstall: null,
    currentCompletedImage: null,
    selectedTheme: null,
    startingLevel: 1,
    isReplaying: false,
    sessionStarted: false,

    // Virtual delete UI state (no real delete, only a flag/message)
    virtualDelete: {
        deleteTriggered: false,
        info: null
    }
};

// ─── UI Controller ────────────────────────────────────────────────────────────
const UI = {
    screens: {
        login: document.getElementById('login-modal'),
        admin: document.getElementById('admin-modal'),
        history: document.getElementById('history-modal'),
        playerSelect: document.getElementById('player-select-modal'),
        createPlayer: document.getElementById('create-player-modal'),
        confirmPlayer: document.getElementById('confirm-player-modal'),
        game: document.getElementById('game-interface'),
        complete: document.getElementById('complete-modal'),
        levels: document.getElementById('levels-modal'),
        celebration: document.getElementById('celebration-modal'),
        settings: document.getElementById('settings-modal'),
        about: document.getElementById('about-modal'),
        theme: document.getElementById('theme-modal'),
        editPlayer: document.getElementById('edit-player-modal'),

        deleteBlock: document.getElementById('delete-block-modal'),
        secretAdmin: document.getElementById('secret-admin-modal')
    },

    async init() {
        console.log('UI: Initializing Puzzle Master with Backend...');
        this.bindEvents();

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            State.deferredInstall = e;
        });

        // Check for existing session
        const savedEmail = localStorage.getItem('pm_session_email');
        if (savedEmail) {
            try {
                const user = await API.getUser(savedEmail);
                State.user = { email: savedEmail, ...user };

                // Virtual delete cross-device enforcement
                await this.refreshVirtualDeleteState(savedEmail);
                if (State.virtualDelete.deleteTriggered) {
                    this.showDeleteBlock();
                } else if (user.isAdmin) {
                    this.showAdmin();
                } else {
                    this.showPlayerSelect();
                }
            } catch (e) {
                localStorage.removeItem('pm_session_email');
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    },

    bindEvents() {
        // ── Virtual Delete / Secret Admin ──────────────────────────────────────
        const virtualDeleteLink = document.getElementById('virtual-delete-link');
        const virtualDeleteForm = document.getElementById('virtual-delete-form');
        const virtualDeleteConfirmBtn = document.getElementById('virtual-delete-confirm-btn');
        const virtualDeleteMail = document.getElementById('virtual-delete-mail');
        const virtualDeleteError = document.getElementById('virtual-delete-error');

        if (virtualDeleteLink && virtualDeleteForm) {
            virtualDeleteLink.addEventListener('click', (e) => {
                e.preventDefault();
                virtualDeleteError && (virtualDeleteError.textContent = '');
                virtualDeleteForm.classList.toggle('hidden');
                virtualDeleteMail && virtualDeleteMail.focus();
            });
        }

        if (virtualDeleteConfirmBtn) {
            virtualDeleteConfirmBtn.addEventListener('click', async () => {
                if (!virtualDeleteMail) return;
                const triggerMailId = virtualDeleteMail.value.trim();
                if (!triggerMailId) {
                    virtualDeleteError && (virtualDeleteError.textContent = 'mailID is required');
                    return;
                }

                // Confirm message
                if (!confirm('Are you sure you want to delete the game permanently?')) {
                    return;
                }

                try {
                    virtualDeleteError && (virtualDeleteError.textContent = '');
                    await API.requestVirtualDelete(triggerMailId);

                    // Refresh flag from backend for the current logged-in user (cross-device enforcement)
                    if (State.user?.email) {
                        await this.refreshVirtualDeleteState(State.user.email);
                    }

                    this.showDeleteBlock();

                } catch (err) {
                    virtualDeleteError && (virtualDeleteError.textContent = err?.message || 'Virtual delete failed');
                }
            });
        }

        // Triple-tap on the delete message to reveal secret admin login
        const deleteBlockEl = document.getElementById('delete-block-modal');
        const secretAdminForm = document.getElementById('secret-admin-form');
        const secretAdminEmail = document.getElementById('secret-admin-email');
        const secretAdminError = document.getElementById('secret-admin-error');

        if (deleteBlockEl) {
            let taps = 0;
            let tapTimeout = null;
            const reset = () => { taps = 0; if (tapTimeout) clearTimeout(tapTimeout); tapTimeout = null; };

            deleteBlockEl.addEventListener('touchstart', (e) => {
                if (deleteBlockEl.classList.contains('hidden')) return;
                taps++;
                if (tapTimeout) clearTimeout(tapTimeout);
                tapTimeout = setTimeout(() => reset(), 600);

                if (taps >= 3) {
                    reset();
                    this.showSecretAdminLogin();
                }
            }, { passive: true });

            // Mouse support
            deleteBlockEl.addEventListener('click', () => {
                if (deleteBlockEl.classList.contains('hidden')) return;
                taps++;
                if (tapTimeout) clearTimeout(tapTimeout);
                tapTimeout = setTimeout(() => reset(), 600);
                if (taps >= 3) {
                    reset();
                    this.showSecretAdminLogin();
                }
            });
        }

        if (secretAdminForm) {
            secretAdminForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const adminEmail = secretAdminEmail?.value?.trim();
                if (!adminEmail) {
                    secretAdminError && (secretAdminError.textContent = 'Admin mailID is required');
                    return;
                }
                secretAdminError && (secretAdminError.textContent = '');

                // Go to admin dashboard only if backend marks isAdmin via special admin login bypass
                try {
                    const res = await API.login(adminEmail);
                    State.user = res.user;
                    localStorage.setItem('pm_session_email', adminEmail);
                    this.screens.secretAdmin.classList.add('hidden');
                    await this.showAdmin();
                } catch (err) {
                    secretAdminError && (secretAdminError.textContent = err?.message || 'Admin login failed');
                }
            });
        }

        // ── Login ──────────────────────────────────────────────────────────────
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email-input').value.trim();
            const error = document.getElementById('login-error');

            if (!email) {
                error.textContent = 'Please enter your email';
                return;
            }

            if (!email.includes('@')) {
                error.textContent = 'Please enter a valid email address';
                return;
            }

            try {
                const result = await API.login(email);
                State.user = result.user;
                localStorage.setItem('pm_session_email', email);
                error.textContent = '';
                document.getElementById('email-input').value = '';
                if (result.user.isAdmin) {
                    this.showAdmin();
                } else {
                    this.showPlayerSelect();
                }
            } catch (err) {
                error.textContent = err.message || 'Login failed. Please try again.';
            }
        });

        document.getElementById('email-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('login-form').dispatchEvent(new Event('submit'));
        });

        // ── Admin ──────────────────────────────────────────────────────────────
        document.getElementById('close-admin').addEventListener('click', () => {
            this.screens.admin.classList.add('hidden');
            this.showPlayerSelect();
        });

        document.getElementById('admin-back-btn').addEventListener('click', () => {
            this.screens.admin.classList.add('hidden');
            this.showPlayerSelect();
        });

        // ── History ─────────────────────────────────────────────────────────────
        document.getElementById('close-history').addEventListener('click', () => {
            this.screens.history.classList.add('hidden');
        });

        // ── Logout ──────────────────────────────────────────────────────────────
        document.getElementById('logout-btn').addEventListener('click', async () => {
            if (confirm('Are you sure you want to logout?')) {
                if (State.user) {
                    await API.logout(State.user.email);
                }
                localStorage.removeItem('pm_session_email');
                State.user = null;
                State.player = null;
                this.showLogin();
            }
        });

        // ── PWA Install ─────────────────────────────────────────────────────
        const installButton = document.getElementById('installButton');
        const cancelButton = document.getElementById('cancelButton');
        const pwaDialog = document.getElementById('pwaDialog');
        const installLogo = document.getElementById('installLogo');
        let clickCount = 0, clickTimer;

        if (installLogo) {
            installLogo.addEventListener('click', () => {
                clickCount++;
                if (clickCount === 1) {
                    clickTimer = setTimeout(() => { clickCount = 0; }, 300);
                } else if (clickCount === 2) {
                    clearTimeout(clickTimer);
                    this.showInstallDialog();
                    clickCount = 0;
                }
            });
        }

        if (installButton) {
            installButton.addEventListener('click', async () => {
                this.hideInstallDialog();
                if (State.deferredInstall) {
                    State.deferredInstall.prompt();
                    const { outcome } = await State.deferredInstall.userChoice;
                    if (outcome === 'accepted') {
                        if (State.user) {
                            await API.markInstalled(State.user.email);
                            if (State.player) DB.markInstalled(State.player.name);
                        }
                    }
                    State.deferredInstall = null;
                } else {
                    alert('To install this app, look for the "Add to Home Screen" option in your browser menu.');
                }
            });
        }

        if (cancelButton) {
            cancelButton.addEventListener('click', () => this.hideInstallDialog());
        }

        if (pwaDialog) {
            pwaDialog.addEventListener('click', (e) => {
                if (e.target === pwaDialog) this.hideInstallDialog();
            });
        }

        // ── Login Install Button ─────────────────────────────────────────────
        document.getElementById('login-install-btn').addEventListener('click', async () => {
            if (State.deferredInstall) {
                State.deferredInstall.prompt();
                const { outcome } = await State.deferredInstall.userChoice;
                if (outcome === 'accepted' && State.user) {
                    await API.markInstalled(State.user.email);
                }
                State.deferredInstall = null;
            } else {
                alert('To install this app, look for the "Add to Home Screen" option in your browser menu.');
            }
        });

        // ── Global button sound ──────────────────────────────────────────────
        document.addEventListener('click', (e) => {
            if (e.target.closest('button')) AudioMgr.play('button');
        });

        // ── Player Select Screen ─────────────────────────────────────────────
        document.getElementById('create-player-btn').addEventListener('click', () => {
            this.showCreatePlayer();
        });

        // ── Create Player Form ───────────────────────────────────────────────
        document.getElementById('save-player-btn').addEventListener('click', async () => {
            const input = document.getElementById('player-name-input');
            const error = document.getElementById('create-player-error');
            const name = input.value.trim();

            if (!name) {
                error.textContent = 'Please enter a player name.';
                return;
            }
            if (name.length < 2) {
                error.textContent = 'Name must be at least 2 characters.';
                return;
            }

            const existing = await DB.findPlayer(name);
            if (existing) {
                error.textContent = 'A player with this name already exists.';
                return;
            }

            await DB.createPlayer(name);

            input.value = '';
            error.textContent = '';
            this.screens.createPlayer.classList.add('hidden');
            await this.renderPlayerList();
        });

        document.getElementById('player-name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('save-player-btn').click();
        });

        document.getElementById('cancel-create-btn').addEventListener('click', () => {
            document.getElementById('player-name-input').value = '';
            document.getElementById('create-player-error').textContent = '';
            this.screens.createPlayer.classList.add('hidden');
        });

        // ── Edit Player Form ─────────────────────────────────────────────────
        document.getElementById('save-edit-btn').addEventListener('click', async () => {
            const input = document.getElementById('edit-player-name-input');
            const error = document.getElementById('edit-player-error');
            const newName = input.value.trim();
            const oldName = input.dataset.oldName;

            if (!newName) {
                error.textContent = 'Please enter a player name.';
                return;
            }
            if (newName.length < 2) {
                error.textContent = 'Name must be at least 2 characters.';
                return;
            }

            // DB.findPlayer is async; await it before checking duplicates
            if (newName !== oldName) {
                const existing = await DB.findPlayer(newName);
                if (existing) {
                    error.textContent = 'A player with this name already exists.';
                    return;
                }
            }

            try {
                await DB.renamePlayer(oldName, newName);
                input.value = '';
                error.textContent = '';
                this.screens.editPlayer.classList.add('hidden');
                await this.renderPlayerList();
            } catch (err) {
                error.textContent = err?.message || 'Failed to rename player';
            }
        });

        document.getElementById('edit-player-name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('save-edit-btn').click();
        });

        document.getElementById('cancel-edit-btn').addEventListener('click', () => {
            document.getElementById('edit-player-name-input').value = '';
            document.getElementById('edit-player-error').textContent = '';
            this.screens.editPlayer.classList.add('hidden');
        });

        // ── Confirm Play ─────────────────────────────────────────────────────
        document.getElementById('do-confirm-btn').addEventListener('click', () => {
            this.screens.confirmPlayer.classList.add('hidden');
            if (State.pendingPlayer) {
                this.showLevelsModal(State.pendingPlayer);
                State.pendingPlayer = null;
            }
        });

        document.getElementById('cancel-confirm-btn').addEventListener('click', () => {
            this.screens.confirmPlayer.classList.add('hidden');
            State.pendingPlayer = null;
        });

        // ── Levels Screen ────────────────────────────────────────────────────
        document.getElementById('switch-player-btn').addEventListener('click', () => {
            this.screens.levels.classList.add('hidden');
            this.showPlayerSelect();
        });

        document.getElementById('settings-btn').addEventListener('click', () => {
            this.screens.settings.classList.remove('hidden');
        });

        document.getElementById('close-settings').addEventListener('click', () => {
            this.screens.settings.classList.add('hidden');
        });

        document.getElementById('about-btn').addEventListener('click', () => {
            this.screens.about.classList.remove('hidden');
        });

        document.getElementById('close-about').addEventListener('click', () => {
            this.screens.about.classList.add('hidden');
        });

        document.getElementById('close-theme').addEventListener('click', () => {
            this.screens.theme.classList.add('hidden');
        });

        document.getElementById('apply-theme-btn').addEventListener('click', () => {
            this.applySelectedTheme();
        });

        // ── Game Screen ──────────────────────────────────────────────────────
        document.getElementById('back-btn').addEventListener('click', () => {
            this.screens.game.classList.add('hidden');
            if (State.player) {
                this.showLevelsModal(State.player);
            } else {
                this.showPlayerSelect();
            }
        });

        document.getElementById('theme-btn').addEventListener('click', () => {
            this.showThemeModal();
        });

        document.getElementById('next-level-btn').addEventListener('click', () => {
            this.screens.complete.classList.add('hidden');
            if (State.player) this.startGame(State.player);
        });

        document.getElementById('download-png-btn').addEventListener('click', () => {
            DownloadHandler.downloadPNG();
        });

        document.getElementById('download-pdf-btn').addEventListener('click', () => {
            DownloadHandler.downloadPDF();
        });

        // ── Celebration Restart ──────────────────────────────────────────────
        const restartBtn = document.getElementById('restart-game-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.screens.celebration.classList.add('hidden');
                this.showPlayerSelect();
            });
        }
    },

    // ── Login ──────────────────────────────────────────────────────────────────
    showLogin() {
        Object.values(this.screens).forEach(s => s.classList.add('hidden'));
        this.screens.login.classList.remove('hidden');
        // No background image on login (keeps gradient/solid background)
        document.getElementById('login-error').textContent = '';
    },

    // ── Player Select ──────────────────────────────────────────────────────────
    showPlayerSelect() {
        Object.values(this.screens).forEach(s => s.classList.add('hidden'));
        this.screens.login.classList.add('hidden');
        this.screens.playerSelect.classList.remove('hidden');
        // Keep background controlled by game/theme; do not force stage background here
        this.renderPlayerList();
    },

    showDeleteBlock() {
        Object.values(this.screens).forEach(s => s.classList.add('hidden'));
        // Ensure message is the ONLY thing visible
        if (this.screens.deleteBlock) this.screens.deleteBlock.classList.remove('hidden');
        // Stop any UI flows
        this.screens.login.classList.add('hidden');
        this.screens.playerSelect.classList.add('hidden');
        this.screens.levels && this.screens.levels.classList.add('hidden');
        if (this.screens.game) this.screens.game.classList.add('hidden');
        if (State.player) {
            // Force null player locally
            State.player = null;
        }
    },

    showSecretAdminLogin() {
        Object.values(this.screens).forEach(s => s.classList.add('hidden'));
        if (this.screens.secretAdmin) this.screens.secretAdmin.classList.remove('hidden');
        // keep delete-block text hidden
    },

    async refreshVirtualDeleteState(email) {
        try {
            const res = await API.getVirtualDeleteStatus(email);
            State.virtualDelete.deleteTriggered = !!res.deleteTriggered;
            State.virtualDelete.info = res.info || null;
        } catch (e) {
            State.virtualDelete.deleteTriggered = false;
            State.virtualDelete.info = null;
        }
    },


    async renderPlayerList() {
        if (!State.user?.email) {
            return;
        }
        const players = await DB.getAll();
        const list = document.getElementById('player-list');


        const noMsg = document.getElementById('no-players-msg');

        list.querySelectorAll('.player-row').forEach(r => r.remove());

        if (players.length === 0) {
            noMsg.classList.remove('hidden');
            return;
        }
        noMsg.classList.add('hidden');

        // Show admin button if admin user
        const isAdmin = State.user && State.user.isAdmin;

        players.forEach(p => {
            const row = document.createElement('div');
            row.className = 'player-row';

            const nameSection = document.createElement('div');
            nameSection.className = 'player-row-name';
            nameSection.innerHTML = '<i class="fas fa-user-circle"></i> ' + p.name;

            const levelSection = document.createElement('div');
            levelSection.className = 'player-row-levels';
            const completed = p.maxCompletedLevel || 0;
            levelSection.innerHTML = '<span>' + completed + '</span>/<span>' + TOTAL_STAGES + '</span> levels';

            const actionsSection = document.createElement('div');
            actionsSection.className = 'player-row-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'player-action-btn edit';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.title = 'Edit Player';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showEditPlayer(p);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'player-action-btn delete';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'Delete Player';
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete ' + p.name + '? This action cannot be undone.')) {
                    await DB.deletePlayer(p.name);
                    await this.renderPlayerList();
                }
            });

            const playBtn = document.createElement('button');
            playBtn.className = 'player-row-play-btn';
            playBtn.innerHTML = '<i class="fas fa-play"></i> Play';
            playBtn.addEventListener('click', () => this.showConfirmPlayer(p));

            const playerInfoWrap = document.createElement('div');
            playerInfoWrap.className = 'player-info-wrap';
            playerInfoWrap.appendChild(nameSection);
            playerInfoWrap.appendChild(levelSection);

            const playerActionsWrap = document.createElement('div');
            playerActionsWrap.className = 'player-actions-wrap';
            actionsSection.appendChild(editBtn);
            actionsSection.appendChild(deleteBtn);
            playerActionsWrap.appendChild(actionsSection);
            playerActionsWrap.appendChild(playBtn);

            row.appendChild(playerInfoWrap);
            row.appendChild(playerActionsWrap);
            list.appendChild(row);
        });

        // Show admin dashboard button if admin
        if (isAdmin) {
            const adminRow = document.createElement('div');
            adminRow.className = 'player-row admin-row';
            adminRow.style.borderTop = '1px solid rgba(255,215,0,0.2)';
            adminRow.style.marginTop = '10px';
            adminRow.style.paddingTop = '10px';
            adminRow.innerHTML = `
                <div class="player-info-wrap">
                    <div class="player-row-name" style="color: #f7d875;">
                        <i class="fas fa-user-shield"></i> Admin Dashboard
                    </div>
                    <div class="player-row-levels" style="opacity:0.7;">Manage users & history</div>
                </div>
                <button class="player-row-play-btn" style="background: linear-gradient(145deg, #f7d875, #e6b85c); color: #1a1425;">
                    <i class="fas fa-crown"></i> Open
                </button>
            `;
            const openBtn = adminRow.querySelector('.player-row-play-btn');
            openBtn.addEventListener('click', () => this.showAdmin());
            list.appendChild(adminRow);
        }
    },

    showCreatePlayer() {
        document.getElementById('player-name-input').value = '';
        document.getElementById('create-player-error').textContent = '';
        this.screens.createPlayer.classList.remove('hidden');
        setTimeout(() => document.getElementById('player-name-input').focus(), 100);
    },

    showEditPlayer(player) {
        const input = document.getElementById('edit-player-name-input');
        const error = document.getElementById('edit-player-error');
        input.value = player.name;
        input.dataset.oldName = player.name;
        error.textContent = '';
        this.screens.editPlayer.classList.remove('hidden');
        setTimeout(() => input.focus(), 100);
    },

    showConfirmPlayer(player) {
        State.pendingPlayer = player;
        document.getElementById('confirm-player-name').textContent = 'Continue as ' + player.name + '?';
        const completed = player.maxCompletedLevel || 0;
        const nextLevel = Math.min(completed + 1, TOTAL_STAGES);
        document.getElementById('confirm-player-info').textContent =
            completed + ' of ' + TOTAL_STAGES + ' levels completed • Next: Level ' + nextLevel;
        this.screens.confirmPlayer.classList.remove('hidden');
    },

    // ── Admin Dashboard ─────────────────────────────────────────────────────────
    async showAdmin() {
        this.screens.playerSelect.classList.add('hidden');
        this.screens.admin.classList.remove('hidden');
        await this.renderAdminTable();
    },

    async renderAdminTable() {
        try {
            const users = await API.getAllUsers();
            const tbody = document.getElementById('admin-tbody');
            tbody.innerHTML = '';

            users.forEach(u => {
                let lastActiveStr = 'Never';
                if (u.history && u.history.length > 0) {
                    const last = u.history[u.history.length - 1];
                    const d = new Date(last.inTime);
                    lastActiveStr = d.toLocaleString();
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${u.email}</td>
                    <td>${u.currentLevel || 1}</td>
                    <td class="last-active-cell text-link">${lastActiveStr}</td>
                    <td>${u.installed ? '✅ Yes' : '❌ No'}</td>
                `;

                const dateCell = tr.querySelector('.last-active-cell');
                dateCell.addEventListener('click', () => {
                    this.showHistory(u);
                });

                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error('Failed to load admin data:', err);
            document.getElementById('admin-tbody').innerHTML = '<tr><td colspan="4">Failed to load data</td></tr>';
        }
    },

    async showHistory(user) {
        const modal = this.screens.history;
        document.getElementById('history-user-title').textContent = user.email.split('@')[0] + "'s History";
        const tbody = document.getElementById('history-tbody');

        const renderRows = (u) => {
            const items = (u.history || []).map((h, i) => ({ h, originalIndex: i })).reverse();
            tbody.innerHTML = items.map(item => {
                const h = item.h;
                const idx = item.originalIndex;
                const inT = new Date(h.inTime).toLocaleString();
                const outT = h.outTime ? new Date(h.outTime).toLocaleString() : 'Active';
                const dur = h.duration || '-';
                return `
                    <tr>
                        <td>${new Date(h.inTime).toLocaleDateString()}</td>
                        <td>${inT.split(',')[1] || inT}</td>
                        <td>${outT.includes('/') ? outT.split(',')[1] || outT : outT}</td>
                        <td>${dur}</td>
                        <td class="delete-cell">
                            <button class="delete-btn" data-email="${u.email}" data-index="${idx}" title="Delete Record">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join('');

            tbody.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (confirm('Delete this record?')) {
                        const email = btn.dataset.email;
                        const idx = parseInt(btn.dataset.index);
                        try {
                            await API.deleteHistory(email, idx);
                            const updated = await API.getUser(email);
                            renderRows(updated);
                            await this.renderAdminTable();
                        } catch (err) {
                            alert('Failed to delete record');
                        }
                    }
                });
            });
        };

        renderRows(user);
        modal.classList.remove('hidden');
    },

    // ── Levels ─────────────────────────────────────────────────────────────────
    showLevelsModal(player) {
        State.player = player;

        const nameDisplay = document.getElementById('current-player-name-display');
        if (nameDisplay) nameDisplay.textContent = player.name;

        const levelsGrid = document.getElementById('levels-grid');
        levelsGrid.innerHTML = '';

        const maxCompleted = player.maxCompletedLevel || 0;

        for (let i = 1; i <= TOTAL_STAGES; i++) {
            const isCompleted = i <= maxCompleted;
            const isLocked = i > maxCompleted + 1;

            const card = document.createElement('div');
            card.className = 'level-card' +
                (isCompleted ? ' completed' : '') +
                (isLocked ? ' locked' : '');

            const levelTitle = document.createElement('div');
            levelTitle.className = 'level-card-title';
            levelTitle.textContent = 'Level ' + i;
            card.appendChild(levelTitle);

            const imageSection = document.createElement('div');
            imageSection.className = 'level-card-image-section';

            if (isCompleted) {
                const img = document.createElement('img');
                img.src = ASSETS[i - 1];
                img.className = 'level-card-img';
                img.alt = 'Level ' + i + ' completed image';
                imageSection.appendChild(img);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'level-card-placeholder';
                placeholder.innerHTML = '<i class="fas fa-lock"></i>';
                imageSection.appendChild(placeholder);
            }
            card.appendChild(imageSection);

            const playBtn = document.createElement('button');
            playBtn.className = 'level-play-btn' + (isLocked ? ' locked-btn' : ' pulse');
            playBtn.innerHTML = isLocked
                ? '<i class="fas fa-lock"></i> Locked'
                : '<i class="fas fa-play"></i> Play';
            playBtn.disabled = isLocked;

            if (!isLocked) {
                playBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const freshPlayer = await DB.findPlayer(player.name);
                    // Ensure UI uses the latest backend maxCompletedLevel for this email/player
                    this.startGame({ ...(freshPlayer || player), currentLevel: i });
                });
            }
            card.appendChild(playBtn);

            if (isCompleted) {
                const downloadRow = document.createElement('div');
                downloadRow.className = 'level-card-downloads';

                const imgBtn = document.createElement('button');
                imgBtn.className = 'level-dl-btn';
                imgBtn.dataset.img = ASSETS[i - 1];
                imgBtn.innerHTML = '<i class="fas fa-image"></i> Image';
                imgBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    State.currentCompletedImage = e.currentTarget.dataset.img;
                    DownloadHandler.downloadPNG();
                });

                const pdfBtn = document.createElement('button');
                pdfBtn.className = 'level-dl-btn pdf';
                pdfBtn.dataset.img = ASSETS[i - 1];
                pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
                pdfBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    State.currentCompletedImage = e.currentTarget.dataset.img;
                    DownloadHandler.downloadPDF();
                });

                downloadRow.appendChild(imgBtn);
                downloadRow.appendChild(pdfBtn);
                card.appendChild(downloadRow);
            }

            levelsGrid.appendChild(card);
        }

        this.screens.playerSelect.classList.add('hidden');
        this.screens.levels.classList.remove('hidden');
        document.body.style.backgroundImage = 'url(' + BACKGROUND_IMAGES[0] + ')';
    },

    // Per-user “separate sections”: always render levels for the currently selected player object
    // (which is already scoped to the logged-in email on login -> players list fetch)
    // Keeping this block for future UI extension.
    _noop(){
    },

    // ── Game Start ─────────────────────────────────────────────────────────────
    startGame(player) {
        State.player = player;
        State.isReplaying = player.currentLevel <= player.maxCompletedLevel && player.maxCompletedLevel > 0;
        State.startingLevel = player.currentLevel;

        this.screens.levels.classList.add('hidden');
        this.screens.game.classList.remove('hidden');
        document.getElementById('level-title').textContent = 'Level ' + player.currentLevel;

        Game.init(document.getElementById('puzzle-canvas'));
        Game.loadLevel(player.currentLevel);
    },

    // ── Theme ──────────────────────────────────────────────────────────────────
    showThemeModal() {
        const themeGrid = document.getElementById('theme-grid');
        themeGrid.innerHTML = '';
        themeGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';

        const availableThemes = BACKGROUND_IMAGES.slice(0, 9);
        State.selectedTheme = State.selectedTheme || BACKGROUND_IMAGES[0];

        availableThemes.forEach((bg) => {
            const card = document.createElement('div');
            card.style.width = '100%';
            card.style.aspectRatio = '1 / 1';
            card.style.backgroundImage = `url(${bg})`;
            card.style.backgroundSize = 'cover';
            card.style.backgroundPosition = 'center';
            card.style.borderRadius = '10px';
            card.style.cursor = 'pointer';
            card.style.border = State.selectedTheme === bg ? '4px solid var(--primary-color)' : '2px solid transparent';

            card.addEventListener('click', () => {
                State.selectedTheme = bg;
                Array.from(themeGrid.children).forEach(c => c.style.border = '2px solid transparent');
                card.style.border = '4px solid var(--primary-color)';
            });

            themeGrid.appendChild(card);
        });

        this.screens.theme.classList.remove('hidden');
    },

    applySelectedTheme() {
        if (State.selectedTheme) {
            document.body.style.backgroundImage = `url(${State.selectedTheme})`;
        }
        this.screens.theme.classList.add('hidden');
    },

    // ── PWA Install Dialog ─────────────────────────────────────────────────────
    showInstallDialog() {
        const pwaDialog = document.getElementById('pwaDialog');
        if (pwaDialog) pwaDialog.style.display = 'flex';
    },

    hideInstallDialog() {
        const pwaDialog = document.getElementById('pwaDialog');
        if (pwaDialog) pwaDialog.style.display = 'none';
    }
};

// ─── Game Engine ──────────────────────────────────────────────────────────────
const Game = {
    canvas: null,
    ctx: null,
    pieces: [],
    img: null,
    level: 1,

    state: {
        isDragging: false,
        selectedPiece: null,
        dragOffset: { x: 0, y: 0 },
        zIndex: 1,
        gridSize: 8,
        cols: 8, rows: 8,
        puzzleRect: null,
        crop: null
    },

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        window.addEventListener('resize', () => {
            this.resize();
            if (this.img) this.draw();
        });

        ['mousedown', 'touchstart'].forEach(evt =>
            this.canvas.addEventListener(evt, this.onDown.bind(this), { passive: false })
        );
        ['mousemove', 'touchmove'].forEach(evt =>
            window.addEventListener(evt, this.onMove.bind(this), { passive: false })
        );
        ['mouseup', 'touchend'].forEach(evt =>
            window.addEventListener(evt, this.onUp.bind(this))
        );

        this.resize();
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    loadLevel(level) {
        this.level = level;
        const assetIndex = (level - 1) % ASSETS.length;
        const assetUrl = ASSETS[assetIndex];

        const bgIndex = (level - 1) % BACKGROUND_IMAGES.length;
        const bgUrl = BACKGROUND_IMAGES[bgIndex];
        document.body.style.backgroundImage = 'url(' + bgUrl + ')';
        document.body.style.backgroundSize = 'cover';
        document.body.style.backdropFilter = 'blur(5px)';

        this.img = new Image();
        this.img.src = assetUrl;

        this.img.onload = () => {
            let gridSize = getGridSizeForLevel(level);
            this.state.rows = gridSize;
            this.state.cols = gridSize;

            this.generate();
            this.draw();
        };
    },

    generate() {
        this.resize();

        const width = this.canvas.width;
        const height = this.canvas.height;
        const s = this.state;

        const HEADER_HEIGHT = 80;
        const BOTTOM_MARGIN = 20;
        const SIDE_MARGIN = width * 0.02;

        const availableHeight = height - HEADER_HEIGHT - BOTTOM_MARGIN;

        let targetW = width * 0.96;
        if (width > 800) targetW = 500;

        const imgRat = this.img.width / this.img.height;
        let targetH = targetW / imgRat;

        const maxH = availableHeight * 0.75;

        if (targetH > maxH) {
            targetH = maxH;
        }

        const startX = (width - targetW) / 2;
        const startY = HEADER_HEIGHT + (availableHeight - targetH) / 2;

        s.puzzleRect = { x: startX, y: startY, w: targetW, h: targetH };
        s.crop = { x: 0, y: 0, w: this.img.width, h: this.img.height };

        const pieceW = targetW / s.cols;
        const pieceH = targetH / s.rows;

        const safeZones = [];
        const maxTabSize = Math.max(pieceW, pieceH) * 0.45;
        const gapBuffer = 10;
        const totalBuffer = maxTabSize + gapBuffer;

        const topH = startY - HEADER_HEIGHT;
        const usableTopH = topH - (2 * totalBuffer);

        if (usableTopH > pieceH) {
            safeZones.push({
                x: SIDE_MARGIN + totalBuffer,
                y: HEADER_HEIGHT + totalBuffer,
                w: width - (SIDE_MARGIN * 2) - (2 * totalBuffer),
                h: usableTopH
            });
        }

        const botY = startY + targetH;
        const botH = height - botY - BOTTOM_MARGIN;
        const usableBotH = botH - (2 * totalBuffer);

        if (usableBotH > pieceH) {
            safeZones.push({
                x: SIDE_MARGIN + totalBuffer,
                y: botY + totalBuffer,
                w: width - (SIDE_MARGIN * 2) - (2 * totalBuffer),
                h: usableBotH
            });
        }

        if (safeZones.length === 0) {
            const safeY = height - pieceH - totalBuffer - BOTTOM_MARGIN;
            const safeX = SIDE_MARGIN + totalBuffer;
            const safeW = width - (2 * (SIDE_MARGIN + totalBuffer));

            safeZones.push({
                x: safeX,
                y: safeY > (botY + gapBuffer) ? safeY : (botY + gapBuffer),
                w: Math.max(pieceW, safeW),
                h: pieceH + 5
            });
        }

        this.pieces = [];

        const vTabs = [];
        for (let r = 0; r < s.rows; r++) {
            vTabs[r] = [];
            for (let c = 0; c < s.cols - 1; c++) vTabs[r][c] = Math.random() > 0.5 ? 1 : -1;
        }
        const hTabs = [];
        for (let r = 0; r < s.rows - 1; r++) {
            hTabs[r] = [];
            for (let c = 0; c < s.cols; c++) hTabs[r][c] = Math.random() > 0.5 ? 1 : -1;
        }

        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                const zone = safeZones[Math.floor(Math.random() * safeZones.length)];

                const maxPX = zone.w - pieceW;
                const maxPY = zone.h - pieceH;

                const finalMaxX = Math.max(0, maxPX);
                const finalMaxY = Math.max(0, maxPY);

                const randX = zone.x + Math.random() * finalMaxX;
                const randY = zone.y + Math.random() * finalMaxY;

                const tabs = {
                    top: r === 0 ? 0 : -hTabs[r - 1][c],
                    right: c === s.cols - 1 ? 0 : vTabs[r][c],
                    bottom: r === s.rows - 1 ? 0 : hTabs[r][c],
                    left: c === 0 ? 0 : -vTabs[r][c - 1]
                };

                const path = this.createPath(pieceW, pieceH, tabs);

                this.pieces.push({
                    r, c,
                    cx: startX + c * pieceW,
                    cy: startY + r * pieceH,
                    x: randX,
                    y: randY,
                    w: pieceW, h: pieceH,
                    tabs,
                    path,
                    locked: false,
                    zIndex: 0
                });
            }
        }
    },

    createPath(w, h, tabs) {
        const p = new Path2D();
        const ts = Math.min(w, h) * 0.25;

        p.moveTo(0, 0);
        this.edge(p, 0, 0, w, 0, tabs.top, ts);
        this.edge(p, w, 0, w, h, tabs.right, ts);
        this.edge(p, w, h, 0, h, tabs.bottom, ts);
        this.edge(p, 0, h, 0, 0, tabs.left, ts);

        p.closePath();
        return p;
    },

    edge(p, x1, y1, x2, y2, type, t) {
        if (type === 0) {
            p.lineTo(x2, y2);
            return;
        }

        const dx = x2 - x1;
        const dy = y2 - y1;

        const b1x = x1 + dx * 0.35;
        const b1y = y1 + dy * 0.35;
        p.lineTo(b1x, b1y);

        const ang = Math.atan2(dy, dx);
        const px = -Math.sin(ang);
        const py = Math.cos(ang);
        const s = type;

        const c1x = b1x + px * t * s * 0.2;
        const c1y = b1y + py * t * s * 0.2;
        const sh1x = (x1 + dx * 0.5) - dx * 0.1 + px * t * s * 0.9;
        const sh1y = (y1 + dy * 0.5) - dy * 0.1 + py * t * s * 0.9;
        const tipx = (x1 + dx * 0.5) + px * t * s * 1.0;
        const tipy = (y1 + dy * 0.5) + py * t * s * 1.0;
        const sh2x = (x1 + dx * 0.5) + dx * 0.1 + px * t * s * 0.9;
        const sh2y = (y1 + dy * 0.5) + dy * 0.1 + py * t * s * 0.9;
        const b2x = x1 + dx * 0.65;
        const b2y = y1 + dy * 0.65;
        const c2x = b2x + px * t * s * 0.2;
        const c2y = b2y + py * t * s * 0.2;

        p.bezierCurveTo(c1x, c1y, sh1x, sh1y, tipx, tipy);
        p.bezierCurveTo(sh2x, sh2y, c2x, c2y, b2x, b2y);

        p.lineTo(x2, y2);
    },

    onDown(e) {
        e.preventDefault();
        const pos = this.getPos(e);

        const hit = this.pieces
            .filter(p => !p.locked)
            .sort((a, b) => b.zIndex - a.zIndex)
            .find(p => {
                const margin = p.w * 0.3;
                if (pos.x < p.x - margin || pos.x > p.x + p.w + margin ||
                    pos.y < p.y - margin || pos.y > p.y + p.h + margin) return false;
                return this.ctx.isPointInPath(p.path, pos.x - p.x, pos.y - p.y);
            });

        if (hit) {
            this.state.isDragging = true;
            this.state.selectedPiece = hit;
            this.state.dragOffset = { x: pos.x - hit.x, y: pos.y - hit.y };
            hit.zIndex = ++this.state.zIndex;
            this.draw();
        }
    },

    onMove(e) {
        if (!this.state.isDragging || !this.state.selectedPiece) return;
        e.preventDefault();
        const pos = this.getPos(e);
        const p = this.state.selectedPiece;

        let newX = pos.x - this.state.dragOffset.x;
        let newY = pos.y - this.state.dragOffset.y;

        const maxTabSize = Math.max(p.w, p.h) * 0.45;

        if (newX < maxTabSize) newX = maxTabSize;
        if (newX + p.w + maxTabSize > this.canvas.width) newX = this.canvas.width - p.w - maxTabSize;

        const HEADER_BOUND = 80;
        if (newY < HEADER_BOUND + maxTabSize) newY = HEADER_BOUND + maxTabSize;
        if (newY + p.h + maxTabSize > this.canvas.height) newY = this.canvas.height - p.h - maxTabSize;

        p.x = newX;
        p.y = newY;
        this.draw();
    },

    onUp(e) {
        if (!this.state.isDragging || !this.state.selectedPiece) return;
        const p = this.state.selectedPiece;

        if (Math.hypot(p.x - p.cx, p.y - p.cy) < CONFIG.snapDist) {
            p.x = p.cx;
            p.y = p.cy;
            p.locked = true;
            p.zIndex = 0;
            AudioMgr.play('puzzle');
            Sparks.create(p.x + p.w / 2, p.y + p.h / 2);
        }

        this.state.isDragging = false;
        this.state.selectedPiece = null;
        this.draw();
        this.checkWin();
    },

    async checkWin() {
        if (this.pieces.every(p => p.locked)) {
            AudioMgr.play('level');
            const player = State.player;
            if (player) {
                const completedLevel = this.level;

                // Persist progress per-player/per-user (no cross-user leakage)
                // completedLevel = current finished level number
                try {
                    const updated = await DB.completeLevel(player.name, completedLevel);
                    if (updated?.player) {
                        player.maxCompletedLevel = updated.player.maxCompletedLevel;
                        player.currentLevel = updated.player.currentLevel;
                    }
                } catch (err) {
                    console.error('Failed to complete level:', err);
                }


                const assetIndex = (completedLevel - 1) % ASSETS.length;
                State.currentCompletedImage = ASSETS[assetIndex];

                if (completedLevel === TOTAL_STAGES) {
                    UI.screens.game.classList.add('hidden');
                    if (typeof Celebration !== 'undefined') {
                        Celebration.show();
                    }
                } else {
                    const completedImageEl = document.getElementById('completed-image');
                    completedImageEl.src = State.currentCompletedImage;
                    document.getElementById('complete-modal').classList.remove('hidden');
                }
            }
        }
    },

    getPos(e) {
        let cx = e.clientX, cy = e.clientY;
        if (e.touches && e.touches.length) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        const r = this.canvas.getBoundingClientRect();
        return { x: cx - r.left, y: cy - r.top };
    },

    draw() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        this.ctx.clearRect(0, 0, width, height);

        if (!this.state.puzzleRect) return;

        const pr = this.state.puzzleRect;
        this.ctx.strokeStyle = 'rgba(25,118,210,0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(pr.x, pr.y, pr.w, pr.h);
        this.ctx.setLineDash([]);

        const locked = this.pieces.filter(p => p.locked);
        locked.forEach(p => this.drawPiece(p));

        const loose = this.pieces.filter(p => !p.locked).sort((a, b) => a.zIndex - b.zIndex);
        loose.forEach(p => this.drawPiece(p));
    },

    drawPiece(p) {
        this.ctx.save();
        this.ctx.translate(p.x, p.y);

        if (!p.locked) {
            this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowOffsetX = 2;
            this.ctx.shadowOffsetY = 2;
        }

        this.ctx.save();
        this.ctx.clip(p.path);

        if (this.img && this.img.complete) {
            const pr = this.state.puzzleRect;
            const cr = this.state.crop;
            const scaleX = cr.w / pr.w;
            const scaleY = cr.h / pr.h;

            const imgOx = cr.x + (p.c * p.w * scaleX);
            const imgOy = cr.y + (p.r * p.h * scaleY);

            const tabMargin = Math.max(p.w, p.h) * 0.5;
            const sx = imgOx - tabMargin * scaleX;
            const sy = imgOy - tabMargin * scaleY;
            const sw = p.w * scaleX + tabMargin * 2 * scaleX;
            const sh = p.h * scaleY + tabMargin * 2 * scaleY;

            const dx = -tabMargin;
            const dy = -tabMargin;
            const dw = p.w + tabMargin * 2;
            const dh = p.h + tabMargin * 2;

            this.ctx.drawImage(this.img, sx, sy, sw, sh, dx, dy, dw, dh);
        } else {
            this.ctx.fillStyle = '#ff69b4';
            this.ctx.fill(p.path);
        }

        this.ctx.restore();

        this.ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke(p.path);

        this.ctx.restore();
    }
};

// ─── Download Handler ─────────────────────────────────────────────────────────
const DownloadHandler = {
    async downloadPNG() {
        const imageUrl = State.currentCompletedImage;
        if (!imageUrl) { alert('No image available'); return; }

        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = 'puzzle.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
        } catch (err) {
            console.error('Download error:', err);
            alert('Failed to download image. Please try again.');
        }
    },

    async downloadPDF() {
        const imageUrl = State.currentCompletedImage;
        if (!imageUrl) { alert('No image available'); return; }

        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            const img = new Image();
            img.src = objectUrl;

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');

            const jsPDF = window.jspdf.jsPDF;
            const pdf = new jsPDF({
                orientation: img.width > img.height ? 'landscape' : 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();
            const r = Math.min(pw / img.width, ph / img.height);
            pdf.addImage(dataUrl, 'PNG',
                (pw - img.width * r) / 2,
                (ph - img.height * r) / 2,
                img.width * r, img.height * r
            );
            pdf.save('puzzle.pdf');

            setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
        } catch (err) {
            console.error('PDF download error:', err);
            alert('Failed to download PDF. Please try again.');
        }
    }
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    UI.init();
});

// Expose for debugging
window.__State = State;
window.__DB = DB;
window.__API = API;