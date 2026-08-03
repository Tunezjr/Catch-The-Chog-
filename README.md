# Catch Game

Drag the paddle (mouse or touch) to catch your character as it falls. Miss 3 and it's game over; submit your score to the leaderboard.

## Structure

- `components/GameCanvas.tsx` — the game itself: render loop, paddle drag control, spawn/collision logic, game-over UI
- `app/api/scores/route.ts` — API route: `GET` returns top 10 scores, `POST` saves a new one
- `lib/store.ts` — storage layer. Uses an in-memory array locally; switches to Vercel KV automatically once KV env vars exist
- `public/character.png` — your sprite, drawn in place of a falling star

## Run locally

```
npm install
npm run dev
```

Open http://localhost:3000. The leaderboard will work locally too — it just won't persist between server restarts (in-memory fallback).

## Deploy to Vercel (via GitHub)

1. Push this folder to a new GitHub repo.
2. In Vercel, "Add New Project" → import that repo. It'll detect Next.js automatically, no config needed.
3. For the leaderboard to actually persist in production, add **Vercel KV**:
   - In your Vercel project → Storage tab → Create Database → KV.
   - Connect it to this project. Vercel will automatically inject the `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars — `lib/store.ts` picks these up automatically, no code changes needed.
   - Without this step, the deployed leaderboard will still respond to requests but won't reliably persist scores between requests, since serverless functions don't share memory.
4. Deploy. Every push to your main branch auto-deploys.

## Things worth knowing / next steps

- **Difficulty**: spawn rate and fall speed both ramp up with score (see `spawnFaller`/catch handling in `GameCanvas.tsx`). Tune `spawnInterval`/`fallSpeed` there if it feels too easy/hard.
- **Anti-cheat**: the `/api/scores` POST route does basic range-checking (0–100000) but doesn't validate the score against an actual server-simulated run — someone could POST an inflated score directly. Fine for a casual leaderboard; if that matters later, the fix is having the server replay/validate the run rather than trusting the client's number.
- **Sprite**: currently a single static image. If you want animation (idle bounce, squash on catch, etc.) later, that's a matter of swapping the single `drawImage` call for a sprite-sheet frame cycle — let me know if/when you want that.
