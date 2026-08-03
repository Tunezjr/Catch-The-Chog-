"use client"; // needed because this component uses hooks + browser APIs (canvas, pointer events)

import { useEffect, useRef, useState } from "react";
import { playCatch, playMiss, playMilestone, playGameOver, unlockAudio } from "@/lib/sound";

// Fixed "logical" game resolution. We draw at this size and let CSS scale
// the canvas element to fit the screen, so the game logic never has to
// worry about different device sizes.
const GAME_W = 400;
const GAME_H = 640;

const PADDLE_W = 90;
const PADDLE_H = 24;
const PADDLE_Y = GAME_H - 50; // paddle sits near the bottom

const CHAR_SIZE = 52; // falling character is drawn at 52x52
const START_LIVES = 3;

// Streak/multiplier tuning: every STREAK_STEP consecutive catches (no
// misses in between) bumps the multiplier by MULTIPLIER_INCREMENT, capped
// at MAX_MULTIPLIER. A miss resets the streak (and multiplier) back to
// baseline. Each catch is worth BASE_POINTS * current multiplier.
const STREAK_STEP = 5;
const MULTIPLIER_INCREMENT = 0.5;
const MAX_MULTIPLIER = 3;
const BASE_POINTS = 10;

// One falling character instance
type Faller = {
  x: number;
  y: number;
  speed: number;
  caught: boolean;
};

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Mutable game state that the render loop reads/writes every frame.
  // We keep this in a ref (not React state) because it changes ~60x/sec —
  // putting it in useState would cause a re-render every frame, which is
  // wasteful. React state below is only for things the UI needs to react to.
  const gameRef = useRef({
    paddleX: GAME_W / 2 - PADDLE_W / 2,
    fallers: [] as Faller[],
    lastSpawn: 0,
    spawnInterval: 1100, // ms between spawns, decreases as score rises
    fallSpeed: 2.2, // px/frame, increases as score rises
    score: 0,
    catches: 0,
    streak: 0,
    multiplier: 1,
    lives: START_LIVES,
    running: true,
  });

  // React state mirrors bits of the above that the UI (score/lives/game-over
  // screen) needs to display. We sync these periodically rather than every
  // frame to avoid excess re-renders.
  const [score, setScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [gameOver, setGameOver] = useState(false);
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([]);

  // Load the character sprite once on mount.
  useEffect(() => {
    const img = new Image();
    img.src = "/character.png";
    imgRef.current = img;
  }, []);

  // Pointer (mouse/touch) drag controls the paddle: paddle x always tracks
  // the pointer's x position, clamped so the paddle can't go off-screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handlePointerMove(clientX: number) {
      const rect = canvas!.getBoundingClientRect();
      // Convert from actual screen pixels to our fixed GAME_W logical space,
      // since the canvas may be scaled up/down by CSS on different screens.
      const scale = GAME_W / rect.width;
      const logicalX = (clientX - rect.left) * scale;
      const clamped = Math.max(0, Math.min(GAME_W - PADDLE_W, logicalX - PADDLE_W / 2));
      gameRef.current.paddleX = clamped;
    }

    const onMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) handlePointerMove(e.touches[0].clientX);
    };
    // Audio playback is blocked by browsers until a user gesture occurs on
    // the page. mousedown/touchstart count as a gesture; mousemove doesn't.
    const onGestureStart = () => unlockAudio();

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("mousedown", onGestureStart);
    canvas.addEventListener("touchstart", onGestureStart, { passive: true });
    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("mousedown", onGestureStart);
      canvas.removeEventListener("touchstart", onGestureStart);
    };
  }, []);

  // The main game loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame: number;

    function spawnFaller(timestamp: number) {
      const g = gameRef.current;
      if (timestamp - g.lastSpawn > g.spawnInterval) {
        g.fallers.push({
          x: Math.random() * (GAME_W - CHAR_SIZE),
          y: -CHAR_SIZE,
          speed: g.fallSpeed + Math.random() * 0.8,
          caught: false,
        });
        g.lastSpawn = timestamp;
      }
    }

    function update(timestamp: number) {
      const g = gameRef.current;
      if (!g.running) return;

      spawnFaller(timestamp);

      for (const f of g.fallers) {
        if (f.caught) continue;
        f.y += f.speed;

        // Catch check: does the falling character's box overlap the paddle's
        // box while it's at paddle height? Simple AABB (axis-aligned
        // bounding box) collision — enough for this kind of game.
        const paddleTop = PADDLE_Y;
        const paddleBottom = PADDLE_Y + PADDLE_H;
        const fallerBottom = f.y + CHAR_SIZE;

        if (
          fallerBottom >= paddleTop &&
          f.y <= paddleBottom &&
          f.x + CHAR_SIZE >= g.paddleX &&
          f.x <= g.paddleX + PADDLE_W
        ) {
          f.caught = true;

          const prevMultiplier = g.multiplier;
          g.streak += 1;
          g.multiplier = Math.min(
            MAX_MULTIPLIER,
            1 + Math.floor(g.streak / STREAK_STEP) * MULTIPLIER_INCREMENT
          );

          const points = Math.round(BASE_POINTS * g.multiplier);
          g.score += points;
          g.catches += 1;

          playCatch(g.multiplier);
          if (g.multiplier > prevMultiplier) {
            // Crossed into a new multiplier tier this catch — layer the
            // milestone chime on top of the catch blip.
            playMilestone();
          }

          // Difficulty ramps up every catch: spawn faster, fall faster,
          // both floored so it never becomes literally impossible/instant.
          // Uses catch *count*, not score, so the multiplier doesn't distort
          // the ramp rate.
          g.spawnInterval = Math.max(500, 1100 - g.catches * 15);
          g.fallSpeed = Math.min(8, 2.2 + g.catches * 0.12);
        } else if (f.y > GAME_H) {
          f.caught = true; // remove it from play
          g.lives -= 1;
          g.streak = 0;
          g.multiplier = 1;
          playMiss();
        }
      }

      // Drop caught/off-screen fallers from the array.
      g.fallers = g.fallers.filter((f) => !f.caught);

      // Sync React state (for UI) roughly once per frame — cheap enough here
      // since it's simple numbers, not the whole game state.
      setScore(g.score);
      setLives(g.lives);
      setStreak(g.streak);
      setMultiplier(g.multiplier);

      if (g.lives <= 0) {
        g.running = false;
        setGameOver(true);
        playGameOver();
      }
    }

    function draw() {
      const g = gameRef.current;
      ctx!.clearRect(0, 0, GAME_W, GAME_H);

      // background
      ctx!.fillStyle = "#1b1a2e";
      ctx!.fillRect(0, 0, GAME_W, GAME_H);

      // paddle
      ctx!.fillStyle = "#8a5cf6";
      ctx!.beginPath();
      ctx!.roundRect(g.paddleX, PADDLE_Y, PADDLE_W, PADDLE_H, 8);
      ctx!.fill();

      // falling characters
      const img = imgRef.current;
      if (img && img.complete) {
        for (const f of g.fallers) {
          ctx!.drawImage(img, f.x, f.y, CHAR_SIZE, CHAR_SIZE);
        }
      }
    }

    function loop(timestamp: number) {
      update(timestamp);
      draw();
      if (gameRef.current.running) {
        animationFrame = requestAnimationFrame(loop);
      }
    }

    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  // Fetch the leaderboard once the game ends.
  useEffect(() => {
    if (!gameOver) return;
    fetch("/api/scores")
      .then((r) => r.json())
      .then((d) => setLeaderboard(d.scores ?? []))
      .catch(() => {});
  }, [gameOver]);

  async function submitScore() {
    await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "Anonymous", score: gameRef.current.score }),
    });
    setSubmitted(true);
    const r = await fetch("/api/scores");
    const d = await r.json();
    setLeaderboard(d.scores ?? []);
  }

  // Builds a Twitter/X "web intent" URL. This is the no-login share method:
  // it just opens a pre-filled tweet composer in a new tab, using whatever
  // account the person is already signed into on x.com. No API keys, no
  // OAuth, nothing to register on the X developer portal.
  //
  // The link points at /share?score=...&name=... rather than the homepage —
  // that page's metadata is what tells X to render the character+score
  // image card instead of a plain text link.
  function shareOnX() {
    const finalScore = gameRef.current.score;
    const text = `I scored ${finalScore} in Catch Game! Can you beat it?`;

    const shareUrl = new URL("/share", window.location.origin);
    shareUrl.searchParams.set("score", String(finalScore));
    shareUrl.searchParams.set("name", name || "Someone");

    const intent =
      "https://twitter.com/intent/tweet" +
      `?text=${encodeURIComponent(text)}` +
      `&url=${encodeURIComponent(shareUrl.toString())}`;

    window.open(intent, "_blank", "noopener,noreferrer");
  }

  function restart() {
    gameRef.current = {
      paddleX: GAME_W / 2 - PADDLE_W / 2,
      fallers: [],
      lastSpawn: 0,
      spawnInterval: 1100,
      fallSpeed: 2.2,
      score: 0,
      catches: 0,
      streak: 0,
      multiplier: 1,
      lives: START_LIVES,
      running: true,
    };
    setScore(0);
    setMultiplier(1);
    setStreak(0);
    setLives(START_LIVES);
    setGameOver(false);
    setSubmitted(false);
    setName("");

    // The render-loop effect only runs once on mount, so simply resetting
    // gameRef/state above won't restart it — reloading is the simplest
    // reliable way to get a fresh loop going.
    window.location.reload();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", gap: 24, fontSize: 18, alignItems: "center" }}>
        <span>Score: {score}</span>
        <span style={{ color: multiplier > 1 ? "#ffd97a" : undefined }}>×{multiplier.toFixed(1)}</span>
        <span style={{ fontSize: 14, opacity: 0.7 }}>Streak: {streak}</span>
        <span>Lives: {"❤️".repeat(Math.max(lives, 0))}</span>
      </div>

      <div style={{ position: "relative", width: "min(92vw, 400px)" }}>
        <canvas
          ref={canvasRef}
          width={GAME_W}
          height={GAME_H}
          style={{ width: "100%", height: "auto", display: "block", borderRadius: 12, touchAction: "none" }}
        />

        {gameOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(10,10,20,0.85)",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 20,
              textAlign: "center",
            }}
          >
            <h2 style={{ margin: 0 }}>Game over</h2>
            <p style={{ margin: 0 }}>Final score: {score}</p>

            <button onClick={shareOnX} style={{ ...buttonStyle, background: "#000" }}>
              Share on X
            </button>

            {!submitted ? (
              <>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={20}
                  style={{ padding: 8, borderRadius: 6, border: "none", width: "80%" }}
                />
                <button onClick={submitScore} style={buttonStyle}>
                  Submit score
                </button>
              </>
            ) : (
              <div style={{ width: "100%" }}>
                <h3>Leaderboard</h3>
                <ol style={{ textAlign: "left", paddingLeft: 20 }}>
                  {leaderboard.map((entry, i) => (
                    <li key={i}>
                      {entry.name} — {entry.score}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <button onClick={restart} style={buttonStyle}>
              Play again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "#8a5cf6",
  color: "white",
  cursor: "pointer",
  fontSize: 14,
};
