// app/api/scores/route.ts
//
// This file becomes the endpoint /api/scores automatically (Next.js App
// Router file-based routing). Exporting a function named after an HTTP
// method (GET, POST, ...) wires it up to that verb.

import { NextRequest, NextResponse } from "next/server";
import { addScore, getTopScores } from "@/lib/store";

// GET /api/scores  -> returns the top 10 leaderboard entries as JSON
export async function GET() {
  const scores = await getTopScores(10);
  return NextResponse.json({ scores });
}

// POST /api/scores  -> body: { name: string, score: number }
// Saves a new score if it passes basic sanity checks.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.name !== "string" || typeof body.score !== "number") {
    return NextResponse.json(
      { error: "Expected { name: string, score: number }" },
      { status: 400 }
    );
  }

  // Basic guardrails. This is NOT real anti-cheat (a determined person can
  // still POST here directly), but it stops accidental garbage and the most
  // trivial abuse. Real anti-cheat would mean the server simulating/
  // validating the run itself, which is a bigger lift than this game needs
  // to start with.
  const name = body.name.trim().slice(0, 20) || "Anonymous";
  const score = Math.floor(body.score);
  if (score < 0 || score > 100000) {
    return NextResponse.json({ error: "Score out of range" }, { status: 400 });
  }

  await addScore({ name, score, ts: Date.now() });

  return NextResponse.json({ ok: true });
}
