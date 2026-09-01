// ================================================================
// ENERGY SYSTEM â adjustable parameters (energy.js)
// ================================================================
const ENERGY_CONFIG = {
    MAX_ENERGY: 100,
    NUM_CELLS: 12,          // ØªØ¹Ø¯Ø§Ø¯ Ø³ÙÙÙâÙØ§ Ú©ÙØªØ±Ø ÙØ±Ú©Ø¯Ø§Ù Ø¨ÙÙØ¯ØªØ±
    CHARGE_RATE: 0.0005,     // Û±/Û²Û° Ø³Ø±Ø¹Øª ÙØ¨ÙÛ
    SPEED_EXP: 1.5,
    CONSUMPTION_RATE: 20.0,  // Û² Ø¨Ø±Ø§Ø¨Ø± Ø³Ø±Ø¹Øª ØªØ®ÙÛÙ
    CHARGE_THRESHOLD: 0.3,
    DIM_THRESHOLD: 30,
};

// ---- Energy system ----
function initWeightStrip(strip) {
    if (!strip) return;
    const wrap = strip.closest(".weight-strip-wrap") || strip.parentElement;
    if (!wrap) return;

    const card = strip.closest(".weight-strip-card");
    const energyFill = card ? card.querySelector(".energy-bar-fill") : null;
    const energyWrap = card ? card.querySelector(".energy-bar-wrap") : null;
    const hqlNeon = card ? card.querySelector(".hql-neon") : null;

    if (strip.dataset.energyReady === "1") return;
    strip.dataset.energyReady = "1";

    strip.style.direction = "ltr";
    strip.style.overflowX = "auto";
    strip.style.touchAction = "pan-x";
    strip.style.webkitOverflowScrolling = "touch";
    strip.style.cursor = "grab";
    strip.style.scrollBehavior = "auto";

    const chips = [...strip.querySelectorAll(".weight-chip:not(.empty)")];
    let maxEl = null,
        maxV = -Infinity;
    const faToEn = (s) => String(s || "").replace(/[Û°-Û¹]/g, d => String("Û°Û±Û²Û³Û´ÛµÛ¶Û·Û¸Û¹".indexOf(d)));
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

    const CONSUMPTION_RATE = ENERGY_CONFIG.CONSUMPTION_RATE;
    const CHARGE_RATE = ENERGY_CONFIG.CHARGE_RATE;
    const SPEED_EXP = ENERGY_CONFIG.SPEED_EXP;
    const CHARGE_THRESHOLD = ENERGY_CONFIG.CHARGE_THRESHOLD;
    const DIM_THRESHOLD = ENERGY_CONFIG.DIM_THRESHOLD;
    const MAX_ENERGY = ENERGY_CONFIG.MAX_ENERGY;
    const NUM_CELLS = ENERGY_CONFIG.NUM_CELLS;

    let energy = 0;
    let lastScrollTime = 0,
        lastScrollPos = strip.scrollLeft,
        velocity = 0;
    let lastEnergyUpdate = performance.now();

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

        if (energy > 0.5) {
            energyWrap.classList.add('active');
            energyWrap.style.display = 'flex';
        } else {
            energyWrap.classList.remove('active');
            energyWrap.style.display = 'none';
        }

        if (hqlNeon) {
            let opacity = 0;
            if (energy > 0) {
                opacity = Math.min(1, energy / DIM_THRESHOLD);
            }
            hqlNeon.style.opacity = opacity;
        }
    };

    function updateEnergy(deltaTime) {
        if (energy > 0) {
            energy = Math.max(0, energy - CONSUMPTION_RATE * deltaTime);
        }
        updateEnergyBar();
    }

    function onScroll() {
        const now = performance.now();
        const currentPos = strip.scrollLeft;
        const dt = (now - lastScrollTime) / 1000;

        if (dt > 0 && lastScrollTime > 0) {
            const dx = currentPos - lastScrollPos;
            velocity = dx / dt;
            const absV = Math.abs(velocity);

            if (absV > CHARGE_THRESHOLD) {
                const gain = Math.pow(absV, SPEED_EXP) * CHARGE_RATE * dt;
                energy = Math.min(MAX_ENERGY, energy + gain);
                updateEnergyBar();
            }
        }

        lastScrollTime = now;
        lastScrollPos = currentPos;
    }

    strip.addEventListener('scroll', onScroll, { passive: true });

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

    // ---- Mouse drag ----
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

    // ---- Touch ----
    function stopTouchPropagation(e) {
        e.stopPropagation();
    }
    strip.addEventListener('touchstart', stopTouchPropagation, { passive: true });
    strip.addEventListener('touchmove', stopTouchPropagation, { passive: true });
    strip.addEventListener('touchend', stopTouchPropagation, { passive: true });

    strip.addEventListener('wheel', (e) => {
        e.stopPropagation();
    }, { passive: true });

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
    };

    updateEnergyBar();
}