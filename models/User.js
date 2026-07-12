const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema({
    inTime: Number,
    outTime: Number,
    duration: String,
    action: String,
    meta: mongoose.Schema.Types.Mixed
}, { _id: false });

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    currentLevel: { type: Number, default: 1 },
    maxCompletedLevel: { type: Number, default: 0 },
    installed: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    players: { 
        type: Map, 
        of: new mongoose.Schema({
            currentLevel: { type: Number, default: 1 },
            maxCompletedLevel: { type: Number, default: 0 },
            installed: { type: Boolean, default: false }
        }, { _id: false }) 
    },
    history: [HistorySchema],
    createdAt: { type: String },
    deleteTriggered: { type: Boolean, default: false },
    deleteInfo: { type: mongoose.Schema.Types.Mixed },
    loggedOut: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', UserSchema);
