const express = require('express');
const router = express.Router();
const User = require('../models/User');

const IS_ADMIN_BYPASS_EMAIL = 'kenrich@gmail.com';

function pushAudit(user, entry) {
    if (!Array.isArray(user.history)) user.history = [];
    user.history.push(entry);
}

function getMetaFromReq(req) {
    return {
        deviceId: req.body?.deviceId || null,
        userAgent: req.headers['user-agent'] || null
    };
}

// Get all users (admin only)
router.get('/', async (req, res) => {
    try {
        const users = await User.find({});
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
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user by email
router.get('/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email });
        
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
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// List players for a specific user
router.get('/:email/players', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ error: 'User not found' });

        const players = [];
        if (user.players) {
            for (let [name, p] of user.players.entries()) {
                players.push({
                    name,
                    currentLevel: p.currentLevel ?? 1,
                    maxCompletedLevel: p.maxCompletedLevel ?? 0,
                    installed: !!p.installed
                });
            }
        }

        res.json({ players });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a new player profile for a user
router.post('/:email/players', async (req, res) => {
    try {
        const { email } = req.params;
        const { name } = req.body;

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'Player name is required' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.players) user.players = new Map();
        
        if (user.players.has(name)) {
            return res.status(409).json({ error: 'Player already exists' });
        }

        user.players.set(name, {
            currentLevel: 1,
            maxCompletedLevel: 0,
            installed: false
        });

        pushAudit(user, {
            inTime: Date.now(),
            outTime: null,
            duration: null,
            action: 'player_create',
            meta: {
                playerName: name,
                ...getMetaFromReq(req)
            }
        });

        await user.save();
        res.json({ success: true, player: { name, ...user.players.get(name) } });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update player level (current + max)
router.put('/:email/players/:playerName/level', async (req, res) => {
    try {
        const { email, playerName } = req.params;
        const { currentLevel, maxCompletedLevel } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.players || !user.players.has(playerName)) return res.status(404).json({ error: 'Player not found' });

        const player = user.players.get(playerName);
        if (currentLevel !== undefined) player.currentLevel = currentLevel;
        if (maxCompletedLevel !== undefined && maxCompletedLevel > (player.maxCompletedLevel ?? 0)) {
            player.maxCompletedLevel = maxCompletedLevel;
        }
        
        user.players.set(playerName, player); // trigger map update
        await user.save();
        res.json({ success: true, player: { name: playerName, ...player } });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark player progress on completion
router.post('/:email/players/:playerName/progress/complete', async (req, res) => {
    try {
        const { email, playerName } = req.params;
        const { completedLevel } = req.body;

        const completed = Number(completedLevel);
        if (!Number.isFinite(completed) || completed < 1) {
            return res.status(400).json({ error: 'completedLevel must be a valid number (>= 1)' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.players || !user.players.has(playerName)) return res.status(404).json({ error: 'Player not found' });

        const player = user.players.get(playerName);
        const currentMax = player.maxCompletedLevel ?? 0;
        if (completed > currentMax) {
            player.maxCompletedLevel = completed;
        }

        player.currentLevel = Math.max(player.currentLevel ?? 1, completed + 1);
        user.players.set(playerName, player);

        pushAudit(user, {
            inTime: Date.now(),
            outTime: null,
            duration: null,
            action: 'level_complete',
            meta: {
                playerName: playerName,
                completedLevel: completed,
                newCurrentLevel: player.currentLevel,
                newMaxCompletedLevel: player.maxCompletedLevel,
                ...getMetaFromReq(req)
            }
        });

        await user.save();
        res.json({
            success: true,
            player: {
                name: playerName,
                currentLevel: player.currentLevel,
                maxCompletedLevel: player.maxCompletedLevel,
                installed: !!player.installed
            }
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark player installed
router.put('/:email/players/:playerName/install', async (req, res) => {
    try {
        const { email, playerName } = req.params;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.players || !user.players.has(playerName)) return res.status(404).json({ error: 'Player not found' });

        const player = user.players.get(playerName);
        player.installed = true;
        user.players.set(playerName, player);

        pushAudit(user, {
            inTime: Date.now(),
            outTime: null,
            duration: null,
            action: 'player_install',
            meta: {
                playerName: playerName,
                ...getMetaFromReq(req)
            }
        });

        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Rename player profile
router.put('/:email/players/:playerName/rename', async (req, res) => {
    try {
        const { email, playerName } = req.params;
        const { newName } = req.body;

        if (!newName || typeof newName !== 'string') {
            return res.status(400).json({ error: 'newName is required' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.players || !user.players.has(playerName)) return res.status(404).json({ error: 'Player not found' });
        if (user.players.has(newName)) return res.status(409).json({ error: 'Player already exists' });

        const player = user.players.get(playerName);
        user.players.set(newName, player);
        user.players.delete(playerName);

        pushAudit(user, {
            inTime: Date.now(),
            outTime: null,
            duration: null,
            action: 'player_rename',
            meta: {
                oldPlayerName: playerName,
                newPlayerName: newName,
                ...getMetaFromReq(req)
            }
        });

        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete player profile
router.delete('/:email/players/:playerName', async (req, res) => {
    try {
        const { email, playerName } = req.params;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!user.players || !user.players.has(playerName)) return res.status(404).json({ error: 'Player not found' });

        user.players.delete(playerName);

        pushAudit(user, {
            inTime: Date.now(),
            outTime: null,
            duration: null,
            action: 'player_delete',
            meta: {
                playerName: playerName,
                ...getMetaFromReq(req)
            }
        });

        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user level (legacy)
router.put('/:email/level', async (req, res) => {
    try {
        const { email } = req.params;
        const { currentLevel, maxCompletedLevel } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (currentLevel !== undefined) {
            user.currentLevel = currentLevel;
        }
        
        if (maxCompletedLevel !== undefined && maxCompletedLevel > user.maxCompletedLevel) {
            user.maxCompletedLevel = maxCompletedLevel;
        }
        
        await user.save();
        res.json({ success: true, user });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark user as installed
router.put('/:email/install', async (req, res) => {
    try {
        const { email } = req.params;
        const meta = getMetaFromReq(req);
        
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.installed = true;

        pushAudit(user, {
            inTime: Date.now(),
            outTime: null,
            duration: null,
            action: 'user_install',
            meta: meta
        });

        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete user history entry
router.delete('/:email/history/:index', async (req, res) => {
    try {
        const { email, index } = req.params;
        const idx = parseInt(index);

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (idx < 0 || idx >= (user.history || []).length) {
            return res.status(400).json({ error: 'Invalid history index' });
        }
        
        user.history.splice(idx, 1);
        await user.save();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin manual toggle for virtual delete
router.put('/:email/virtual-delete', async (req, res) => {
    try {
        const { email } = req.params;
        const { deleteTriggered, callerEmail } = req.body || {};

        if (!callerEmail || callerEmail !== IS_ADMIN_BYPASS_EMAIL) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (deleteTriggered === undefined) {
            return res.status(400).json({ error: 'deleteTriggered is required' });
        }

        const user = await User.findOne({ email });
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

            pushAudit(user, {
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
            pushAudit(user, {
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

        await user.save();
        res.json({ success: true, deleteTriggered: !!deleteTriggered });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;