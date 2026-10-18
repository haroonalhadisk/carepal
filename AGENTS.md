# Working rules for agents in this project

You're one of four AI coding agents (Claude Code, Codex, Grok Build, or
Antigravity) working on this project as part of Hadi's Agent Office setup.
This file applies to all of you, whichever one you are. Follow it on every
task, not just when it seems relevant.

## Your task

You'll be given one instruction at a time. Do that task, and only that
task — don't go looking for other things to "improve" while you're in
here unless the instruction asks for it.

## Web searches and documentation

You have full access to search the web and fetch online documentation,
guides, APIs, and libraries whenever needed to research solutions, verify
syntax, or debug issues.

## Git rules — read this part carefully

- **You're already on the right branch, and it's the main one** (`main`
  or `master`, depending on the repo). It was checked out for you before
  you started. Don't create a branch, don't switch branches.
- **Commit your work to that branch as you go**, with clear, honest
  commit messages describing what each commit actually does.
- **When you're done, push it:** `git push origin HEAD`. That's it.
  **Do not create a branch, do not open a pull request, do not ask
  anyone to merge anything.** Work is meant to land directly.
- **Never force-push** — no `git push --force`, `-f`, or
  `--force-with-lease`. A normal push only adds; a force-push rewrites
  history and can destroy work. If a push is rejected, `git pull` first
  and try again. If it still won't go, stop and say so rather than
  forcing it. A hook in this repo will refuse a force-push anyway.
- **Because your work goes live immediately, there's no review step to
  catch mistakes.** Be correspondingly careful: don't make sweeping
  changes the task didn't ask for, and don't "clean up" or reformat
  files you weren't asked to touch.

## What never to touch

- Never read, print, log, or commit the contents of `.env` files, API
  keys, passwords, tokens, or anything else that looks like a secret.
  If a task seems to require one, stop instead of guessing or hunting
  for it.
- Never deploy anything to production or touch live infrastructure.
- Don't install or remove system-wide packages, and don't change git
  configuration beyond what's already set up for you here.
- Stay inside this project's folder for code and edits. Standard build tools,
  compilers, and package managers (e.g. Flutter, Gradle, npm, pip, Dart)
  are permitted to read and write their standard caches/configs in `~/.cache`,
  `~/.config`, `~/.pub-cache`, `~/.gradle`, `/tmp`, etc. Don't edit other projects
  or Agent Office's own files.

## If you're stuck or unsure

If something in the task is genuinely unclear, or you can't proceed
safely without guessing, don't push forward on a guess and don't work
around it destructively. Instead:

1. Create a file called `BLOCKED.md` in this project's root folder
   (next to this file), containing clear, specific questions — what
   you need to know or decide, and why you're stuck. One question is
   better than a vague summary of the whole task.
2. Stop there. Don't keep working on other parts of the task after
   writing it.

Write each question as a `## Question:` heading, one or two lines of
context, then the choices you can see as a bullet list — Hadi picks one
from a menu on his phone, so make each option a complete answer you
could act on. Put your recommendation first and mark it. He can always
type his own answer instead, so only list options you'd genuinely be
happy to carry out. If you need more than one decision, add more
`## Question:` sections; they're asked one at a time.

```markdown
## Question: Which database should the sync service write to?
Both are wired up and they handle conflicts differently.
- Postgres (recommended): the API already uses it
- SQLite: simpler, but only one writer at a time

## Question: Should I delete the old migration files?
- Yes, delete them
- No, keep them for reference
```

If there genuinely are no sensible choices, a plain question still
works — he'll type the answer.

Agent Office watches for this file. Hadi gets pinged on his phone with
your question, and when he answers, a new task picks up from exactly
where you left off (same branch, same project) with his answer included
— so commit whatever partial progress is safe to commit before you
write `BLOCKED.md`, the same as you would at the end of a normal task.

## Sending files or deliverables to Hadi (Direct Tailscale Downloads & Telegram)

If a task asks you to share, send, or upload a built file or deliverable
(such as an APK, build artifact, export, log, or image) to Hadi or Telegram,
use the `ao-send-file` command in your shell:

```bash
ao-send-file <path-to-file> [optional caption]
```

Examples:
- `ao-send-file build/app/outputs/flutter-apk/app-arm64-v8a-release.apk "Release APK"`
- `ao-send-file summary.pdf --caption "Report summary"`

### Direct High-Speed Tailscale Downloads & Large Files
`ao-send-file` automatically publishes files to the high-speed Tailscale download server (`http://100.74.2.28:8765/downloads/<filename>`):
- Files **under 50 MB** are sent directly as Telegram attachments AND given direct download links.
- Files **over 50 MB** (such as large APKs, AAB bundles, or archives) automatically generate 1-tap direct Tailscale download links (`http://100.74.2.28:8765/downloads/<filename>`) sent to Telegram and the web chat.
- Always include the direct Tailscale download URL in your final task summary response for easy 1-tap download on mobile.

## Heavy Builds and Compilations (`ao-build`)

Agents are free to think, analyze, and edit code in parallel across all projects.
When executing heavy compilation steps (such as `flutter build`, `./gradlew assembleRelease`, `./gradlew build`, Gradle/Android builds), use the `ao-build` wrapper:

```bash
ao-build <build-command...>
```

Examples:
- `ao-build flutter build apk --split-per-abi`
- `ao-build ./gradlew assembleRelease`
- `ao-build gradle assemble`

`ao-build` automatically queues the compilation if another build is running and proceeds as soon as the lock is freed.

### Critical build rules:
- **Builds and compilations take time (2–6 minutes) to queue and compile.** This is normal and expected.
- **NEVER create `BLOCKED.md` or ask the user for updates regarding queued builds or `ao-build`.**
- `ao-build` handles everything automatically without human babysitting. Always let `ao-build` run to completion.

## Hosting Persistent Web Servers and Tunnels (`ao-serve`)

When asked to host, serve, or launch a local web server, website, or API tunnel:
- **Do NOT launch background jobs directly inside your task subshell** (e.g. `python3 -m http.server &` or `nohup ... &`), because background jobs inside the task subshell are terminated immediately when the task turn finishes.
- **Use the `ao-serve` wrapper** to launch persistent background servers and tunnels in detached tmux sessions:
  ```bash
  # Serve current directory statically (auto-assigned free port & tunnel)
  ao-serve

  # Serve specific directory or port
  ao-serve build/web --port 8080

  # Serve custom app command with tunnel
  ao-serve --cmd "npm run dev" --port 3000 --name my-app
  ```
- `ao-serve` automatically creates detached tmux sessions (`ao-srv-<name>`, `ao-tun-<name>`) and outputs the **Local URL**, **Tailscale URL** (`http://100.74.2.28:<port>`), and public **Cloudflare Tunnel URL**.
- To list or stop running servers:
  ```bash
  ao-serve list
  ao-serve stop <name>
  ```
- Always report the Tailscale and Tunnel URLs back to Hadi in your final message.

## Multi-Agent Squads & Autonomous Role Delegation (`ao-request-agent`, `ao-team`)

Agent Office operates as a **Multi-Agent Squad** (e.g. Tutobear Fullstack Squad, Portfolio Squad). Each agent is assigned a specific specialization and dedicated repository:
- **Claude**: Backend Lead / API Specialist (`tutobear-backend` or active assigned repo)
- **Codex**: Frontend Architect / Mobile & Web UI (`tutobear_app` or active assigned repo)
- **Grok**: Fullstack & QA Specialist / Test Engineering
- **Antigravity**: DevOps, Deployment & System Architect

### Critical Squad Rules:
1. **Repository Isolation**:
   - You **only edit code in your assigned project folder**.
   - NEVER create or edit files in another repository directly.
2. **Autonomous Inter-Agent Delegation (`ao-request-agent`)**:
   - If a task requires changes in another component (e.g., you are Backend Lead and the task requires Frontend UI changes, or you are Frontend Architect and need a new backend endpoint):
     - **DO NOT attempt to write both sides yourself.**
     - **DO NOT ask the user or write BLOCKED.md for cross-repository work.**
     - Instead, delegate that part directly to your teammate using `ao-request-agent`:
       ```bash
       # Delegate to frontend teammate and wait for completion:
       ao-request-agent --to codex --instruction "Implement login UI page with email/password fields connecting to POST /api/v1/auth/login" --wait

       # Delegate to backend teammate and wait for completion:
       ao-request-agent --to claude --instruction "Create POST /api/v1/auth/login endpoint returning JWT access token" --wait
       ```
3. **Automatic Queueing & Git Sync**:
   - If your teammate is currently busy, `ao-request-agent` automatically queues your request.
   - When your teammate completes the task, their work is committed to `main`, and `ao-request-agent --wait` returns their full response summary.
   - You can then use their returned API specifications/contracts to complete your own work seamlessly.

## Task & Backlog Management (`ao-todo`)

Agent Office includes a dedicated **Backlog & Task Hub** (`http://100.74.2.28:8765/todos`).
When the user asks you to create, manage, or view tasks/todos:

- **Add a new task**:
  ```bash
  # Personal task for Hadi
  ao-todo add "Review design mockups" --assign hadi --priority high --due 2026-10-05

  # Agent execution task (Auto-executes after current task or manual trigger)
  ao-todo add "Add user streak tracking endpoint" --project tutobear-backend --assign claude --mode auto --priority urgent --checklist "Add DB model,Implement route,Add unit tests"
  ```
- **List tasks**:
  ```bash
  ao-todo list --assign me
  ao-todo list --project tutobear-backend
  ```
- **Complete or check off sub-items**:
  ```bash
  ao-todo complete <todo-id>
  ao-todo check <checklist-item-id>
  ```





