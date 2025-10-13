const { useState, useEffect, useRef, useCallback } = React;

const GRID_SIZE = 48;
const CELL_SIZE = 15;
const WIDTH = 1230;
const HEIGHT = 640;
const PLAYER_SPEED = 3.5;
const PLAYER_BOOST_SPEED = 8;
const PROJECTILE_SPEED = 10;
const ENEMY_BASE_SPEED = 1.5;

// fluid simulation class
class FluidSimulator {
  constructor(size) {
    this.size = size;
    this.dt = 0.1;
    this.diff = 0.0001;
    this.visc = 0.0001;

    this.vx = new Array(size * size).fill(0);
    this.vy = new Array(size * size).fill(0);
    this.vx0 = new Array(size * size).fill(0);
    this.vy0 = new Array(size * size).fill(0);
  }

  idx(x, y) {
    x = Math.max(0, Math.min(this.size - 1, Math.floor(x)));
    y = Math.max(0, Math.min(this.size - 1, Math.floor(y)));
    return x + y * this.size;
  }

  addVelocity(x, y, amountX, amountY) {
    const index = this.idx(x, y);
    this.vx[index] += amountX;
    this.vy[index] += amountY;
  }

  step() {
    this.diffuse(1, this.vx0, this.vx, this.visc);
    this.diffuse(2, this.vy0, this.vy, this.visc);

    this.project(this.vx0, this.vy0, this.vx, this.vy);

    this.advect(1, this.vx, this.vx0, this.vx0, this.vy0);
    this.advect(2, this.vy, this.vy0, this.vx0, this.vy0);

    this.project(this.vx, this.vy, this.vx0, this.vy0);
  }

  diffuse(b, x, x0, diff) {
    const a = this.dt * diff * (this.size - 2) * (this.size - 2);
    this.linearSolve(b, x, x0, a, 1 + 6 * a);
  }

  linearSolve(b, x, x0, a, c) {
    const cRecip = 1.0 / c;
    for (let k = 0; k < 4; k++) {
      for (let j = 1; j < this.size - 1; j++) {
        for (let i = 1; i < this.size - 1; i++) {
          const idx = this.idx(i, j);
          x[idx] =
            (x0[idx] +
              a *
                (x[this.idx(i + 1, j)] +
                  x[this.idx(i - 1, j)] +
                  x[this.idx(i, j + 1)] +
                  x[this.idx(i, j - 1)])) *
            cRecip;
        }
      }
      this.setBoundary(b, x);
    }
  }

  project(velocX, velocY, p, div) {
    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = this.idx(i, j);
        div[idx] =
          (-0.5 *
            (velocX[this.idx(i + 1, j)] -
              velocX[this.idx(i - 1, j)] +
              velocY[this.idx(i, j + 1)] -
              velocY[this.idx(i, j - 1)])) /
          this.size;
        p[idx] = 0;
      }
    }
    this.setBoundary(0, div);
    this.setBoundary(0, p);
    this.linearSolve(0, p, div, 1, 6);

    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        const idx = this.idx(i, j);
        velocX[idx] -=
          0.5 * (p[this.idx(i + 1, j)] - p[this.idx(i - 1, j)]) * this.size;
        velocY[idx] -=
          0.5 * (p[this.idx(i, j + 1)] - p[this.idx(i, j - 1)]) * this.size;
      }
    }
    this.setBoundary(1, velocX);
    this.setBoundary(2, velocY);
  }

  advect(b, d, d0, velocX, velocY) {
    const dtx = this.dt * (this.size - 2);
    const dty = this.dt * (this.size - 2);

    for (let j = 1; j < this.size - 1; j++) {
      for (let i = 1; i < this.size - 1; i++) {
        let x = i - dtx * velocX[this.idx(i, j)];
        let y = j - dty * velocY[this.idx(i, j)];

        x = Math.max(0.5, Math.min(this.size - 1.5, x));
        y = Math.max(0.5, Math.min(this.size - 1.5, y));

        const i0 = Math.floor(x);
        const i1 = i0 + 1;
        const j0 = Math.floor(y);
        const j1 = j0 + 1;

        const s1 = x - i0;
        const s0 = 1 - s1;
        const t1 = y - j0;
        const t0 = 1 - t1;

        d[this.idx(i, j)] =
          s0 * (t0 * d0[this.idx(i0, j0)] + t1 * d0[this.idx(i0, j1)]) +
          s1 * (t0 * d0[this.idx(i1, j0)] + t1 * d0[this.idx(i1, j1)]);
      }
    }
    this.setBoundary(b, d);
  }

  setBoundary(b, x) {
    for (let i = 1; i < this.size - 1; i++) {
      x[this.idx(i, 0)] = b === 2 ? -x[this.idx(i, 1)] : x[this.idx(i, 1)];
      x[this.idx(i, this.size - 1)] =
        b === 2
          ? -x[this.idx(i, this.size - 2)]
          : x[this.idx(i, this.size - 2)];
    }
    for (let j = 1; j < this.size - 1; j++) {
      x[this.idx(0, j)] = b === 1 ? -x[this.idx(1, j)] : x[this.idx(1, j)];
      x[this.idx(this.size - 1, j)] =
        b === 1
          ? -x[this.idx(this.size - 2, j)]
          : x[this.idx(this.size - 2, j)];
    }
  }

  getVelocity(x, y) {
    const gx = x / CELL_SIZE;
    const gy = y / CELL_SIZE;
    const idx = this.idx(gx, gy);
    return { vx: this.vx[idx] * 50, vy: this.vy[idx] * 50 };
  }
}

const VortexGame = () => {
  const [gameState, setGameState] = useState("menu");
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [lives, setLives] = useState(3);

  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const keysRef = useRef({});
  const mouseRef = useRef({ x: WIDTH / 2, y: HEIGHT / 2 });

  const playerRef = useRef({
    x: WIDTH / 2,
    y: HEIGHT / 2,
    angle: 0,
    boosting: false,
  });
  const projectilesRef = useRef([]);
  const enemiesRef = useRef([]);
  const particlesRef = useRef([]);
  const powerUpsRef = useRef([]);
  const fluidRef = useRef(new FluidSimulator(GRID_SIZE));
  const lastShotRef = useRef(0);
  const waveStartTimeRef = useRef(0);

  const createParticles = useCallback((x, y, count, color, speed = 2) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed * (0.5 + Math.random()),
        vy: Math.sin(angle) * speed * (0.5 + Math.random()),
        life: 1,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }, []);

  const spawnEnemy = useCallback((type) => {
    const side = Math.floor(Math.random() * 4);
    const margin = 36;
    let x, y;

    if (side === 0) {
      x = Math.random() * WIDTH;
      y = margin;
    } else if (side === 1) {
      x = WIDTH - margin;
      y = Math.random() * HEIGHT;
    } else if (side === 2) {
      x = Math.random() * WIDTH;
      y = HEIGHT - margin;
    } else {
      x = margin;
      y = Math.random() * HEIGHT;
    }

    const enemy = {
      x,
      y,
      type,
      health: type === "anchor" ? 3 : type === "swimmer" ? 2 : 1,
      maxHealth: type === "anchor" ? 3 : type === "swimmer" ? 2 : 1,
      shootCooldown: 0,
      angle: 0,
    };

    enemiesRef.current.push(enemy);
  }, []);

  const startGame = useCallback(() => {
    setGameState("playing");
    setScore(0);
    setWave(1);
    setLives(3);
    playerRef.current = {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      angle: 0,
      boosting: false,
    };
    projectilesRef.current = [];
    enemiesRef.current = [];
    particlesRef.current = [];
    powerUpsRef.current = [];
    fluidRef.current = new FluidSimulator(GRID_SIZE);
    waveStartTimeRef.current = Date.now();

    for (let i = 0; i < 3; i++) {
      setTimeout(() => spawnEnemy("drifter"), i * 1000);
    }
  }, [spawnEnemy]);

  const gameLoop = useCallback(() => {
    if (gameState !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const player = playerRef.current;
    const fluid = fluidRef.current;

    // clear
    ctx.fillStyle = "rgba(5, 5, 15, 0.3)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // update fluid
    fluid.step();

    // draw fluid velocity field
    ctx.strokeStyle = "rgba(0, 150, 255, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i < GRID_SIZE; i += 2) {
      for (let j = 0; j < GRID_SIZE; j += 2) {
        const idx = fluid.idx(i, j);
        const vx = fluid.vx[idx];
        const vy = fluid.vy[idx];
        const mag = Math.sqrt(vx * vx + vy * vy);

        if (mag > 0.001) {
          const x = i * CELL_SIZE;
          const y = j * CELL_SIZE;
          const scale = 100;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + vx * scale, y + vy * scale);
          ctx.stroke();
        }
      }
    }

    // player movement
    let dx = 0,
      dy = 0;
    if (keysRef.current["w"] || keysRef.current["W"]) dy -= 1;
    if (keysRef.current["s"] || keysRef.current["S"]) dy += 1;
    if (keysRef.current["a"] || keysRef.current["A"]) dx -= 1;
    if (keysRef.current["d"] || keysRef.current["D"]) dx += 1;

    const boosting = keysRef.current["Shift"];
    player.boosting = boosting;
    const speed = boosting ? PLAYER_BOOST_SPEED : PLAYER_SPEED;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;

      // add velocity to fluid
      const gx = player.x / CELL_SIZE;
      const gy = player.y / CELL_SIZE;
      fluid.addVelocity(gx, gy, dx * 0.5, dy * 0.5);

      player.x += dx * speed;
      player.y += dy * speed;

      if (boosting) {
        createParticles(
          player.x - dx * 10,
          player.y - dy * 10,
          2,
          "#00ccff",
          1,
        );
      }
    }

    // get fluid velocity at player position
    const playerFluidVel = fluid.getVelocity(player.x, player.y);
    player.x += playerFluidVel.vx * 0.3;
    player.y += playerFluidVel.vy * 0.3;

    // bounds
    player.x = Math.max(15, Math.min(WIDTH - 15, player.x));
    player.y = Math.max(15, Math.min(HEIGHT - 15, player.y));

    // player angle
    player.angle = Math.atan2(
      mouseRef.current.y - player.y,
      mouseRef.current.x - player.x,
    );

    // shooting
    if (
      keysRef.current["mouseDown"] &&
      Date.now() - lastShotRef.current > 150
    ) {
      projectilesRef.current.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(player.angle) * PROJECTILE_SPEED,
        vy: Math.sin(player.angle) * PROJECTILE_SPEED,
        friendly: true,
        life: 100,
      });
      lastShotRef.current = Date.now();
      createParticles(player.x, player.y, 3, "#ffff00", 1);
    }

    // update projectiles
    projectilesRef.current = projectilesRef.current.filter((p) => {
      const fluidVel = fluid.getVelocity(p.x, p.y);
      p.x += p.vx + fluidVel.vx * 0.5;
      p.y += p.vy + fluidVel.vy * 0.5;
      p.life--;

      // add to fluid
      const gx = p.x / CELL_SIZE;
      const gy = p.y / CELL_SIZE;
      fluid.addVelocity(gx, gy, p.vx * 0.02, p.vy * 0.02);

      return p.x > 0 && p.x < WIDTH && p.y > 0 && p.y < HEIGHT && p.life > 0;
    });

    // update enemies
    enemiesRef.current = enemiesRef.current.filter((enemy) => {
      const fluidVel = fluid.getVelocity(enemy.x, enemy.y);

      if (enemy.type === "drifter") {
        enemy.x += fluidVel.vx;
        enemy.y += fluidVel.vy;
      } else if (enemy.type === "swimmer") {
        const toPlayerX = player.x - enemy.x;
        const toPlayerY = player.y - enemy.y;
        const dist = Math.sqrt(toPlayerX * toPlayerX + toPlayerY * toPlayerY);
        enemy.x += (toPlayerX / dist) * ENEMY_BASE_SPEED + fluidVel.vx * 0.3;
        enemy.y += (toPlayerY / dist) * ENEMY_BASE_SPEED + fluidVel.vy * 0.3;
      } else if (enemy.type === "anchor") {
        enemy.x += fluidVel.vx * 0.1;
        enemy.y += fluidVel.vy * 0.1;

        // shoot at player
        enemy.shootCooldown--;
        if (enemy.shootCooldown <= 0) {
          const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
          projectilesRef.current.push({
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle) * 6,
            vy: Math.sin(angle) * 6,
            friendly: false,
            life: 150,
          });
          enemy.shootCooldown = 90;
        }
      }

      // check collision with player projectiles
      for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
        const p = projectilesRef.current[i];
        if (p.friendly) {
          const dx = p.x - enemy.x;
          const dy = p.y - enemy.y;
          if (dx * dx + dy * dy < 400) {
            enemy.health--;
            projectilesRef.current.splice(i, 1);
            createParticles(enemy.x, enemy.y, 5, "#ff4444", 2);

            if (enemy.health <= 0) {
              setScore((s) => s + 100);
              createParticles(enemy.x, enemy.y, 15, "#ff8800", 3);

              // chance to drop power-up
              if (Math.random() < 0.15) {
                powerUpsRef.current.push({
                  x: enemy.x,
                  y: enemy.y,
                  type: ["surge", "undertow", "viscosity"][
                    Math.floor(Math.random() * 3)
                  ],
                  angle: 0,
                });
              }
              return false;
            }
            break;
          }
        }
      }

      // check collision with player
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      if (dx * dx + dy * dy < 625) {
        setLives((l) => {
          const newLives = l - 1;
          if (newLives <= 0) {
            setGameState("gameover");
          }
          return newLives;
        });
        createParticles(player.x, player.y, 20, "#ff0000", 4);
        player.x = WIDTH / 2;
        player.y = HEIGHT / 2;
        return false;
      }

      return (
        enemy.x > -50 &&
        enemy.x < WIDTH + 50 &&
        enemy.y > -50 &&
        enemy.y < HEIGHT + 50
      );
    });

    // check enemy projectiles hitting player
    for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
      const p = projectilesRef.current[i];
      if (!p.friendly) {
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        if (dx * dx + dy * dy < 400) {
          setLives((l) => {
            const newLives = l - 1;
            if (newLives <= 0) {
              setGameState("gameover");
            }
            return newLives;
          });
          projectilesRef.current.splice(i, 1);
          createParticles(player.x, player.y, 10, "#ff0000", 3);
        }
      }
    }

    // update power-ups
    powerUpsRef.current = powerUpsRef.current.filter((powerUp) => {
      const fluidVel = fluid.getVelocity(powerUp.x, powerUp.y);
      powerUp.x += fluidVel.vx * 0.5;
      powerUp.y += fluidVel.vy * 0.5;
      powerUp.angle += 0.05;

      // check pickup
      const dx = powerUp.x - player.x;
      const dy = powerUp.y - player.y;
      if (dx * dx + dy * dy < 900) {
        if (powerUp.type === "surge") {
          // push everything away
          for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
              const x = i * CELL_SIZE;
              const y = j * CELL_SIZE;
              const dx = x - player.x;
              const dy = y - player.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > 0 && dist < 300) {
                fluid.addVelocity(i, j, (dx / dist) * 2, (dy / dist) * 2);
              }
            }
          }
          createParticles(player.x, player.y, 50, "#00ffff", 6);
        } else if (powerUp.type === "undertow") {
          // pull enemies toward player
          enemiesRef.current.forEach((enemy) => {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
              enemy.x += (dx / dist) * 100;
              enemy.y += (dy / dist) * 100;
            }
          });
          createParticles(player.x, player.y, 40, "#ff00ff", 5);
        } else if (powerUp.type === "viscosity") {
          // slow down fluid
          for (let i = 0; i < fluid.vx.length; i++) {
            fluid.vx[i] *= 0.3;
            fluid.vy[i] *= 0.3;
          }
          createParticles(player.x, player.y, 30, "#ffff00", 4);
        }
        return false;
      }

      return (
        powerUp.x > -50 &&
        powerUp.x < WIDTH + 50 &&
        powerUp.y > -50 &&
        powerUp.y < HEIGHT + 50
      );
    });

    // update particles
    particlesRef.current = particlesRef.current.filter((p) => {
      const fluidVel = fluid.getVelocity(p.x, p.y);
      p.x += p.vx + fluidVel.vx * 0.2;
      p.y += p.vy + fluidVel.vy * 0.2;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life *= 0.96;
      return p.life > 0.05;
    });

    // wave spawning
    const waveTime = Date.now() - waveStartTimeRef.current;
    const spawnRate = Math.max(500, 2000 - wave * 100);

    if (waveTime % spawnRate < 16 && enemiesRef.current.length < wave * 3 + 5) {
      const types = ["drifter", "swimmer", "anchor"];
      const weights = [0.5, 0.3, 0.2];
      const r = Math.random();
      let type = "drifter";
      let sum = 0;
      for (let i = 0; i < types.length; i++) {
        sum += weights[i];
        if (r < sum) {
          type = types[i];
          break;
        }
      }
      spawnEnemy(type);
    }

    // next wave
    if (enemiesRef.current.length === 0 && waveTime > 3000) {
      setWave((w) => w + 1);
      waveStartTimeRef.current = Date.now();
      setScore((s) => s + 500);
    }

    // draw particles
    particlesRef.current.forEach((p) => {
      ctx.fillStyle =
        p.color +
        Math.floor(p.life * 255)
          .toString(16)
          .padStart(2, "0");
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    });

    // draw projectiles
    projectilesRef.current.forEach((p) => {
      ctx.fillStyle = p.friendly ? "#ffff00" : "#ff4400";
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.friendly ? "#ffff00" : "#ff4400";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // draw enemies
    enemiesRef.current.forEach((enemy) => {
      const color =
        enemy.type === "anchor"
          ? "#ff0000"
          : enemy.type === "swimmer"
            ? "#ff8800"
            : "#ff00ff";
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      if (enemy.type === "anchor") {
        // square
        ctx.fillRect(enemy.x - 12, enemy.y - 12, 24, 24);
      } else if (enemy.type === "swimmer") {
        // triangle
        ctx.beginPath();
        ctx.moveTo(enemy.x + 15, enemy.y);
        ctx.lineTo(enemy.x - 10, enemy.y - 10);
        ctx.lineTo(enemy.x - 10, enemy.y + 10);
        ctx.closePath();
        ctx.fill();
      } else {
        // circle
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // health bar
      if (enemy.health < enemy.maxHealth) {
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(enemy.x - 15, enemy.y - 20, 30, 3);
        ctx.fillStyle = "#00ff00";
        ctx.fillRect(
          enemy.x - 15,
          enemy.y - 20,
          30 * (enemy.health / enemy.maxHealth),
          3,
        );
      }
    });

    // draw power-ups
    powerUpsRef.current.forEach((powerUp) => {
      const colors = {
        surge: "#00ffff",
        undertow: "#ff00ff",
        viscosity: "#ffff00",
      };
      ctx.save();
      ctx.translate(powerUp.x, powerUp.y);
      ctx.rotate(powerUp.angle);
      ctx.fillStyle = colors[powerUp.type];
      ctx.shadowBlur = 15;
      ctx.shadowColor = colors[powerUp.type];
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();
      ctx.shadowBlur = 0;
    });

    // draw player
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = player.boosting ? "#00ffff" : "#00ff00";
    ctx.strokeStyle = player.boosting ? "#00ffff" : "#00ff00";
    ctx.lineWidth = 2;
    ctx.shadowBlur = player.boosting ? 20 : 10;
    ctx.shadowColor = player.boosting ? "#00ffff" : "#00ff00";
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;
  }, [gameState, score, wave, lives, createParticles, spawnEnemy]);

  useEffect(() => {
    if (gameState === "playing") {
      gameLoopRef.current = setInterval(gameLoop, 1000 / 60);
    } else {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    }
    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [gameState, gameLoop]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      keysRef.current[e.key] = true;
    };
    const handleKeyUp = (e) => {
      keysRef.current[e.key] = false;
    };
    const handleMouseMove = (e) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        mouseRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }
    };
    const handleMouseDown = () => {
      keysRef.current["mouseDown"] = true;
    };
    const handleMouseUp = () => {
      keysRef.current["mouseDown"] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return React.createElement(
    "div",
    {
      style: {
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2a 100%)",
        fontFamily: "monospace",
        overflow: "hidden",
      },
    },
    gameState === "menu" &&
      React.createElement(
        "div",
        {
          style: {
            textAlign: "center",
            color: "#fff",
            zIndex: 10,
          },
        },
        React.createElement(
          "h1",
          {
            style: {
              fontSize: "64px",
              margin: "0 0 20px 0",
              background: "linear-gradient(45deg, #00ffff, #ff00ff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "0 0 40px rgba(0,255,255,0.5)",
            },
          },
          "VORTEX",
        ),
        React.createElement(
          "p",
          {
            style: { fontSize: "18px", marginBottom: "32px", color: "#aaa" },
          },
          "NAVIGATE THE FLUID CURRENTS. SURVIVE THE WAVES.",
        ),
        React.createElement(
          "button",
          {
            onClick: startGame,
            style: {
              padding: "15px 40px",
              fontSize: "24px",
              background: "linear-gradient(45deg, #00ffff, #0088ff)",
              border: "none",
              borderRadius: "5px",
              color: "#fff",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 0 20px rgba(0,255,255,0.5)",
              transition: "all 0.3s",
            },
            onMouseOver: (e) => {
              e.target.style.transform = "scale(1.1)";
              e.target.style.boxShadow = "0 0 30px rgba(0,255,255,0.8)";
            },
            onMouseOut: (e) => {
              e.target.style.transform = "scale(1)";
              e.target.style.boxShadow = "0 0 20px rgba(0,255,255,0.5)";
            },
          },
          "START GAME",
        ),
        React.createElement(
          "div",
          {
            style: {
              marginTop: "32px",
              fontSize: "12px",
              color: "#888",
              lineHeight: "1.8",
              maxWidth: "900px",
              margin: "30px auto 0",
            },
          },
          React.createElement(
            "p",
            null,
            React.createElement(
              "strong",
              { style: { color: "#00ff00" } },
              "CONTROLS:",
            ),
          ),
          React.createElement(
            "p",
            null,
            "WASD - Move  |  Mouse - Aim  |  Click - Shoot  |  Shift - Boost",
          ),
          React.createElement(
            "p",
            { style: { marginTop: "30px" } },
            React.createElement(
              "strong",
              { style: { color: "#00ff00" } },
              "ENEMIES:",
            ),
          ),
          React.createElement(
            "p",
            null,
            React.createElement(
              "span",
              { style: { color: "#f0f" } },
              "◯ Drifters",
            ),
            " - FLOAT WITH CURRENTS",
          ),
          React.createElement(
            "p",
            null,
            React.createElement(
              "span",
              { style: { color: "#f80" } },
              "▸ Swimmers",
            ),
            " - CHASE THROUGH FLUID",
          ),
          React.createElement(
            "p",
            null,
            React.createElement(
              "span",
              { style: { color: "#f00" } },
              "■ Anchors",
            ),
            " - STATIONARY TURRETS",
          ),
          React.createElement(
            "p",
            { style: { marginTop: "30px" } },
            React.createElement(
              "strong",
              { style: { color: "#00ff00" } },
              "POWER-UPS:",
            ),
          ),
          React.createElement(
            "p",
            null,
            React.createElement(
              "span",
              { style: { color: "#0ff" } },
              "Current Surge",
            ),
            " - BLAST ENEMIES AWAY",
          ),
          React.createElement(
            "p",
            null,
            React.createElement(
              "span",
              { style: { color: "#f0f" } },
              "Undertow",
            ),
            " - PULL ENEMIES TOWARD YOU",
          ),
          React.createElement(
            "p",
            null,
            React.createElement(
              "span",
              { style: { color: "#ff0" } },
              "Viscosity Shift",
            ),
            " - SLOW THE FLUID",
          ),
        ),
      ),

    gameState === "gameover" &&
      React.createElement(
        "div",
        {
          style: {
            textAlign: "center",
            color: "#fff",
            zIndex: 10,
          },
        },
        React.createElement(
          "h1",
          {
            style: {
              fontSize: "64px",
              margin: "0 0 20px 0",
              color: "#ff4444",
              textShadow: "0 0 30px rgba(255,68,68,0.8)",
            },
          },
          "GAME OVER",
        ),
        React.createElement(
          "p",
          {
            style: { fontSize: "32px", marginBottom: "20px" },
          },
          `Final Score: ${score}`,
        ),
        React.createElement(
          "p",
          {
            style: { fontSize: "24px", marginBottom: "40px", color: "#aaa" },
          },
          `Wave Reached: ${wave}`,
        ),
        React.createElement(
          "button",
          {
            onClick: startGame,
            style: {
              padding: "15px 40px",
              fontSize: "24px",
              background: "linear-gradient(45deg, #ff4444, #ff8844)",
              border: "none",
              borderRadius: "5px",
              color: "#fff",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 0 20px rgba(255,68,68,0.5)",
              transition: "all 0.3s",
            },
            onMouseOver: (e) => {
              e.target.style.transform = "scale(1.1)";
              e.target.style.boxShadow = "0 0 30px rgba(255,68,68,0.8)";
            },
            onMouseOut: (e) => {
              e.target.style.transform = "scale(1)";
              e.target.style.boxShadow = "0 0 20px rgba(255,68,68,0.5)";
            },
          },
          "PLAY AGAIN",
        ),
      ),

    gameState === "playing" &&
      React.createElement(
        "div",
        {
          style: {
            position: "absolute",
            top: "10px",
            width: "1230px",
            display: "flex",
            justifyContent: "space-between",
            color: "#fff",
            fontFamily: "monospace",
            fontSize: "18px",
            fontWeight: "bold",
            zIndex: 100,
          },
        },
        React.createElement(
          "div",
          { style: { marginLeft: "18px" } },
          `Lives: ${lives}`,
        ),
        React.createElement("div", null, `Wave: ${wave}`),
        React.createElement(
          "div",
          { style: { marginRight: "18px" } },
          `Score: ${score}`,
        ),
      ),

    React.createElement("canvas", {
      ref: canvasRef,
      width: WIDTH,
      height: HEIGHT,
      style: {
        position: "absolute",
        top: "30px",
        border: gameState === "playing" ? "1.5px solid #00ffff" : "none",
        boxShadow:
          gameState === "playing" ? "0 0 32px rgba(0,255,255,0.5)" : "none",
        display: gameState === "playing" ? "block" : "none",
      },
    }),
  );
};

// render the app
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(VortexGame));
