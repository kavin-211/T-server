const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const USERS_FILE = path.join(__dirname, '../data/users.json');

// Helper functions
const readUsers = () => {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ readUsers failed, returning []:', { file: USERS_FILE, message: error?.message });
        console.error(error);
        return [];
    }
};


const writeUsers = (users) => {
    try {
        const cwd = process.cwd();
        const exists = fs.existsSync(USERS_FILE);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
        console.log('📝 writeUsers OK:', { cwd, file: USERS_FILE, existsBefore: exists, byteLength: Buffer.byteLength(JSON.stringify(users)) });
    } catch (error) {
        console.error('❌ writeUsers failed:', {
            cwd: process.cwd(),
            file: USERS_FILE,
            existsBefore: fs.existsSync(USERS_FILE),
            message: error?.message
        });
        console.error(error);
        throw error;
    }
};


const findUser = (email) => {
    const users = readUsers();
    return users.find(u => u.email === email);
};

// Login endpoint
router.post('/login', (req, res) => {
    try {
        const { email, deviceId } = req.body;
        const ua = (req.headers['user-agent'] || '').toString();

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Special admin bypass
        const isAdmin = email === 'kenrich@gmail.com';

        let user = findUser(email);

        // Backward compatibility + defensive init:
        // Ensure every logged-in email has its own `players` object (per-user),
        // and fill other missing legacy fields safely.
        if (user) {
            let changed = false;

            if (!user.players || typeof user.players !== 'object') {
                user.players = {};
                changed = true;
            }
            if (!Array.isArray(user.history)) {
                user.history = [];
                changed = true;
            }
            if (typeof user.currentLevel !== 'number') {
                user.currentLevel = 1;
                changed = true;
            }
            if (typeof user.maxCompletedLevel !== 'number') {
                user.maxCompletedLevel = 0;
                changed = true;
            }
            if (typeof user.installed !== 'boolean') {
                user.installed = false;
                changed = true;
            }
            if (typeof user.isAdmin !== 'boolean') {
                user.isAdmin = isAdmin;
                changed = true;
            }

            if (changed) {
                const users = readUsers();
                const idx = users.findIndex(u => u.email === email);
                if (idx !== -1) {
                    users[idx] = user;
                    writeUsers(users);
                }
            }
        }

        if (!user) {
            // Create new user
            const newUser = {
                email,
                // legacy fields (can be ignored by new client, kept for admin/backward compatibility)
                currentLevel: 1,
                maxCompletedLevel: 0,
                installed: false,

                // per-user separate player profiles (no cross-user leakage)
                players: {},

                isAdmin: isAdmin,
                history: [],
                createdAt: new Date().toISOString()
            };

            const users = readUsers();
            users.push(newUser);
            writeUsers(users);
            user = newUser;
        }

        // Record login session (guarded)
        recordSessionStart(email, deviceId, ua);

        return res.json({
            success: true,
            user: {
                email: user.email,
                currentLevel: user.currentLevel,
                maxCompletedLevel: user.maxCompletedLevel,
                installed: user.installed,
                isAdmin: user.isAdmin || false,
                history: user.history
            }
        });
    } catch (err) {
        console.error('Login failed:', err);
        const msg = err?.message || 'Internal server error';
        return res.status(500).json({ success: false, error: msg });
    }
});

// Logout endpoint
router.post('/logout', (req, res) => {
    const { email } = req.body;
    
    const ua = req.headers['user-agent'] || '';
    if (email) {
        recordSessionEnd(email, null, ua);
    }
    
    res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Virtual Delete (NO REAL DELETION)
// ─────────────────────────────────────────────────────────────────────────────

// Secret validation: only allow triggerMailId to be one of these hardcoded mailIDs.
// (NO .env files; hardcoded per your requirement)
const VIRTUAL_DELETE_ALLOWED_MAILS = new Set([
    'hellotaanya@gmail.com',
    'thanyasingh5@gmail.com'
]);


// Request virtual delete
router.post('/virtual-delete/request', (req, res) => {
    const { triggerMailId } = req.body;

    if (!triggerMailId) {
        return res.status(400).json({ error: 'mailID required to delete the game permanently' });
    }

    const targetEmail = triggerMailId.trim();

    if (!VIRTUAL_DELETE_ALLOWED_MAILS.has(targetEmail)) {
        return res.status(403).json({ error: 'Invalid mailID' });
    }

    const users = readUsers();
    const user = users.find(u => u.email === targetEmail);

    if (!user) {
        return res.status(404).json({ error: 'User not found for provided mailID' });
    }

    // Flag only (no deletion)
    user.deleteTriggered = true;
    user.deleteInfo = {
        action: 'virtual_delete_triggered',
        triggeredByEmail: targetEmail,
        targetEmail: targetEmail,
        at: new Date().toISOString()
    };
    user.loggedOut = true;

    // Detailed audit record
    user.history = Array.isArray(user.history) ? user.history : [];
    user.history.push({
        inTime: Date.now(),
        outTime: null,
        duration: null,
        action: 'virtual_delete_trigger',
        meta: {
            triggeredByEmail: targetEmail,
            atISO: user.deleteInfo.at,
            message: 'Virtual delete state enabled (no real deletion)'
        }
    });

    writeUsers(users);
    res.json({ success: true, deleteTriggered: true });
});

// Status
router.get('/virtual-delete/status', (req, res) => {
    const email = (req.query.email || '').toString();
    if (!email) return res.json({ deleteTriggered: false, info: null });

    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.json({ deleteTriggered: false, info: null });

    res.json({
        deleteTriggered: !!user.deleteTriggered,
        info: user.deleteInfo || null
    });
});

// Helper functions for session management
function recordSessionStart(email, deviceId, ua) {
    try {
        ua = ua || '';

        const users = readUsers();
        const user = users.find(u => u.email === email);
        if (user) {
            const now = Date.now();

            if (!Array.isArray(user.history)) user.history = [];

            // Close any open session
            if (user.history.length > 0) {
                const last = user.history[user.history.length - 1];
                if (!last.outTime) {
                    last.outTime = now;
                    last.duration = calculateDuration(last.inTime, last.outTime);
                }
            }

            user.history.push({
                inTime: now,
                outTime: null,
                duration: null,
                action: 'login',
                meta: {
                    deviceId: deviceId || null,
                    userAgent: ua || null
                }
            });

            writeUsers(users);
        }
    } catch (e) {
        // Do not crash login if session audit fails.
        console.error('recordSessionStart failed:', e);
    }
}

function recordSessionEnd(email, deviceId, ua) {
    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (user && user.history.length > 0) {
        const last = user.history[user.history.length - 1];
        if (!last.outTime) {
            last.outTime = Date.now();
            last.duration = calculateDuration(last.inTime, last.outTime);
            last.action = 'logout';
            // keep meta from login; optionally enrich if missing
            if (!last.meta) last.meta = {};
            last.meta.logoutUserAgent = ua || null;
            writeUsers(users);
        }
    }
}

function calculateDuration(start, end) {
    const diff = end - start;
    const seconds = Math.floor((diff / 1000) % 60);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const hours = Math.floor((diff / (1000 * 60 * 60)));
    return hours + 'h ' + minutes + 'm ' + seconds + 's';
}

module.exports = router;