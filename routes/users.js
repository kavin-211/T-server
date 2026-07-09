const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const USERS_FILE = path.join(__dirname, '../data/users.json');

// Virtual delete admin toggle auth is enforced by requiring caller email to be the same as special admin bypass.
const IS_ADMIN_BYPASS_EMAIL = 'kenrich@gmail.com';


// Helper functions
const readUsers = () => {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const writeUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
};

// Get all users (admin only)
router.get('/', (req, res) => {
    const users = readUsers();
    // Remove sensitive info but keep history
    const sanitized = users.map(u => ({
        email: u.email,
        currentLevel: u.currentLevel,
        maxCompletedLevel: u.maxCompletedLevel,
        installed: u.installed,
        isAdmin: u.isAdmin || false,
        history: u.history || [],
        createdAt: u.createdAt
    }));
    res.json(sanitized);
});

// Get user by email
router.get('/:email', (req, res) => {
    const { email } = req.params;
    const users = readUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
        email: user.email,
        currentLevel: user.currentLevel,
        maxCompletedLevel: user.maxCompletedLevel,
        installed: user.installed,
        isAdmin: user.isAdmin || false,
        history: user.history || []
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-user player profiles (no cross-user leakage)
// ─────────────────────────────────────────────────────────────────────────────


const ensureUserPlayers = (user) => {
    if (!user.players || typeof user.players !== 'object') {
        user.players = {};
    }
    return user.players;
};

// List players for a specific user
router.get('/:email/players', (req, res) => {
    const { email } = req.params;
    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const playersObj = ensureUserPlayers(user);
    const players = Object.entries(playersObj).map(([name, p]) => ({
        name,
        currentLevel: p.currentLevel ?? 1,
        maxCompletedLevel: p.maxCompletedLevel ?? 0,
        installed: !!p.installed
    }));

    res.json({ players });
});

// Create a new player profile for a user
router.post('/:email/players', (req, res) => {
    const { email } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Player name is required' });
    }

    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const players = ensureUserPlayers(user);

    if (players[name]) {
        return res.status(409).json({ error: 'Player already exists' });
    }

    players[name] = {
        currentLevel: 1,
        maxCompletedLevel: 0,
        installed: false
    };

    writeUsers(users);
    res.json({ success: true, player: { name, ...players[name] } });
});

// Update player level (current + max)
router.put('/:email/players/:playerName/level', (req, res) => {
    const { email, playerName } = req.params;
    const { currentLevel, maxCompletedLevel } = req.body;

    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const players = ensureUserPlayers(user);
    const player = players[playerName];
    if (!player) return res.status(404).json({ error: 'Player not found' });

    if (currentLevel !== undefined) player.currentLevel = currentLevel;
    if (maxCompletedLevel !== undefined && maxCompletedLevel > (player.maxCompletedLevel ?? 0)) {
        player.maxCompletedLevel = maxCompletedLevel;
    }

    writeUsers(users);
    res.json({ success: true, player: { name: playerName, ...player } });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mark player progress on completion (per-player/per-email independent)
// POST /api/users/:email/players/:playerName/progress/complete
// body: { completedLevel } where completedLevel === current level number finished
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:email/players/:playerName/progress/complete', (req, res) => {
    const { email, playerName } = req.params;
    const { completedLevel } = req.body;

    const completed = Number(completedLevel);
    if (!Number.isFinite(completed) || completed < 1) {
        return res.status(400).json({ error: 'completedLevel must be a valid number (>= 1)' });
    }

    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const players = ensureUserPlayers(user);
    const player = players[playerName];
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const currentMax = player.maxCompletedLevel ?? 0;
    if (completed > currentMax) {
        player.maxCompletedLevel = completed;
    }

    // Set currentLevel to next level (cap at 250 handled by client/UI)
    // This ensures: logout/relogin continues from proper unlocked state.
    player.currentLevel = Math.max(player.currentLevel ?? 1, completed + 1);

    writeUsers(users);
    res.json({
        success: true,
        player: {
            name: playerName,
            currentLevel: player.currentLevel,
            maxCompletedLevel: player.maxCompletedLevel,
            installed: !!player.installed
        }
    });
});

// Mark player installed
router.put('/:email/players/:playerName/install', (req, res) => {
    const { email, playerName } = req.params;

    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const players = ensureUserPlayers(user);
    const player = players[playerName];
    if (!player) return res.status(404).json({ error: 'Player not found' });

    player.installed = true;
    writeUsers(users);
    res.json({ success: true });
});

// Rename player profile (optional but needed for existing UI)
router.put('/:email/players/:playerName/rename', (req, res) => {
    const { email, playerName } = req.params;
    const { newName } = req.body;

    if (!newName || typeof newName !== 'string') {
        return res.status(400).json({ error: 'newName is required' });
    }

    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const players = ensureUserPlayers(user);
    if (!players[playerName]) return res.status(404).json({ error: 'Player not found' });
    if (players[newName]) return res.status(409).json({ error: 'Player already exists' });

    players[newName] = players[playerName];
    delete players[playerName];

    writeUsers(users);
    res.json({ success: true });
});

// Delete player profile
router.delete('/:email/players/:playerName', (req, res) => {
    const { email, playerName } = req.params;

    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const players = ensureUserPlayers(user);
    if (!players[playerName]) return res.status(404).json({ error: 'Player not found' });

    delete players[playerName];
    writeUsers(users);
    res.json({ success: true });
});

// Update user level (legacy) - kept for backward compatibility, but player unlock must come from players[*].maxCompletedLevel.
router.put('/:email/level', (req, res) => {
    const { email } = req.params;
    const { currentLevel, maxCompletedLevel } = req.body;
    
    const users = readUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (currentLevel !== undefined) {
        user.currentLevel = currentLevel;
    }
    
    if (maxCompletedLevel !== undefined && maxCompletedLevel > user.maxCompletedLevel) {
        user.maxCompletedLevel = maxCompletedLevel;
    }
    
    writeUsers(users);
    res.json({ success: true, user });
});

// Mark user as installed
router.put('/:email/install', (req, res) => {
    const { email } = req.params;
    
    const users = readUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    user.installed = true;
    writeUsers(users);
    res.json({ success: true });
});

// Delete user history entry
router.delete('/:email/history/:index', (req, res) => {
    const { email, index } = req.params;
    const idx = parseInt(index);

    const users = readUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (idx < 0 || idx >= (user.history || []).length) {
        return res.status(400).json({ error: 'Invalid history index' });
    }
    
    user.history.splice(idx, 1);
    writeUsers(users);
    res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin manual toggle for virtual delete true/false (NO REAL DELETION)
// PUT /api/users/:email/virtual-delete
// body: { deleteTriggered: boolean, callerEmail?: string }
// NOTE: For simplicity, authorize using callerEmail in request body.
router.put('/:email/virtual-delete', (req, res) => {
    const { email } = req.params;
    const { deleteTriggered, callerEmail } = req.body || {};

    if (!callerEmail || callerEmail !== IS_ADMIN_BYPASS_EMAIL) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (deleteTriggered === undefined) {
        return res.status(400).json({ error: 'deleteTriggered is required' });
    }

    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.deleteTriggered = !!deleteTriggered;
    user.deleteInfo = user.deleteInfo || null;

    if (user.deleteTriggered) {
        user.deleteInfo = {
            action: 'virtual_delete_admin_toggle',
            triggeredByEmail: callerEmail,
            targetEmail: email,
            at: new Date().toISOString()
        };
        user.loggedOut = true;

        user.history = Array.isArray(user.history) ? user.history : [];
        user.history.push({
            inTime: Date.now(),
            outTime: null,
            duration: null,
            action: 'virtual_delete_admin_toggle',
            meta: {
                enabled: true,
                triggeredByEmail: callerEmail,
                atISO: user.deleteInfo.at
            }
        });
    } else {
        user.loggedOut = false;
        user.history = Array.isArray(user.history) ? user.history : [];
        user.history.push({
            inTime: Date.now(),
            outTime: null,
            duration: null,
            action: 'virtual_delete_admin_toggle',
            meta: {
                enabled: false,
                triggeredByEmail: callerEmail,
                atISO: new Date().toISOString()
            }
        });
    }

    writeUsers(users);
    res.json({ success: true, deleteTriggered: !!deleteTriggered });
});

module.exports = router;