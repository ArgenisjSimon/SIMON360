// Fondo del login: panal de hexágonos con rastro al mover el cursor.
//
// Módulo con iniciar/detener, y no un eval con un flag global: el flag hacía
// que al volver al login SIN recargar (el canvas es otro elemento) no se
// dibujara nada, mientras los listeners de la primera vez seguían vivos
// pintando un canvas que ya no estaba en la página. Ahora Login.razor llama a
// detener() al desmontarse y cada entrada arranca limpia.
//
// Lo usa solo Pages/Login.razor.

let actual = null;

export function iniciar(canvas) {
    detener();
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseCanvas = document.createElement('canvas');
    const baseCtx = baseCanvas.getContext('2d');

    const R = 42;                 // radio del hexágono
    const W = Math.sqrt(3) * R;   // separación horizontal
    const DY = 1.5 * R;           // separación vertical
    const TRAIL_DURATION = 2400;  // cuánto dura el rastro (ms)

    let width = 0;
    let height = 0;
    const activeHexes = new Map();
    let animId = null;
    let lastPointerX = null;
    let lastPointerY = null;

    const esOscuro = () => document.documentElement.classList.contains('dark');

    function pathHex(c, cx, cy, r) {
        c.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 180) * (60 * i - 90);
            const x = cx + r * Math.cos(a);
            const y = cy + r * Math.sin(a);
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
        }
        c.closePath();
    }

    function drawBaseGrid() {
        baseCtx.clearRect(0, 0, width, height);
        baseCtx.strokeStyle = esOscuro() ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.16)';
        baseCtx.lineWidth = 0.8;

        const cols = Math.ceil(width / W) + 2;
        const rows = Math.ceil(height / DY) + 2;

        for (let r = -1; r <= rows; r++) {
            const cy = r * DY;
            const xOffset = (Math.abs(r) % 2 === 1) ? (W / 2) : 0;
            for (let col = -1; col <= cols; col++) {
                pathHex(baseCtx, col * W + xOffset, cy, R - 1.5);
                baseCtx.stroke();
            }
        }
    }

    function pixelToHex(px, py) {
        const q = (Math.sqrt(3) / 3 * px - 1 / 3 * py) / R;
        const r = (2 / 3 * py) / R;
        const x = q, z = r, y = -x - z;
        let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
        const xDiff = Math.abs(rx - x), yDiff = Math.abs(ry - y), zDiff = Math.abs(rz - z);
        if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
        else if (yDiff > zDiff) ry = -rx - rz;
        else rz = -rx - ry;
        return { key: rx + ',' + rz, cx: R * Math.sqrt(3) * (rx + rz / 2), cy: R * 1.5 * rz };
    }

    function activateAt(px, py) {
        const hex = pixelToHex(px, py);
        activeHexes.set(hex.key, { cx: hex.cx, cy: hex.cy, time: performance.now() });
        startLoop();
    }

    function onPointerMove(e) {
        const x = e.clientX;
        const y = e.clientY;
        if (lastPointerX !== null && lastPointerY !== null) {
            const dist = Math.hypot(x - lastPointerX, y - lastPointerY);
            const steps = Math.max(1, Math.min(12, Math.floor(dist / (R * 0.7))));
            for (let i = 1; i <= steps; i++) {
                activateAt(lastPointerX + (x - lastPointerX) * (i / steps),
                           lastPointerY + (y - lastPointerY) * (i / steps));
            }
        } else {
            activateAt(x, y);
        }
        lastPointerX = x;
        lastPointerY = y;
    }

    function onMouseLeave() {
        lastPointerX = null;
        lastPointerY = null;
    }

    function render() {
        const now = performance.now();
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(baseCanvas, 0, 0, width, height);

        const oscuro = esOscuro();
        activeHexes.forEach(function (data, key) {
            const elapsed = now - data.time;
            if (elapsed >= TRAIL_DURATION) {
                activeHexes.delete(key);
                return;
            }
            const ease = Math.pow(1 - (elapsed / TRAIL_DURATION), 1.25);
            const fillAlpha = oscuro ? (0.34 * ease) : (0.26 * ease);
            const strokeAlpha = oscuro ? (0.85 * ease) : (0.75 * ease);

            pathHex(ctx, data.cx, data.cy, R - 1.5);
            ctx.fillStyle = 'rgba(239, 68, 68, ' + fillAlpha + ')';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 99, 115, ' + strokeAlpha + ')';
            ctx.lineWidth = 1.6;
            ctx.stroke();
        });

        animId = activeHexes.size > 0 ? requestAnimationFrame(render) : null;
    }

    function startLoop() {
        if (!animId) animId = requestAnimationFrame(render);
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        baseCanvas.width = canvas.width;
        baseCanvas.height = canvas.height;
        baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawBaseGrid();
        render();
    }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);

    actual = {
        refrescar() {
            drawBaseGrid();
            render();
        },
        detener() {
            window.removeEventListener('resize', resize);
            window.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('mouseleave', onMouseLeave);
            if (animId) cancelAnimationFrame(animId);
            animId = null;
            activeHexes.clear();
        }
    };

    resize();
}

// Al cambiar claro/oscuro: la grilla base se redibuja con el otro tono.
export function refrescar() {
    if (actual) actual.refrescar();
}

export function detener() {
    if (actual) actual.detener();
    actual = null;
}
