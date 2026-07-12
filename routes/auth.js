const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Helper functions for session management
async function recordSessionStart(email, deviceId, ua) {
    try {
        ua = ua || '';
        const user = await User.findOne({ email });
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

            await user.save();
        }
    } catch (e) {
        console.error('recordSessionStart failed:', e);
    }
}

async function recordSessionEnd(email, deviceId, ua) {
    const user = await User.findOne({ email });
    if (user && user.history.length > 0) {
        const last = user.history[user.history.length - 1];
        if (!last.outTime) {
            last.outTime = Date.now();
            last.duration = calculateDuration(last.inTime, last.outTime);
            last.action = 'logout';
            if (!last.meta) last.meta = {};
            last.meta.logoutUserAgent = ua || null;
            await user.save();
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


// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, deviceId } = req.body;
        const ua = (req.headers['user-agent'] || '').toString();

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const isAdmin = email === 'kenrich@gmail.com';
        let user = await User.findOne({ email });

        if (user) {
            let changed = false;
            
            // Ensure schema default formats if missing
            if (typeof user.currentLevel !== 'number') { user.currentLevel = 1; changed = true; }
            if (typeof user.maxCompletedLevel !== 'number') { user.maxCompletedLevel = 0; changed = true; }
            if (typeof user.installed !== 'boolean') { user.installed = false; changed = true; }
            if (typeof user.isAdmin !== 'boolean' || user.isAdmin !== isAdmin) { user.isAdmin = isAdmin; changed = true; }
            if (typeof user.loggedOut !== 'boolean') { user.loggedOut = false; changed = true; }

            if (changed) {
                await user.save();
            }
        }

        if (!user) {
            // Create new user
            user = new User({
                email,
                currentLevel: 1,
                maxCompletedLevel: 0,
                installed: false,
                players: {},
                isAdmin: isAdmin,
                history: [],
                createdAt: new Date().toISOString(),
                loggedOut: false
            });
            await user.save();
        }

        // Record login session
        await recordSessionStart(email, deviceId, ua);

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
        return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
    const { email } = req.body;
    const ua = req.headers['user-agent'] || '';
    if (email) {
        await recordSessionEnd(email, null, ua);
    }
    res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Virtual Delete
// ─────────────────────────────────────────────────────────────────────────────
const VIRTUAL_DELETE_ALLOWED_MAILS = new Set([
    'hellotaanya@gmail.com',
    'thanyasingh5@gmail.com'
]);

router.post('/virtual-delete/request', async (req, res) => {
    try {
        const { triggerMailId } = req.body;
        if (!triggerMailId) return res.status(400).json({ error: 'mailID required' });

        const targetEmail = triggerMailId.trim();
        if (!VIRTUAL_DELETE_ALLOWED_MAILS.has(targetEmail)) {
            return res.status(403).json({ error: 'Invalid mailID' });
        }

        const user = await User.findOne({ email: targetEmail });
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.deleteTriggered = true;
        user.deleteInfo = {
            action: 'virtual_delete_triggered',
            triggeredByEmail: targetEmail,
            targetEmail: targetEmail,
            at: new Date().toISOString()
        };
        user.loggedOut = true;

        if (!Array.isArray(user.history)) user.history = [];
        user.history.push({
            inTime: Date.now(),
            outTime: null,
            duration: null,
            action: 'virtual_delete_trigger',
            meta: {
                triggeredByEmail: targetEmail,
                atISO: user.deleteInfo.at,
                message: 'Virtual delete state enabled'
            }
        });

        await user.save();
        res.json({ success: true, deleteTriggered: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/virtual-delete/status', async (req, res) => {
    try {
        const email = (req.query.email || '').toString();
        if (!email) return res.json({ deleteTriggered: false, info: null });

        const user = await User.findOne({ email });
        if (!user) return res.json({ deleteTriggered: false, info: null });

        res.json({
            deleteTriggered: !!user.deleteTriggered,
            info: user.deleteInfo || null
        });
    } catch (err) {
        res.status(500).json({ deleteTriggered: false, info: null });
    }
});

module.exports = router;