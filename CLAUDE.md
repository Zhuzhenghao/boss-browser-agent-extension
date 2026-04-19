# CLAUDE.md

## Project Overview

BOSS Browser Agent Extension — a Chrome extension + local server that automates candidate screening on BOSS Zhipin (Chinese recruitment platform). It opens chats, reads resumes, and sends match/reject messages based on job profile criteria.

## Architecture

```
entrypoints/          # WXT browser extension (React sidepanel UI)
  sidepanel/          # Main UI — workspace, task details, JD profile editor
  background.js       # Extension service worker

server/               # Express server (started via `pnpm bridge`)
  bridge-server.js    # Express app, routes, starts on :3322
  state.js            # In-memory server state (single source of truth for running task)
  task-worker.js      # Child process spawned per screening task (IPC with parent)
  controllers/        # HTTP handlers
  job-profiles-store.js  # SQLite CRUD for job profiles
  job-profile-import.js  # AI-powered JD file import (PDF/DOCX/images)

agents/               # AI agent logic (runs inside task-worker child process)
  unread-screening-agent.js  # Main orchestrator — browser nav + per-candidate AI loop
  services/
    db.js             # SQLite (node:sqlite DatabaseSync, WAL mode)
    task-persistence.js  # Task & candidate CRUD (screening_tasks, screening_candidates, screening_events)
    resume-service.js    # Resume extraction: scroll-copy-parse loop
    browser-actions.js   # Low-level Midscene browser commands
    language-model.js    # OpenAI-compatible LLM client
    job-profile-scheduler.js  # Scheduled auto-screening per JD profile
  tools/
    candidate-screening-tools.js  # Vercel AI SDK tool definitions for per-candidate agent
    task-discovery.js   # Browser actions: open chat index, switch to unread, read candidate list

shared/               # Code shared between server and extension
  job-profiles.js     # buildTargetProfileFromJobProfile()
```

## Key Concepts

### Two Screening Modes
1. **Auto-discover**: No candidate names specified. Agent navigates to BOSS chat, switches to "unread" filter, reads candidate names, then processes each.
2. **Specified candidates**: Candidate names provided upfront. Agent navigates to BOSS chat, searches each candidate by name.

Both modes share the same browser navigation (`ensureBossChatPage`) and per-candidate processing loop.

### Task Lifecycle
1. Controller creates a **placeholder task** in SQLite and returns `taskId` immediately
2. Controller spawns `task-worker.js` as a child process with IPC
3. Worker runs `runUnreadScreeningAgent()` which connects to Chrome via Midscene bridge
4. Worker sends `task-update`, `tool-event`, `task-finished`, `task-failed` messages back via IPC
5. Controller merges updates into `state.unreadTaskState` for SSE subscribers

### Per-Candidate Processing
Each candidate is handled by a `ToolLoopAgent` (Vercel AI SDK) with tools: `open_candidate_chat`, `open_candidate_resume`, `extract_candidate_resume`, `close_candidate_resume`, `request_resume`, `pin_candidate`, `send_rejection_message`, `read_chat_context`.

### Persistence
- **SQLite** (synchronous `node:sqlite` with WAL): `screening_tasks`, `screening_candidates`, `screening_events`, `job_profiles`
- DB file: `screening-data/screening.sqlite`
- Per-candidate updates use `persistSingleCandidate()` for O(1) writes instead of full task rewrite

## Commands

```bash
pnpm dev        # Start WXT dev server (extension hot reload)
pnpm bridge     # Start Express server + Midscene bridge on :3322
pnpm build      # Build extension for production
```

## Tech Stack

- **Extension framework**: WXT (Vite-based)
- **UI**: React 19, Ant Design 6, TailwindCSS 4
- **Server**: Express 5, ESM modules
- **AI**: Vercel AI SDK (`ai` package), OpenAI-compatible provider
- **Browser automation**: Midscene (`@midscene/web` bridge mode)
- **DB**: Node.js built-in `node:sqlite` (DatabaseSync)
- **Package manager**: pnpm

## Conventions

- All server/agent code is **ESM** (`"type": "module"` in package.json)
- Chinese UI text and log messages throughout (this is a Chinese recruitment tool)
- `isRunning(state)` is the single source of truth for task running status — never check `state.running` directly
- Task IDs follow pattern: `screening-{timestamp}-{random}`
- `sendJson(res, statusCode, payload)` uses Express style `res.status().json()`
