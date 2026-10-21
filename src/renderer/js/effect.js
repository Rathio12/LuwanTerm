(function (App) {
  'use strict';

  const FRAME_MS = 1000 / 40;
  const NEUTRAL = '#4a7cff';
  const EFFECTS = ['constellation', 'flow', 'rain', 'dots', 'horizon'];

  let canvas = null;
  let ctx = null;
  let layer = null;
  let options = null;
  let scene = null;
  let sceneName = '';
  let frame = 0;
  let lastTick = 0;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let sprites = {};
  const pointer = { x: -9999, y: -9999, inside: false };

  function rgb(hex) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    const value = Number.parseInt(match ? match[1] : NEUTRAL.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function shiftHue([r, g, b], degrees) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const light = (max + min) / 2;
    let hue = 0;
    let sat = 0;
    if (max !== min) {
      const d = max - min;
      sat = light > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === red) hue = (green - blue) / d + (green < blue ? 6 : 0);
      else if (max === green) hue = (blue - red) / d + 2;
      else hue = (red - green) / d + 4;
      hue /= 6;
    }
    hue = (hue + degrees / 360 + 1) % 1;
    const channel = (p, q, t) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    if (!sat) return [r, g, b];
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    return [channel(p, q, hue + 1 / 3), channel(p, q, hue), channel(p, q, hue - 1 / 3)].map((v) => Math.round(v * 255));
  }

  const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const rgba = ([r, g, b], alpha) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;

  function optionsFrom(settings) {
    return {
      effect: EFFECTS.includes(settings.backgroundEffect) ? settings.backgroundEffect : '',
      density: number(settings.effectDensity, 90),
      speed: number(settings.effectSpeed, 30),
      reach: number(settings.effectLinks, 130),
      grid: settings.effectGrid !== false,
      gridSize: number(settings.effectGridSize, 64),
      corner: settings.effectGlow !== false,
      mouse: settings.effectMouse !== false,
      force: settings.effectMouseForce || 'none',
      glow: number(settings.effectNodeGlow, 60) / 100,
      pulse: settings.effectPulse !== false,
      size: number(settings.effectNodeSize, 100) / 100,
      lineWidth: number(settings.effectLineWidth, 7) / 10,
      lineAlpha: number(settings.effectLineOpacity, 70) / 100,
      opacity: number(settings.effectOpacity, 100) / 100,
      still: Boolean(settings.reduceMotion),
      tint: rgb(settings.effectAccent !== false ? settings.accentColor : settings.effectColor || NEUTRAL),
    };
  }

  function sprite(colour) {
    const size = 64;
    const piece = document.createElement('canvas');
    piece.width = size;
    piece.height = size;
    const paint = piece.getContext('2d');
    const light = paint.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    light.addColorStop(0, `rgba(${colour}, 0.9)`);
    light.addColorStop(0.18, `rgba(${colour}, 0.45)`);
    light.addColorStop(0.5, `rgba(${colour}, 0.12)`);
    light.addColorStop(1, `rgba(${colour}, 0)`);
    paint.fillStyle = light;
    paint.fillRect(0, 0, size, size);
    return piece;
  }

  const TONES = { grey: [150, 156, 170], white: [230, 234, 245] };

  function makeSprites() {
    sprites = {
      tint: sprite(options.tint.join(', ')),
      grey: sprite(TONES.grey.join(', ')),
      white: sprite(TONES.white.join(', ')),
    };
  }

  const toneColour = (tone) => (tone === 'tint' ? options.tint : TONES[tone]);

  function pickTone() {
    const pick = Math.random();
    return pick < 0.62 ? 'tint' : pick < 0.86 ? 'grey' : 'white';
  }

  function halo(x, y, radius, tone, alpha) {
    if (alpha <= 0 || radius <= 0) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(sprites[tone], x - radius, y - radius, radius * 2, radius * 2);
  }

  function lighten(draw) {
    ctx.globalCompositeOperation = 'lighter';
    draw();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const twinkle = (phase, clock) => (options.pulse ? 0.55 + 0.45 * Math.sin(clock * 1.6 + phase) : 1);
  const countFor = (scale = 1) => Math.max(1, Math.round(options.density * scale * (width * height) / 1e6));

  function constellation() {
    let nodes = [];

    return {
      seed() {
        const count = countFor();
        const kept = nodes.slice(0, count);
        while (kept.length < count) {
          const angle = Math.random() * Math.PI * 2;
          const pace = 0.35 + Math.random() * 0.65;
          kept.push({
            x: Math.random() * width,
            y: Math.random() * height,
            dx: Math.cos(angle) * pace,
            dy: Math.sin(angle) * pace,
            size: 1 + Math.random() * 1.6,
            phase: Math.random() * Math.PI * 2,
            tone: pickTone(),
          });
        }
        nodes = kept;
      },

      step(elapsed) {
        const move = (options.speed / 100) * 0.06 * elapsed;
        const margin = 20;
        const pushing = options.force !== 'none' && pointer.inside;
        const field = options.reach * 1.5;
        for (const node of nodes) {
          node.x += node.dx * move;
          node.y += node.dy * move;
          if (pushing) {
            const ddx = node.x - pointer.x;
            const ddy = node.y - pointer.y;
            const distance = Math.sqrt(ddx * ddx + ddy * ddy);
            if (distance > 1 && distance < field) {
              const sign = options.force === 'repel' ? 1 : distance < 24 ? 0 : -1;
              const shove = sign * (1 - distance / field) * 0.12 * elapsed;
              node.x += (ddx / distance) * shove;
              node.y += (ddy / distance) * shove;
            }
          }
          if (node.x < -margin) node.x = width + margin;
          else if (node.x > width + margin) node.x = -margin;
          if (node.y < -margin) node.y = height + margin;
          else if (node.y > height + margin) node.y = -margin;
        }
      },

      draw(clock) {
        const tint = options.tint;
        const reach = options.reach;
        const reachSquared = reach * reach;
        const buckets = new Map();
        const key = (cx, cy) => cx * 100003 + cy;
        for (const node of nodes) {
          const k = key(Math.floor(node.x / reach), Math.floor(node.y / reach));
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k).push(node);
        }

        ctx.lineWidth = options.lineWidth;
        const lineAlpha = 0.55 * options.lineAlpha;
        for (const node of nodes) {
          const cx = Math.floor(node.x / reach);
          const cy = Math.floor(node.y / reach);
          for (let ox = -1; ox <= 1; ox += 1) {
            for (let oy = -1; oy <= 1; oy += 1) {
              const near = buckets.get(key(cx + ox, cy + oy));
              if (!near) continue;
              for (const other of near) {
                if (other === node || other.x < node.x || (other.x === node.x && other.y <= node.y)) continue;
                const ddx = other.x - node.x;
                const ddy = other.y - node.y;
                const distance = ddx * ddx + ddy * ddy;
                if (distance > reachSquared) continue;
                ctx.strokeStyle = rgba(tint, (1 - Math.sqrt(distance) / reach) * lineAlpha);
                ctx.beginPath();
                ctx.moveTo(node.x, node.y);
                ctx.lineTo(other.x, other.y);
                ctx.stroke();
              }
            }
          }
        }

        if (options.mouse && pointer.inside) {
          const pull = reach * 1.3;
          for (const node of nodes) {
            const ddx = node.x - pointer.x;
            const ddy = node.y - pointer.y;
            const distance = Math.sqrt(ddx * ddx + ddy * ddy);
            if (distance > pull) continue;
            ctx.strokeStyle = rgba(tint, (1 - distance / pull) * 0.5);
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }

        if (options.glow > 0) {
          lighten(() => {
            for (const node of nodes) {
              halo(node.x, node.y, node.size * options.size * (4 + options.glow * 7), node.tone, options.glow * twinkle(node.phase, clock));
            }
          });
        }

        for (const node of nodes) {
          const shine = options.pulse ? 0.7 + 0.3 * twinkle(node.phase, clock) : 1;
          const base = node.tone === 'tint' ? 0.9 : node.tone === 'grey' ? 0.75 : 0.85;
          ctx.fillStyle = rgba(toneColour(node.tone), base * shine);
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size * options.size, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    };
  }

  function rain() {
    const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789ABCDEF<>/=*+';
    const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    let columns = [];
    let cell = 18;

    const column = (x, fresh) => ({
      x,
      y: fresh ? -Math.random() * (height / cell) : Math.random() * (height / cell),
      pace: 0.4 + Math.random() * 0.9,
      length: 8 + Math.floor(Math.random() * 20),
      glyphs: Array.from({ length: Math.ceil(height / cell) + 30 }, glyph),
      on: Math.random() < Math.min(1, options.density / 110),
    });

    return {
      seed() {
        cell = Math.max(10, Math.round(18 * options.size));
        const count = Math.ceil(width / cell);
        const kept = columns.slice(0, count).map((entry, index) => ({ ...entry, x: index * cell }));
        while (kept.length < count) kept.push(column(kept.length * cell, false));
        for (const entry of kept) entry.on = Math.random() < Math.min(1, options.density / 110);
        columns = kept;
      },

      step(elapsed) {
        const move = (options.speed / 100) * 0.03 * elapsed;
        const rows = height / cell;
        for (const entry of columns) {
          if (!entry.on) continue;
          entry.y += entry.pace * move;
          if (Math.random() < 0.04) entry.glyphs[Math.floor(Math.random() * entry.glyphs.length)] = glyph();
          if (entry.y - entry.length > rows) Object.assign(entry, column(entry.x, true), { on: true });
        }
      },

      draw() {
        ctx.font = `${cell - 2}px "Cascadia Mono", Consolas, monospace`;
        ctx.textBaseline = 'top';
        const tint = options.tint;
        const heads = [];
        for (const entry of columns) {
          if (!entry.on) continue;
          const head = Math.floor(entry.y);
          for (let k = 0; k < entry.length; k += 1) {
            const row = head - k;
            if (row < 0 || row * cell > height) continue;
            const fade = 1 - k / entry.length;
            ctx.fillStyle = k === 0 ? rgba(TONES.white, 0.95) : rgba(tint, fade * 0.75);
            ctx.fillText(entry.glyphs[row % entry.glyphs.length], entry.x, row * cell);
          }
          if (head >= 0) heads.push([entry.x + cell / 2, head * cell + cell / 2]);
        }
        if (options.glow > 0) {
          lighten(() => {
            for (const [x, y] of heads) halo(x, y, cell * (1 + options.glow * 1.6), 'tint', options.glow * 0.8);
          });
        }
      },
    };
  }

  function flow() {
    let particles = [];
    let trail = null;
    let paint = null;

    const angleAt = (x, y, time) => {
      const f = 0.0016;
      return (
        Math.sin(x * f + time * 0.6) * Math.cos(y * f * 1.3 - time * 0.4)
        + Math.sin((x + y) * f * 0.55 + time * 0.25) * 0.6
      ) * Math.PI * 1.4;
    };

    const spawn = () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      life: 60 + Math.random() * 240,
      tone: pickTone(),
      hue: (Math.random() - 0.5) * 50,
    });

    return {
      seed() {
        if (!trail || trail.width !== canvas.width || trail.height !== canvas.height) {
          trail = document.createElement('canvas');
          trail.width = canvas.width;
          trail.height = canvas.height;
          paint = trail.getContext('2d');
          paint.scale(ratio, ratio);
        }
        const count = countFor(3);
        const kept = particles.slice(0, count);
        while (kept.length < count) kept.push(spawn());
        particles = kept;
        if (options.still) {
          paint.clearRect(0, 0, width, height);
          for (let i = 0; i < 160; i += 1) this.step(16);
        }
      },

      step(elapsed) {
        const time = performance.now() / 1000 * (0.2 + options.speed / 100);
        const move = (0.2 + options.speed / 100) * 0.09 * elapsed;
        paint.globalCompositeOperation = 'destination-out';
        paint.fillStyle = `rgba(0, 0, 0, ${0.025 + (1 - options.lineAlpha) * 0.05})`;
        paint.fillRect(0, 0, width, height);
        paint.globalCompositeOperation = 'lighter';
        paint.lineWidth = Math.max(0.4, options.lineWidth * options.size);
        paint.lineCap = 'round';

        for (const particle of particles) {
          const angle = angleAt(particle.x, particle.y, time);
          let nx = particle.x + Math.cos(angle) * move;
          let ny = particle.y + Math.sin(angle) * move;
          if (options.mouse && pointer.inside) {
            const dx = nx - pointer.x;
            const dy = ny - pointer.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const field = 140;
            if (distance > 1 && distance < field) {
              const swirl = (1 - distance / field) * move * 1.6;
              nx += (-dy / distance) * swirl;
              ny += (dx / distance) * swirl;
            }
          }
          const colour = particle.tone === 'tint' ? shiftHue(options.tint, particle.hue) : toneColour(particle.tone);
          paint.strokeStyle = rgba(colour, 0.1 + options.glow * 0.16);
          paint.beginPath();
          paint.moveTo(particle.x, particle.y);
          paint.lineTo(nx, ny);
          paint.stroke();
          particle.x = nx;
          particle.y = ny;
          particle.life -= elapsed / 16;
          if (particle.life <= 0 || nx < -10 || nx > width + 10 || ny < -10 || ny > height + 10) {
            Object.assign(particle, spawn());
          }
        }
        paint.globalCompositeOperation = 'source-over';
      },

      draw() {
        if (!trail) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (options.glow > 0) {
          ctx.globalAlpha = options.glow * 0.5;
          ctx.filter = `blur(${Math.round(4 + options.glow * 8)}px)`;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(trail, 0, 0);
          ctx.filter = 'none';
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
        ctx.drawImage(trail, 0, 0);
        ctx.restore();
      },
    };
  }

  function dots() {
    const BANDS = 10;
    let spacing = 24;

    return {
      seed() {
        spacing = Math.max(12, Math.round(46 - options.density / 6));
      },

      step() {},

      draw(clock) {
        const time = clock * (0.15 + options.speed / 100) * 1.2;
        const tint = options.tint;
        const reachSquared = 220 * 220;
        const paths = Array.from({ length: BANDS }, () => new Path2D());
        const crests = [];
        const offset = spacing / 2;

        for (let y = offset; y < height; y += spacing) {
          for (let x = offset; x < width; x += spacing) {
            let wave = (
              Math.sin(x * 0.009 + time)
              + Math.sin(y * 0.012 - time * 0.8)
              + Math.sin((x + y) * 0.006 + time * 0.6)
              + 3
            ) / 6;
            if (options.mouse && pointer.inside) {
              const dx = x - pointer.x;
              const dy = y - pointer.y;
              const near = dx * dx + dy * dy;
              if (near < reachSquared) {
                const distance = Math.sqrt(near);
                wave = Math.min(1, wave + (1 - distance / 220) * (0.55 + 0.25 * Math.sin(distance * 0.06 - clock * 5)));
              }
            }
            if (options.pulse) wave *= 0.85 + 0.15 * Math.sin(clock * 1.3 + x * 0.05);
            const band = Math.min(BANDS - 1, Math.floor(wave * wave * BANDS));
            const radius = (0.9 + wave * wave * 2.3) * options.size;
            paths[band].moveTo(x + radius, y);
            paths[band].arc(x, y, radius, 0, Math.PI * 2);
            if (wave > 0.82) crests.push([x, y, wave]);
          }
        }

        paths.forEach((path, band) => {
          const level = (band + 1) / BANDS;
          ctx.fillStyle = rgba(band > BANDS - 3 ? TONES.white.map((v, i) => Math.round(v * 0.5 + tint[i] * 0.5)) : tint, 0.16 + Math.pow(level, 1.5) * 0.72);
          ctx.fill(path);
        });

        if (options.glow > 0) {
          lighten(() => {
            for (const [x, y, wave] of crests) {
              halo(x, y, spacing * (0.6 + options.glow * 0.9), 'tint', options.glow * (wave - 0.8) * 3);
            }
          });
        }
      },
    };
  }

  function horizon() {
    return {
      seed() {},

      step() {},

      draw(clock) {
        const time = clock * (0.15 + options.speed / 100);
        const tint = options.tint;
        const warm = shiftHue(tint, 60);
        const lean = options.mouse && pointer.inside ? (pointer.x - width / 2) * 0.06 : 0;
        const cx = width / 2 + lean;
        const hy = height * 0.6;

        const sunRadius = Math.min(width, height) * 0.15 * options.size;
        const sunY = hy - sunRadius * 0.35;
        const sky = ctx.createRadialGradient(cx, hy, 0, cx, hy, Math.max(width, height) * 0.6);
        sky.addColorStop(0, rgba(warm, 0.18 + options.glow * 0.12));
        sky.addColorStop(1, rgba(warm, 0));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, hy);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, hy);
        ctx.clip();
        const sun = ctx.createLinearGradient(0, sunY - sunRadius, 0, sunY + sunRadius);
        sun.addColorStop(0, rgba(warm, 0.7));
        sun.addColorStop(1, rgba(tint, 0.6));
        if (options.glow > 0) {
          ctx.shadowColor = rgba(warm, 0.9);
          ctx.shadowBlur = 30 + options.glow * 60;
        }
        ctx.fillStyle = sun;
        ctx.beginPath();
        ctx.arc(cx, sunY, sunRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 7; i += 1) {
          const band = sunY + sunRadius * (0.05 + i * 0.14);
          const thickness = 1 + i * 1.1;
          ctx.fillRect(cx - sunRadius, band, sunRadius * 2, thickness);
        }
        ctx.restore();

        ctx.lineWidth = Math.max(0.6, options.lineWidth * 1.4);
        if (options.glow > 0) {
          ctx.shadowColor = rgba(tint, 0.9);
          ctx.shadowBlur = 4 + options.glow * 14;
        }
        const floor = height - hy;
        const columns = Math.round(10 + options.density / 6);
        ctx.strokeStyle = rgba(tint, 0.55);
        ctx.beginPath();
        for (let i = -columns; i <= columns; i += 1) {
          const spread = (i / columns) * width * 2.4;
          ctx.moveTo(cx + spread * 0.04, hy);
          ctx.lineTo(cx + spread, height);
        }
        ctx.stroke();

        const rows = 14;
        const shift = (time * 0.6) % 1;
        for (let i = 0; i < rows; i += 1) {
          const depth = (i + shift) / rows;
          const y = hy + floor * depth * depth;
          ctx.strokeStyle = rgba(tint, 0.15 + depth * 0.6);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        const haze = ctx.createLinearGradient(0, hy - 2, 0, hy + floor * 0.25);
        haze.addColorStop(0, rgba(warm, 0.35));
        haze.addColorStop(1, rgba(warm, 0));
        ctx.fillStyle = haze;
        ctx.fillRect(0, hy - 2, width, floor * 0.25);
      },
    };
  }

  const SCENES = { constellation, flow, rain, dots, horizon };

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'effect';
    canvas.setAttribute('aria-hidden', 'true');
    document.getElementById('backdrop').after(canvas);
    ctx = canvas.getContext('2d');

    window.addEventListener('resize', () => {
      if (!options || !options.effect) return;
      resize();
      scene.seed();
      draw();
    });
    window.addEventListener('mousemove', (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = true;
    });
    document.addEventListener('mouseleave', () => {
      pointer.inside = false;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });
  }

  function resize() {
    ratio = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    paintLayer();
  }

  function paintLayer() {
    layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const paint = layer.getContext('2d');
    paint.scale(ratio, ratio);

    if (options.grid) {
      const grid = document.createElement('canvas');
      grid.width = layer.width;
      grid.height = layer.height;
      const lines = grid.getContext('2d');
      lines.scale(ratio, ratio);
      lines.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      lines.lineWidth = 1;
      lines.beginPath();
      const spacing = Math.max(16, options.gridSize);
      for (let x = width; x > 0; x -= spacing) {
        lines.moveTo(Math.round(x) + 0.5, 0);
        lines.lineTo(Math.round(x) + 0.5, height);
      }
      for (let y = 0; y < height; y += spacing) {
        lines.moveTo(0, y + 0.5);
        lines.lineTo(width, y + 0.5);
      }
      lines.stroke();
      lines.globalCompositeOperation = 'destination-in';
      const fade = lines.createRadialGradient(width, 0, 0, width, 0, Math.max(width, height) * 0.62);
      fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
      fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lines.fillStyle = fade;
      lines.fillRect(0, 0, width, height);
      paint.drawImage(grid, 0, 0, width, height);
    }

    if (options.corner) {
      const size = Math.max(width, height) * 0.38;
      const glow = paint.createRadialGradient(0, height, 0, 0, height, size);
      glow.addColorStop(0, rgba(options.tint, 0.16));
      glow.addColorStop(1, rgba(options.tint, 0));
      paint.fillStyle = glow;
      paint.fillRect(0, 0, width, height);
    }
  }

  function draw() {
    if (!ctx || !scene) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (layer) ctx.drawImage(layer, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    scene.draw(performance.now() / 1000);
  }

  function tick(time) {
    frame = requestAnimationFrame(tick);
    const elapsed = time - lastTick;
    if (elapsed < FRAME_MS) return;
    lastTick = time;
    scene.step(Math.min(elapsed, 100));
    draw();
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function start() {
    if (frame || !options || !options.effect || options.still || document.hidden) return;
    lastTick = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function apply(settings) {
    options = optionsFrom(settings || {});
    document.body.classList.toggle('has-effect', Boolean(options.effect));
    if (!options.effect) {
      stop();
      if (canvas) {
        canvas.hidden = true;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      scene = null;
      sceneName = '';
      return;
    }
    ensureCanvas();
    canvas.hidden = false;
    canvas.style.opacity = String(options.opacity);
    if (sceneName !== options.effect) {
      scene = SCENES[options.effect]();
      sceneName = options.effect;
    }
    makeSprites();
    resize();
    scene.seed();
    draw();
    stop();
    start();
  }

  App.effect = { apply, EFFECTS };
})(window.App);
