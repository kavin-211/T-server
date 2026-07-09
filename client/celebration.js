// ==================== CELEBRATION SCREEN ====================

const Celebration = {
    canvas: null, ctx: null, width: 0, height: 0, dpr: 1,
    particles: [], rockets: [], balloons: [], audioCtx: null,
    muted: false, autoRocketInterval: null, animationId: null,
    cursor: null, pointer: { x: 0, y: 0, vx: 0, vy: 0, lastEmit: 0 },
    MAX_PARTICLES: 2400,
    
    init: function() {
        this.canvas = document.getElementById('fireCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.resizeCanvas();
        
        var self = this;
        window.addEventListener('resize', function() {
            self.width = window.innerWidth;
            self.height = window.innerHeight;
            self.resizeCanvas();
        });
        
        this.cursor = document.getElementById('magicCursor');
        this.bindEvents();
        this.animate();
        this.startAutoRockets();
        
        for (var i = 0; i < 14; i++) {
            this.balloons.push(this.createBalloon());
        }
        
        for (var j = 0; j < 4; j++) {
            (function(index) {
                setTimeout(function() {
                    self.launchRocket(self.width * 0.2 + Math.random() * self.width * 0.6, true);
                }, index * 150);
            })(j);
        }
    },
    
    resizeCanvas: function() {
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.floor(this.width * this.dpr);
        this.canvas.height = Math.floor(this.height * this.dpr);
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(this.dpr, this.dpr);
    },
    
    bindEvents: function() {
        var self = this;
        
        window.addEventListener('pointermove', function(e) {
            var nx = Math.min(self.width, Math.max(0, e.clientX));
            var ny = Math.min(self.height, Math.max(0, e.clientY));
            self.pointer.vx = nx - self.pointer.x;
            self.pointer.vy = ny - self.pointer.y;
            self.pointer.x = nx;
            self.pointer.y = ny;
            
            var speed = Math.hypot(self.pointer.vx, self.pointer.vy);
            var now = performance.now();
            
            if (speed > 5 && now - self.pointer.lastEmit > 14) {
                var count = Math.min(6, 2 + Math.floor(speed / 11));
                var baseHue = (Math.atan2(self.pointer.vy, self.pointer.vx) * 180 / Math.PI + 360) % 360;
                
                for (var i = 0; i < count; i++) {
                    self.addParticle({
                        x: nx + self.rand(-3, 3), y: ny + self.rand(-3, 3),
                        vx: self.rand(-1.2, 1.2) + self.pointer.vx * 0.05,
                        vy: self.rand(-1.2, 1.2) + self.pointer.vy * 0.05,
                        life: self.rand(330, 600), age: 0, size: self.rand(1.8, 3.4),
                        hue: (baseHue + self.rand(-25, 25) + 360) % 360,
                        type: 'cursor', alpha: 1, drag: 0.91, grav: 0.02, flicker: Math.random() < 0.3
                    });
                }
                self.pointer.lastEmit = now;
            }
        });
        
        window.addEventListener('pointerdown', function(e) {
            if (!self.audioCtx) {
                try {
                    self.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    if (self.audioCtx.state === 'suspended') self.audioCtx.resume();
                } catch (err) {}
            } else {
                if (self.audioCtx.state === 'suspended') self.audioCtx.resume();
            }
            
            for (var i = 0; i < self.balloons.length; i++) {
                var b = self.balloons[i];
                if (b.alive && self.isInsideBalloon(e.clientX, e.clientY, b)) {
                    b.alive = false;
                    self.burstParticles(b.x, b.y, 1.0);
                    self.balloons[i] = self.createBalloon();
                    break;
                }
            }
        });
        
        window.addEventListener('keydown', function(e) {
            if (e.key.toLowerCase() === 'm') {
                self.muted = !self.muted;
            }
        });
        
        document.getElementById('restart-game-btn').addEventListener('click', function() {
            self.hide();
            if (typeof State !== 'undefined' && State.user) {
                State.user.currentLevel = 1;
                State.user.maxCompletedLevel = 0;
                if (typeof DB !== 'undefined') {
                    DB.updateLevel(State.user.email, 1);
                    DB.updateMaxCompletedLevel(State.user.email, 0);
                }
                if (typeof UI !== 'undefined') {
                    UI.startGame(State.user);
                }
            }
        });
    },
    
    rand: function(min, max) { return Math.random() * (max - min) + min; },
    
    createBalloon: function() {
        var colors = [
            { h: 5, s: 92, l: 62 }, { h: 210, s: 90, l: 65 },
            { h: 130, s: 85, l: 58 }, { h: 280, s: 88, l: 70 }, { h: 45, s: 95, l: 62 }
        ];
        var col = colors[Math.floor(Math.random() * colors.length)];
        return {
            x: this.rand(45, this.width - 45), y: this.height + this.rand(20, 200),
            vy: this.rand(-0.9, -1.4), swayA: this.rand(0.0015, 0.0045),
            swayT: this.rand(0, 800), r: this.rand(19, 30), color: col, alive: true
        };
    },
    
    drawBalloon: function(b) {
        this.ctx.save();
        this.ctx.translate(b.x, b.y);
        var fillColor = 'hsl(' + b.color.h + ',' + b.color.s + '%,' + b.color.l + '%)';
        this.ctx.fillStyle = fillColor;
        this.ctx.strokeStyle = '#00000030';
        this.ctx.lineWidth = 1.2;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, b.r * 0.92, b.r * 1.12, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        
        this.ctx.fillStyle = fillColor;
        this.ctx.beginPath();
        this.ctx.moveTo(-4, b.r * 1.1);
        this.ctx.lineTo(4, b.r * 1.1);
        this.ctx.lineTo(0, b.r * 1.3);
        this.ctx.closePath();
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#f0f0f0aa';
        this.ctx.lineWidth = 1.2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, b.r * 1.28);
        for (var s = 1; s <= 6; s++) {
            this.ctx.lineTo(Math.sin((b.swayT * 0.4 + s) * 0.8) * 3.5, b.r * 1.28 + s * 11);
        }
        this.ctx.stroke();
        this.ctx.restore();
    },
    
    addParticle: function(p) {
        if (this.particles.length < this.MAX_PARTICLES) this.particles.push(p);
    },
    
    burstParticles: function(x, y, power) {
        power = power || 1.1;
        var baseH = this.rand(0, 360);
        var count = Math.floor(50 * power);
        
        for (var i = 0; i < count; i++) {
            var ang = this.rand(0, Math.PI * 2);
            var sp = this.rand(2.8, 6.8) * power;
            this.addParticle({
                x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                life: this.rand(700, 1300), age: 0, size: this.rand(1.5, 3.6) * power,
                hue: (baseH + this.rand(-25, 25) + 360) % 360,
                type: 'spark', alpha: 1, drag: this.rand(0.96, 0.98),
                grav: this.rand(0.015, 0.05), flicker: Math.random() < 0.3
            });
        }
        
        this.addParticle({
            x: x, y: y, vx: 0, vy: 0, life: 240, age: 0, size: 48 * power,
            hue: baseH, alpha: 0.45, type: 'flash', grav: 0, drag: 1
        });
        
        if (!this.muted && this.audioCtx) {
            try {
                var t = this.audioCtx.currentTime;
                var osc = this.audioCtx.createOscillator();
                var gain = this.audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1300, t);
                osc.frequency.exponentialRampToValueAtTime(260, t + 0.06);
                gain.gain.setValueAtTime(0.18, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.start(t);
                osc.stop(t + 0.13);
            } catch (err) {}
        }
    },
    
    startAutoRockets: function() {
        var self = this;
        if (this.autoRocketInterval) clearInterval(this.autoRocketInterval);
        this.autoRocketInterval = setInterval(function() {
            self.launchRocket(self.rand(self.width * 0.1, self.width * 0.9), true);
        }, 320);
    },
    
    launchRocket: function(fromX, silent) {
        silent = silent || false;
        var targetY = this.rand(this.height * 0.08, this.height * 0.2);
        var vx = this.rand(-0.5, 0.5);
        var vy = -this.rand(7.0, 9.2);
        var whistleHandler = { stop: function() {} };
        
        if (!this.muted && this.audioCtx && !silent) {
            try {
                var ctx = this.audioCtx;
                var t0 = ctx.currentTime;
                var dur = this.rand(0.9, 1.2);
                
                var osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                var mod = ctx.createOscillator();
                mod.type = 'sine';
                mod.frequency.value = 11;
                var modGain = ctx.createGain();
                modGain.gain.value = 45;
                mod.connect(modGain);
                modGain.connect(osc.frequency);
                
                osc.frequency.setValueAtTime(440, t0);
                osc.frequency.exponentialRampToValueAtTime(1900, t0 + dur);
                
                var bp = ctx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = 1250;
                bp.Q.value = 8;
                
                var gainNode = ctx.createGain();
                gainNode.gain.setValueAtTime(0.0001, t0);
                gainNode.gain.exponentialRampToValueAtTime(0.24, t0 + 0.04);
                gainNode.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
                
                osc.connect(bp);
                bp.connect(gainNode);
                gainNode.connect(ctx.destination);
                
                osc.start(t0);
                mod.start(t0);
                osc.stop(t0 + dur);
                mod.stop(t0 + dur);
                
                whistleHandler = {
                    stop: function() {
                        try { osc.stop(); mod.stop(); } catch (e) {}
                    }
                };
            } catch (err) {}
        }
        
        this.rockets.push({
            x: fromX, y: this.height - 8, vx: vx, vy: vy,
            targetY: targetY, whistle: whistleHandler, alive: true
        });
    },
    
    isInsideBalloon: function(px, py, b) {
        var dx = px - b.x;
        var dy = py - b.y;
        return (dx * dx + dy * dy) <= (b.r * 1.1) * (b.r * 1.1);
    },
    
    animate: function() {
        var self = this;
        var now = performance.now();
        var dt = Math.min(80, now - (this.lastTimestamp || now));
        this.lastTimestamp = now;
        
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Balloons
        for (var i = 0; i < this.balloons.length; i++) {
            var b = this.balloons[i];
            if (!b.alive) continue;
            b.y += b.vy;
            b.swayT += 0.8;
            b.x += Math.sin(b.swayT * b.swayA * 25) * 0.6;
            this.drawBalloon(b);
            if (b.y < -80) this.balloons[i] = this.createBalloon();
        }
        
        // Rockets
        for (var j = this.rockets.length - 1; j >= 0; j--) {
            var r = this.rockets[j];
            if (!r || !r.alive) { this.rockets.splice(j, 1); continue; }
            
            r.vy -= 0.025;
            r.x += r.vx;
            r.y += r.vy;
            
            this.ctx.beginPath();
            this.ctx.arc(r.x, r.y, 2.8, 0, Math.PI * 2);
            this.ctx.fillStyle = '#fff9cf';
            this.ctx.shadowColor = '#ffb77a';
            this.ctx.shadowBlur = 16;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
            
            for (var t = 0; t < 2; t++) {
                this.addParticle({
                    x: r.x + this.rand(-2, 2), y: r.y + this.rand(1, 4),
                    vx: this.rand(-0.7, 0.7), vy: this.rand(0.3, 1.2),
                    life: this.rand(200, 350), age: 0, size: this.rand(1.1, 2.1),
                    hue: (35 + r.y * 0.1) % 360, type: 'trail',
                    drag: 0.95, grav: 0.03, flicker: true
                });
            }
            
            if (r.y <= r.targetY) {
                r.alive = false;
                try { if (r.whistle && r.whistle.stop) r.whistle.stop(); } catch (e) {}
                this.burstParticles(r.x, r.y, 1.2);
            }
        }
        
        // Particles
        this.ctx.globalCompositeOperation = 'lighter';
        for (var k = this.particles.length - 1; k >= 0; k--) {
            var p = this.particles[k];
            if (!p) { this.particles.splice(k, 1); continue; }
            p.age += dt;
            if (p.age >= p.life) { this.particles.splice(k, 1); continue; }
            
            p.vx *= p.drag;
            p.vy = p.vy * p.drag + p.grav;
            p.x += p.vx;
            p.y += p.vy;
            
            var progress = p.age / p.life;
            var alpha = p.type === 'flash' ? (1 - progress * progress) : (1 - progress);
            if (p.type === 'cursor') alpha *= 0.95;
            var sz = Math.max(0.6, p.size * (1 - progress * 0.5));
            
            if (p.type === 'flash') {
                var grad = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 2.2);
                grad.addColorStop(0, 'hsla(' + p.hue + ',95%,70%,' + (alpha * 0.7) + ')');
                grad.addColorStop(0.8, 'hsla(' + p.hue + ',95%,55%,0)');
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, sz * 2.2, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                var g = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 3.4);
                g.addColorStop(0, 'hsla(' + p.hue + ',100%,68%,' + (alpha * 0.6) + ')');
                g.addColorStop(1, 'hsla(' + p.hue + ',100%,60%,0)');
                this.ctx.fillStyle = g;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, sz * 3.4, 0, Math.PI * 2);
                this.ctx.fill();
                
                this.ctx.fillStyle = 'hsla(' + p.hue + ',100%,65%,' + alpha + ')';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
                this.ctx.fill();
                
                if (p.type === 'cursor') {
                    this.ctx.strokeStyle = 'hsla(' + p.hue + ',100%,75%,' + (alpha * 0.9) + ')';
                    this.ctx.lineWidth = 1.5;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p.x - p.vx * 2.8, p.y - p.vy * 2.8);
                    this.ctx.stroke();
                } else if (p.flicker && Math.random() < 0.2) {
                    this.ctx.strokeStyle = 'hsla(' + p.hue + ',100%,75%,' + (alpha * 0.7) + ')';
                    this.ctx.lineWidth = 1.2;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2);
                    this.ctx.stroke();
                }
            }
            
            if (p.x < -70 || p.x > this.width + 70 || p.y < -70 || p.y > this.height + 100) {
                this.particles.splice(k, 1);
            }
        }
        this.ctx.globalCompositeOperation = 'source-over';
        
        if (this.cursor) {
            this.cursor.style.left = this.pointer.x + 'px';
            this.cursor.style.top = this.pointer.y + 'px';
        }
        
        this.animationId = requestAnimationFrame(function() { self.animate(); });
    },
    
    show: function() {
        UI.screens.celebration.classList.remove('hidden');
        this.cursor.style.display = 'block';
        this.init();
    },
    
    hide: function() {
        UI.screens.celebration.classList.add('hidden');
        if (this.cursor) this.cursor.style.display = 'none';
        if (this.autoRocketInterval) { clearInterval(this.autoRocketInterval); this.autoRocketInterval = null; }
        if (this.animationId) { cancelAnimationFrame(this.animationId); this.animationId = null; }
        this.particles = [];
        this.rockets = [];
        this.balloons = [];
    }
};
