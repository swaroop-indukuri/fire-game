/**
 * CYBER-STORM: High-Intensity Action Engine
 * Built with Vanilla JS & Canvas
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- CONSTANTS & CONFIG ---
const CONFIG = {
    FPS: 60,
    DASH_COOLDOWN: 1000,
    DASH_DURATION: 150,
    DASH_SPEED: 25,
    PLAYER_SPEED: 5,
    PLAYER_SIZE: 25,
    ENEMY_SPAWN_RATE: 2000,
    LEVEL_UP_SCORE: 2000,
    HIT_STOP_DURATION: 50, // ms
    BLOOM_INTENSITY: 'blur(4px) brightness(1.2)',
};

// --- GAME STATE ---
const STATE = {
    player: null,
    enemies: [],
    projectiles: [],
    particles: [],
    debris: [],
    score: 0,
    level: 1,
    isGameOver: false,
    keys: {},
    mouse: { x: 0, y: 0, pressed: false },
    screenShake: 0,
    lastTime: 0,
    spawnTimer: 0,
    isHitStopped: false
};

// --- UTILS ---
const random = (min, max) => Math.random() * (max - min) + min;
const distance = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const angleBetween = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

// --- VISUAL EFFECTS SYSTEM ---
class Particle {
    constructor(x, y, color, size, velocity, life = 1.0) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.velocity = velocity;
        this.life = life; // 0 to 1
        this.decay = random(0.01, 0.03);
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.velocity.x *= 0.98;
        this.velocity.y *= 0.98;
        this.life -= this.decay;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        // Shadow removed for performance
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Debris {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 1.0;
        this.points = [];
        const count = random(3, 6);
        for(let i=0; i<count; i++) {
            this.points.push({
                x: random(-20, 20),
                y: random(-20, 20)
            });
        }
    }

    update() {
        this.life -= 0.005;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life * 0.3;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.points.forEach((p, i) => {
            if(i === 0) ctx.moveTo(this.x + p.x, this.y + p.y);
            else ctx.lineTo(this.x + p.x, this.y + p.y);
        });
        ctx.stroke();
        ctx.restore();
    }
}

function spawnExplosion(x, y, color, count = 15) {
    STATE.debris.push(new Debris(x, y, color));
    for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const speed = random(2, 8);
        STATE.particles.push(new Particle(
            x, y, color, random(2, 5),
            { x: Math.cos(ang) * speed, y: Math.sin(ang) * speed }
        ));
    }
    STATE.screenShake = 10;
}

// --- PLAYER SYSTEM ---
class Player {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.hp = 100;
        this.maxHp = 100;
        this.size = CONFIG.PLAYER_SIZE;
        this.color = '#00f2ff';
        this.lastDash = 0;
        this.isDashing = false;
        this.dashDir = { x: 0, y: 0 };
        this.angle = 0;
        this.attackTimer = 0;
        this.invulnerable = 0;
    }

    update(dt) {
        if (this.invulnerable > 0) this.invulnerable -= dt;

        // Mouse Angle
        this.angle = angleBetween(this.x, this.y, STATE.mouse.x, STATE.mouse.y);

        // Movement
        let mx = 0, my = 0;
        if (STATE.keys['w'] || STATE.keys['ArrowUp']) my -= 1;
        if (STATE.keys['s'] || STATE.keys['ArrowDown']) my += 1;
        if (STATE.keys['a'] || STATE.keys['ArrowLeft']) mx -= 1;
        if (STATE.keys['d'] || STATE.keys['ArrowRight']) mx += 1;

        if (mx !== 0 || my !== 0) {
            const mag = Math.hypot(mx, my);
            mx /= mag;
            my /= mag;

            if (!this.isDashing) {
                this.x += mx * CONFIG.PLAYER_SPEED;
                this.y += my * CONFIG.PLAYER_SPEED;
            }
        }

        // Dash Logic
        if ((STATE.keys['Shift'] || STATE.keys[' ']) && Date.now() - this.lastDash > CONFIG.DASH_COOLDOWN) {
            this.isDashing = true;
            this.lastDash = Date.now();
            this.dashDir = (mx === 0 && my === 0) ? { x: Math.cos(this.angle), y: Math.sin(this.angle) } : { x: mx, y: my };
            this.invulnerable = CONFIG.DASH_DURATION;
            
            // UI Update
            const cooldownEl = document.getElementById('dash-cooldown');
            cooldownEl.style.height = '100%';
            setTimeout(() => cooldownEl.style.height = '0%', CONFIG.DASH_COOLDOWN);
            
            // Dash VFX
            spawnExplosion(this.x, this.y, '#00f2ff', 5);
        }

        // Dashing
        if (this.isDashing) {
            const dashElapsed = Date.now() - this.lastDash;
            if (dashElapsed < CONFIG.DASH_DURATION) {
                this.x += this.dashDir.x * CONFIG.DASH_SPEED;
                this.y += this.dashDir.y * CONFIG.DASH_SPEED;
                
                // Trail
                STATE.particles.push(new Particle(this.x, this.y, '#00f2ff', 10, {x:0, y:0}, 0.5));
                // Add phantom trails
                this.drawPhantom();
            } else {
                this.isDashing = false;
            }
        }

        // Bounds
        this.x = Math.max(this.size, Math.min(canvas.width - this.size, this.x));
        this.y = Math.max(this.size, Math.min(canvas.height - this.size, this.y));

        // Attacking
        if (STATE.mouse.pressed && this.attackTimer <= 0) {
            this.attack();
            this.attackTimer = 150; // Attack rate
        }
        if (this.attackTimer > 0) this.attackTimer -= dt;
    }

    attack() {
        const projectileSpeed = 15;
        STATE.projectiles.push({
            x: this.x + Math.cos(this.angle) * 30,
            y: this.y + Math.sin(this.angle) * 30,
            vx: Math.cos(this.angle) * projectileSpeed,
            vy: Math.sin(this.angle) * projectileSpeed,
            size: 5,
            color: '#bc00ff',
            owner: 'player'
        });
        
        // Recoil VFX
        STATE.screenShake = 2;
        STATE.particles.push(new Particle(
            this.x + Math.cos(this.angle) * 30,
            this.y + Math.sin(this.angle) * 30,
            '#bc00ff', 3, 
            {x: Math.cos(this.angle + Math.PI) * 2, y: Math.sin(this.angle + Math.PI) * 2}
        ));
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Movement bobbing
        const bob = Math.sin(Date.now() / 100) * 2;

        // Body
        ctx.shadowBlur = 20; // Keep for player only for premium feel
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        if (this.invulnerable > 0 && Math.floor(Date.now() / 50) % 2 === 0) ctx.globalAlpha = 0.3;

        // Cyber-Sword / Blade shape
        ctx.beginPath();
        ctx.moveTo(25, bob);
        ctx.lineTo(-15, -15 + bob);
        ctx.lineTo(-10, 0 + bob);
        ctx.lineTo(-15, 15 + bob);
        ctx.closePath();
        ctx.fill();
        
        // Glow Core
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(0, bob, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawPhantom() {
        STATE.particles.push(new Particle(this.x, this.y, this.color, this.size, {x:0, y:0}, 0.3));
    }

    takeDamage(amt) {
        if (this.invulnerable > 0) return;
        this.hp -= amt;
        STATE.screenShake = 15;
        spawnExplosion(this.x, this.y, '#ff0055', 10);
        
        if (this.hp <= 0) {
            triggerGameOver();
        }
    }
}

// --- ENEMY SYSTEM ---
class Enemy {
    constructor(type, level) {
        this.type = type;
        this.level = level;
        this.size = 20 + (level * 0.1);
        this.hp = 20 + (level * 5);
        this.speed = 2 + (level * 0.05);
        this.color = type === 'ranged' ? '#ffaa00' : '#ff0055';
        
        // Spawn at edges
        const side = Math.floor(Math.random() * 4);
        if (side === 0) { this.x = -50; this.y = random(0, canvas.height); }
        else if (side === 1) { this.x = canvas.width + 50; this.y = random(0, canvas.height); }
        else if (side === 2) { this.x = random(0, canvas.width); this.y = -50; }
        else { this.x = random(0, canvas.width); this.y = canvas.height + 50; }

        this.shootTimer = random(1000, 3000);
    }

    update(dt) {
        const ang = angleBetween(this.x, this.y, STATE.player.x, STATE.player.y);
        
        // Follow player
        this.x += Math.cos(ang) * this.speed;
        this.y += Math.sin(ang) * this.speed;

        // Ranged behavior
        if (this.type === 'ranged') {
            this.shootTimer -= dt;
            if (this.shootTimer <= 0) {
                this.shoot();
                this.shootTimer = 2000;
            }
        }

        // Collision with player
        if (distance(this.x, this.y, STATE.player.x, STATE.player.y) < this.size + STATE.player.size) {
            STATE.player.takeDamage(10);
            this.die(false);
        }
    }

    shoot() {
        const ang = angleBetween(this.x, this.y, STATE.player.x, STATE.player.y);
        STATE.projectiles.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(ang) * 6,
            vy: Math.sin(ang) * 6,
            size: 6,
            color: '#ffaa00',
            owner: 'enemy'
        });
    }

    draw() {
        ctx.save();
        // Shadows removed for enemies for performance
        ctx.fillStyle = this.color;
        ctx.beginPath();
        
        if (this.type === 'ranged') {
            // Triangle
            ctx.moveTo(this.x + this.size, this.y);
            ctx.lineTo(this.x - this.size/2, this.y - this.size);
            ctx.lineTo(this.x - this.size/2, this.y + this.size);
        } else {
            // Hexagon-ish
            for(let i=0; i<6; i++) {
                const a = (i/6) * Math.PI * 2;
                ctx.lineTo(this.x + Math.cos(a)*this.size, this.y + Math.sin(a)*this.size);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    die(scored = true) {
        spawnExplosion(this.x, this.y, this.color);
        if (scored) {
            STATE.score += 100;
            checkLevelUp();
        }
        STATE.enemies = STATE.enemies.filter(e => e !== this);
    }
}

// --- ENGINE CORE ---
function init() {
    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('keydown', e => STATE.keys[e.key] = true);
    window.addEventListener('keyup', e => STATE.keys[e.key] = false);
    window.addEventListener('mousemove', e => {
        STATE.mouse.x = e.clientX;
        STATE.mouse.y = e.clientY;
    });
    window.addEventListener('mousedown', () => STATE.mouse.pressed = true);
    window.addEventListener('mouseup', () => STATE.mouse.pressed = false);

    STATE.player = new Player();
    
    requestAnimationFrame(gameLoop);
    showNotification("CYBER-STORM INITIALIZED");
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function checkLevelUp() {
    const nextLevelScore = STATE.level * CONFIG.LEVEL_UP_SCORE;
    if (STATE.score >= nextLevelScore) {
        STATE.level++;
        
        // Endless Mode Scaling
        if (STATE.level > 100) {
            CONFIG.ENEMY_SPAWN_RATE = Math.max(50, CONFIG.ENEMY_SPAWN_RATE * 0.95);
            showNotification(`ENDLESS MODE: TIER ${STATE.level - 100}`, "#ff0055");
        } else {
            showNotification(`LEVEL ${STATE.level} REACHED`);
        }

        if (STATE.level % 10 === 0) {
            spawnBoss();
        }
    }
}

function spawnBoss() {
    showNotification("BOSS DETECTED", "#ff0055");
    const boss = new Enemy('melee', STATE.level);
    boss.size = 80;
    boss.hp = 500 + (STATE.level * 50);
    boss.speed = 3;
    boss.color = '#ff0055';
    boss.isBoss = true;
    STATE.enemies.push(boss);
    STATE.screenShake = 30;
}

function showNotification(text, color = '#00f2ff') {
    const container = document.getElementById('notifications');
    const el = document.createElement('div');
    el.className = 'notif';
    el.innerText = text;
    el.style.textShadow = `0 0 20px ${color}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function triggerGameOver() {
    STATE.isGameOver = true;
    document.getElementById('death-overlay').classList.remove('hidden');
    
    // Auto-restart after 2 seconds
    setTimeout(() => {
        STATE.player.reset();
        STATE.enemies = [];
        STATE.projectiles = [];
        STATE.isGameOver = false;
        STATE.score = 0;
        STATE.level = 1;
        document.getElementById('death-overlay').classList.add('hidden');
        showNotification("SYSTEM REBOOTED");
    }, 2000);
}

function gameLoop(time) {
    const dt = time - STATE.lastTime;
    STATE.lastTime = time;

    if (!STATE.isGameOver && !STATE.isHitStopped) {
        update(dt);
    }

    draw();
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    // Spawn Logic
    STATE.spawnTimer -= dt;
    if (STATE.spawnTimer <= 0) {
        const type = Math.random() > 0.8 ? 'ranged' : 'melee';
        STATE.enemies.push(new Enemy(type, STATE.level));
        STATE.spawnTimer = Math.max(200, CONFIG.ENEMY_SPAWN_RATE - (STATE.level * 20));
    }

    STATE.player.update(dt);
    
    // Update Systems
    STATE.enemies.forEach(e => e.update(dt));
    
    STATE.projectiles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        // Cleanup
        if (p.x < -100 || p.x > canvas.width + 100 || p.y < -100 || p.y > canvas.height + 100) {
            p.dead = true;
            return;
        }

        // Collision
        if (p.owner === 'player') {
            for (let j = 0; j < STATE.enemies.length; j++) {
                const e = STATE.enemies[j];
                const d = distance(p.x, p.y, e.x, e.y);
                if (d < e.size) {
                    e.hp -= 10;
                    spawnExplosion(p.x, p.y, p.color, 3);
                    p.dead = true;
                    if (e.hp <= 0) {
                        e.die();
                        applyHitStop();
                    }
                    break;
                }
            }
        } else {
            if (distance(p.x, p.y, STATE.player.x, STATE.player.y) < STATE.player.size) {
                STATE.player.takeDamage(5);
                p.dead = true;
            }
        }
    });

    STATE.projectiles = STATE.projectiles.filter(p => !p.dead);

    // Update Particles (More efficient cleanup)
    for (let i = STATE.particles.length - 1; i >= 0; i--) {
        const p = STATE.particles[i];
        p.update();
        if (p.life <= 0) {
            STATE.particles.splice(i, 1);
        }
    }

    // Particle Limiter
    if (STATE.particles.length > 200) {
        STATE.particles.splice(0, STATE.particles.length - 200);
    }

    if (STATE.screenShake > 0) STATE.screenShake *= 0.9;

    // UI Sync
    document.getElementById('level-value').innerText = STATE.level.toString().padStart(2, '0');
    document.getElementById('score-value').innerText = Math.floor(STATE.score).toLocaleString();
    const hpPercent = Math.max(0, (STATE.player.hp / STATE.player.maxHp) * 100);
    document.getElementById('health-bar-fill').style.width = hpPercent + '%';
    document.getElementById('health-percent').innerText = Math.floor(hpPercent) + '%';
}

function applyHitStop() {
    STATE.isHitStopped = true;
    setTimeout(() => STATE.isHitStopped = false, CONFIG.HIT_STOP_DURATION);
}

function draw() {
    // Clear with slight fade for trails
    ctx.fillStyle = 'rgba(5, 5, 15, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    // Global Bloom for Glowy effects
    // We only apply this to elements that should glow
    
    // Screen Shake
    if (STATE.screenShake > 1) {
        ctx.translate(random(-STATE.screenShake, STATE.screenShake), random(-STATE.screenShake, STATE.screenShake));
    }

    // Grid Background (Dynamic)
    drawGrid();

    // Draw non-glowing stuff first
    STATE.debris.forEach((d, i) => {
        d.update();
        d.draw();
        if(d.life <= 0) STATE.debris.splice(i, 1);
    });
    
    STATE.particles.forEach(p => p.draw());

    // Bloom removed for performance - using simpler glow
    STATE.projectiles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Add a small additive glow point
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
    });

    STATE.enemies.forEach(e => e.draw());
    STATE.player.draw();
    
    ctx.restore();
}

function drawGrid() {
    const gridSize = 80;
    const offsetX = (STATE.player.x * 0.2) % gridSize;
    const offsetY = (STATE.player.y * 0.2) % gridSize;

    ctx.strokeStyle = 'rgba(0, 242, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -offsetX; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = -offsetY; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    // Perspective lines
    ctx.strokeStyle = 'rgba(188, 0, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -offsetX + gridSize/2; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    ctx.stroke();
}

init();
