// ================================================================
// energy.js – تمام منطق انرژی، اسکرولر وزن، جرقه‌ها و HQL
// ================================================================

const ENERGY_CONFIG = {
    MAX_ENERGY: 100,
    NUM_CELLS: 12,          // تعداد سلول‌ها کمتر، هرکدام بلندتر
    CHARGE_RATE: 0.0003,     // 1/20 سرعت قبلی
    SPEED_EXP: 1.5,
    CONSUMPTION_RATE: 30,    // 2 برابر سرعت تخلیه
    CHARGE_THRESHOLD: 0.3,
    DIM_THRESHOLD: 30,
};

// ----------------------------------------------------------------
// توابع کمکی (همان‌هایی که در نسخه توافقی بود)
// ----------------------------------------------------------------
function fa(v) {
    return String(v).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function scoreText(v) {
    const n = Number(v || 0);
    let s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return fa(s);
}

function isoDate(d) {
    return d.toISOString().slice(0, 10);
}

function jalaliRange(jy, jm) {
    const startG = jalaali.toGregorian(jy, jm, 1);
    const days = jalaali.jalaaliMonthLength(jy, jm);
    const endG = jalaali.toGregorian(jy, jm, days);
    return {
        start: isoDate(new Date(Date.UTC(startG.gy, startG.gm - 1, startG.gd))),
        end: isoDate(new Date(Date.UTC(endG.gy, endG.gm - 1, endG.gd)))
    };
}

// ----------------------------------------------------------------
// تابع اصلی راه‌اندازی اسکرولر وزن (با انرژی)
// ----------------------------------------------------------------
function initWeightStrip(strip) {
    if (!strip) return;
    const wrap = strip.closest(".weight-strip-wrap") || strip.parentElement;
    if (!wrap) return;

    const card = strip.closest(".weight-strip-card");
    const energyFill = card ? card.querySelector(".energy-bar-fill") : null;
    const energyWrap = card ? card.querySelector(".energy-bar-wrap") : null;
    const hqlNeon = card ? card.querySelector(".hql-neon") : null;

    let sparkLayer = wrap.querySelector(".weight-spark-layer");
    if (!sparkLayer) {
        sparkLayer = document.createElement("div");
        sparkLayer.className = "weight-spark-layer";
        wrap.insertBefore(sparkLayer, strip);
    }

    const endL = document.getElementById("weightEndL");
    const endR = document.getElementById("weightEndR");

    if (strip.dataset.lavaReady === "1") return;
    strip.dataset.lavaReady = "1";

    strip.style.direction = "ltr";
    strip.style.overflowX = "auto";
    strip.style.touchAction = "pan-x";
    strip.style.webkitOverflowScrolling = "touch";
    strip.style.cursor = "grab";
    strip.style.scrollBehavior = "auto";

    // علامت‌گذاری بیشترین مقدار وزن
    const chips = [...strip.querySelectorAll(".weight-chip:not(.empty)")];
    let maxEl = null,
        maxV = -Infinity;
    const faToEn = (s) => String(s || "").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
    chips.forEach(ch => {
        const t = ch.querySelector(".weight-chip-val");
        if (!t) return;
        const num = parseFloat(faToEn(t.textContent).replace(/[^\d.]/g, "")) || 0;
        if (num > maxV) { maxV = num;
            maxEl = ch; }
    });
    if (maxEl) maxEl.classList.add("max");

    requestAnimationFrame(() => {
        if (maxEl) {
            const mid = maxEl.offsetLeft - strip.clientWidth / 2 + maxEl.offsetWidth / 2;
            strip.scrollLeft = Math.max(0, mid);
        }
    });

    // ---------- وضعیت انرژی ----------
    let energy = 0;
    const {
        MAX_ENERGY,
        NUM_CELLS,
        CHARGE_RATE,
        SPEED_EXP,
        CONSUMPTION_RATE,
        CHARGE_THRESHOLD,
        DIM_THRESHOLD
    } = ENERGY_CONFIG;

    let glow = 0;
    let endHeat = 0;
    let lastScrollTime = 0,
        lastScrollPos = strip.scrollLeft,
        velocity = 0;
    let raf = null;
    let sparkFromLeft = true;
    let lastSparkTime = 0;
    const MAX_SPARKS = 50;
    let lastEnergyUpdate = performance.now();

    const trimSparks = () => {
        while (sparkLayer.childElementCount > MAX_SPARKS) sparkLayer.removeChild(sparkLayer.firstChild);
    };

    // ---------- به‌روزرسانی نوار انرژی و HQL ----------
    const updateEnergyBar = () => {
        if (!energyFill || !energyWrap) return;
        const pct = Math.min(100, energy);
        const cellsOn = Math.floor((pct / 100) * NUM_CELLS);

        energyFill.innerHTML = '';
        for (let i = 0; i < NUM_CELLS; i++) {
            const cell = document.createElement('div');
            cell.className = 'energy-cell';
            if (i < cellsOn) {
                cell.classList.add('on');
                if (i > NUM_CELLS * 0.6) {
                    cell.classList.add('on-high');
                }
            }
            energyFill.appendChild(cell);
        }

        // نمایش/مخفی‌سازی نوار انرژی
        if (energy > CHARGE_THRESHOLD) {
            energyWrap.classList.add('active');
            energyWrap.style.display = 'flex';
        } else {
            energyWrap.classList.remove('active');
            energyWrap.style.display = 'none';
        }

        // HQL
        if (hqlNeon) {
            let intensity = 0;
            if (energy >= DIM_THRESHOLD) {
                intensity = 1.0;
            } else if (energy > 0) {
                intensity = Math.max(0, energy / DIM_THRESHOLD);
            }
            hqlNeon.style.setProperty('--neon-intensity', intensity);
            if (intensity > 0.02) {
                hqlNeon.classList.add('lit');
            } else {
                hqlNeon.classList.remove('lit');
            }
        }
    };

    const getGlowIntensity = () => {
        if (energy >= DIM_THRESHOLD) return 1.0;
        if (energy > 0) return Math.max(0, energy / DIM_THRESHOLD);
        return 0;
    };

    const paint = () => {
        const glowIntensity = getGlowIntensity();
        const heat = glow * glowIntensity;
        const eh = endHeat * glowIntensity;

        strip.style.filter = '';
        const solid = Math.min(1, eh * 1.2);
        [endL, endR].forEach((el) => {
            if (!el) return;
            el.style.opacity = String(solid);
            el.style.transform = solid > 0.05 ?
                `scaleX(${0.7 + solid * 0.55}) scaleY(${0.85 + solid * 0.25})` :
                'scaleX(0.5)';
            el.classList.toggle('hot', solid > 0.35);
        });
    };

    // ---------- جرقه‌های متحرک ----------
    const spawnMovingSparks = (speed, fromLeft) => {
        if (!sparkLayer || speed < 0.5) return;
        const now = performance.now();
        if (now - lastSparkTime < 20) return;
        lastSparkTime = now;
        const w = strip.clientWidth,
            h = strip.clientHeight;
        if (w < 8 || h < 8) return;
        const edgeX = fromLeft ? 6 : (w - 6);
        const trailSign = fromLeft ? 1 : -1;
        const n = Math.min(4, 1 + Math.floor((speed - 0.3) * 0.8));
        for (let i = 0; i < n; i++) {
            const sp = document.createElement('div');
            sp.className = 'weight-spark';
            const size = 2 + Math.random() * 3;
            sp.style.cssText =
                `width:${size}px;height:${size}px;left:${edgeX}px;top:${8 + Math.random() * (h - 16)}px`;
            const hue = 18 + Math.random() * 40;
            sp.style.background = `hsl(${hue},100%,60%)`;
            sp.style.boxShadow = `0 0 8px hsl(${hue},100%,55%)`;
            sparkLayer.appendChild(sp);
            const trail = trailSign * (25 + speed * 30 + Math.random() * 20);
            const outward = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 14);
            const life = 200 + Math.random() * 250;
            const t0 = performance.now();
            const anim = (t) => {
                const p = Math.min(1, (t - t0) / life);
                if (p >= 1) { sp.remove(); return; }
                const e = 1 - Math.pow(1 - p, 1.5);
                sp.style.transform = `translate(${trail * e}px,${outward * e}px) scale(${1 - p * 0.7})`;
                sp.style.opacity = String(1 - p);
                requestAnimationFrame(anim);
            };
            requestAnimationFrame(anim);
        }
        trimSparks();
    };

    // ---------- جرقه‌های برخورد به انتها ----------
    const edgeExplosion = (atLeft) => {
        if (!sparkLayer) return;
        const w = strip.clientWidth,
            h = strip.clientHeight;
        const edgeX = atLeft ? 8 : (w - 8);
        const count = 30;
        for (let i = 0; i < count; i++) {
            const sp = document.createElement('div');
            sp.className = 'weight-spark';
            const size = 2.5 + Math.random() * 5.5;
            sp.style.cssText =
                `width:${size}px;height:${size}px;left:${edgeX + (Math.random() - 0.5) * 16}px;top:${h * 0.15 + Math.random() * h * 0.6}px`;
            sp.style.background = Math.random() > 0.3 ? '#ffe59a' : '#ff6a1a';
            sp.style.boxShadow = '0 0 12px #ff9400,0 0 24px #ff3d00';
            sparkLayer.appendChild(sp);
            const vx = (atLeft ? -1 : 1) * (15 + Math.random() * 65) + (Math.random() - 0.5) * 22;
            let vy = -50 - Math.random() * 90;
            const g = 540;
            const life = 400 + Math.random() * 550;
            const t0 = performance.now();
            let last = t0,
                x = 0,
                y = 0;
            const anim = (t) => {
                const dt = Math.min(0.032, (t - last) / 1000);
                last = t;
                const p = (t - t0) / life;
                if (p >= 1) { sp.remove(); return; }
                vy += g * dt;
                x += vx * dt;
                y += vy * dt;
                sp.style.transform = `translate(${x}px,${y}px) scale(${1.1 - p * 0.8})`;
                sp.style.opacity = String(Math.max(0, 1 - p));
                requestAnimationFrame(anim);
            };
            requestAnimationFrame(anim);
        }
        trimSparks();
    };

    // ---------- به‌روزرسانی انرژی ----------
    function updateEnergy(deltaTime) {
        if (energy > 0) {
            energy = Math.max(0, energy - CONSUMPTION_RATE * deltaTime);
        }
        updateEnergyBar();
        paint();
    }

    // ---------- رویداد اسکرول ----------
    function onScroll() {
        const now = performance.now();
        const currentPos = strip.scrollLeft;
        const dt = (now - lastScrollTime) / 1000;

        if (dt > 0 && lastScrollTime > 0) {
            const dx = currentPos - lastScrollPos;
            velocity = dx / dt;
            const absV = Math.abs(velocity);

            if (absV > 0.5) sparkFromLeft = velocity < 0;

            if (absV > 0.8) {
                const gain = Math.pow(absV, SPEED_EXP) * CHARGE_RATE * dt;
                energy = Math.min(MAX_ENERGY, energy + gain);
                updateEnergyBar();

                spawnMovingSparks(absV, sparkFromLeft);

                glow = Math.max(glow * 0.9, Math.min(1, absV / 12));
                endHeat = Math.max(endHeat * 0.92, Math.min(1, absV / 10));
            }

            const maxScroll = strip.scrollWidth - strip.clientWidth;
            if (currentPos <= 1 || currentPos >= maxScroll - 1) {
                if (absV > 1.5) {
                    edgeExplosion(currentPos <= 1);
                    glow = 0.9;
                    endHeat = 1;
                    velocity = 0;
                }
            }
            paint();
        }

        lastScrollTime = now;
        lastScrollPos = currentPos;

        clearTimeout(strip._decayTimer);
        strip._decayTimer = setTimeout(() => {
            const decay = () => {
                if (Math.abs(velocity) < 0.1 && glow < 0.02 && endHeat < 0.02) {
                    setHeat(0, 0);
                    return;
                }
                glow *= 0.98;
                endHeat *= 0.99;
                if (glow < 0.01) glow = 0;
                if (endHeat < 0.01) endHeat = 0;
                paint();
                if (glow > 0.01 || endHeat > 0.01) {
                    requestAnimationFrame(decay);
                } else {
                    setHeat(0, 0);
                }
            };
            decay();
        }, 150);
    }

    function setHeat(body, ends) {
        glow = Math.max(0, Math.min(1, body));
        endHeat = Math.max(0, Math.min(1, ends != null ? ends : endHeat));
        paint();
    }

    strip.addEventListener('scroll', onScroll, { passive: true });

    // ---------- حلقه مصرف انرژی ----------
    function energyLoop(timestamp) {
        const now = performance.now();
        const delta = (now - lastEnergyUpdate) / 1000;
        lastEnergyUpdate = now;
        if (delta > 0 && delta < 0.1) {
            updateEnergy(delta);
        }
        requestAnimationFrame(energyLoop);
    }
    lastEnergyUpdate = performance.now();
    requestAnimationFrame(energyLoop);

    // ---------- کشیدن با ماوس ----------
    let isDragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;

    function onMouseDown(e) {
        e.preventDefault();
        isDragging = true;
        strip.classList.add('is-dragging');
        dragStartX = e.clientX;
        dragStartScroll = strip.scrollLeft;
        document.body.style.userSelect = 'none';
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - dragStartX;
        const delta = -dx;
        strip.scrollLeft = dragStartScroll + delta;
        if (Math.abs(dx) > 2) sparkFromLeft = dx < 0;
    }

    function onMouseUp(e) {
        if (!isDragging) return;
        isDragging = false;
        strip.classList.remove('is-dragging');
        document.body.style.userSelect = '';
        const ev = new Event('scroll', { bubbles: true });
        strip.dispatchEvent(ev);
    }

    strip.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // ---------- لمس (stop propagation) ----------
    function stopTouchPropagation(e) {
        e.stopPropagation();
    }
    strip.addEventListener('touchstart', stopTouchPropagation, { passive: true });
    strip.addEventListener('touchmove', stopTouchPropagation, { passive: true });
    strip.addEventListener('touchend', stopTouchPropagation, { passive: true });

    // ---------- چرخ ماوس ----------
    strip.addEventListener('wheel', (e) => {
        e.stopPropagation();
        let delta = e.deltaX;
        if (Math.abs(delta) < 1) delta = e.deltaY;
        if (Math.abs(delta) > 2) sparkFromLeft = delta < 0;
    }, { passive: true });

    // ---------- پاک‌سازی ----------
    if (strip._cleanup) strip._cleanup();
    strip._cleanup = () => {
        strip.removeEventListener('scroll', onScroll);
        strip.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        strip.removeEventListener('touchstart', stopTouchPropagation);
        strip.removeEventListener('touchmove', stopTouchPropagation);
        strip.removeEventListener('touchend', stopTouchPropagation);
        strip.removeEventListener('wheel', (e) => e.stopPropagation());
        clearTimeout(strip._decayTimer);
    };

    updateEnergyBar();
    paint();
}

// ----------------------------------------------------------------
// توابع مربوط به بارگذاری گزارش و رندر (همان نسخه توافقی)
// ----------------------------------------------------------------
// (برای اختصار، این بخش‌ها در energy.js قرار داده نمی‌شوند چون در report.html
//  از طریق اسکریپت جداگانه‌ای مدیریت می‌شوند. اما اگر نیاز است، می‌توان آن‌ها را
//  نیز به energy.js منتقل کرد. با توجه به درخواست شما، فعلاً فقط منطق انرژی
//  در این فایل قرار دارد و بقیه توابع (loadReport, renderReport, ...)
//  در report.html باقی می‌مانند. در صورت نیاز، می‌توانم آن‌ها را هم جدا کنم.)
// ----------------------------------------------------------------

// توجه: توابع loadReport, renderReport, avatarHtml, initInteractions, changeMonth
// و متغیرهای سراسری مانند currentUser, selectedYear, ... همچنان در report.html
// و در اسکریپت inline آن تعریف می‌شوند. این فایل فقط منطق انرژی را شامل می‌شود.

// در صورت تمایل، می‌توان تمام توابع مربوط به گزارش را نیز به فایل جداگانه‌ای منتقل کرد.
