#!/usr/bin/env node
// Sync skills from .agents/skills/ (canonical) to .claude/skills/
// .agents/skills/ is the source of truth (Codex standard)
// .claude/skills/ is auto-generated copy for Claude Code
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SRC = ".agents/skills";
const DST = ".claude/skills";

if (!existsSync(SRC)) {
  console.log(`[sync-skills] ${SRC} not found, skipping`);
  process.exit(0);
}

if (existsSync(DST)) {
  rmSync(DST, { recursive: true, force: true });
}

cpSync(SRC, DST, { recursive: true });

const skills = readdirSync(SRC);
console.log(`[sync-skills] copied ${skills.length} skill(s) from ${SRC} to ${DST}: ${skills.join(", ")}`);
