# MSTRY

**Mastery** — the modern code editor for developers who orchestrate multiple AI agents in parallel.

![Terminal view](docs/screenshot-terminal.png)

MSTRY is built around a simple idea: **one editor, many agents, zero context switching**. Spin up Claude Code, Codex, Gemini, or OpenCode side-by-side — each on its own git worktree, each on its own branch — and stay in flow while they work.

- **Multi-agent, multi-project workspace** — browse files, read diffs, and drive N agents across M repositories without ever leaving the window.
- **Git worktrees, one click** — create isolated branches for every experiment. No more stashing, no more stepping on your own changes.
- **Persistent terminal sessions** — backed by tmux. Close the app, reopen it, your agents are exactly where you left them.
- **Built-in Monaco editor** — real code editing, syntax highlighting, git diffs, quick open.
- **Live agent status** — see which of your agents are working, which are waiting for you, right in the tab bar.

---

## Install

### Quick install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/IagoLast/MSTRY/main/scripts/remote-install.sh | bash
```

This clones the repo, builds the app, and installs it into `/Applications`.

**Prerequisites:** Node.js, git, and tmux (`brew install tmux`).

### Build from source

```bash
git clone https://github.com/IagoLast/MSTRY.git
cd MSTRY
npm install
npm run dist:install
```

### Optional: `mstry` CLI

From Settings, install the `mstry` command to open any project from your terminal:

```bash
mstry .
mstry ~/code/my-project
```

---

## Why MSTRY

Running multiple AI coding agents in parallel turns your repo into a minefield: they fight over branches, overwrite each other's work, and force you to juggle a dozen terminal windows just to keep track of who's doing what.

MSTRY solves this with a three-level hierarchy:

```
Project          → a git repository
 └─ Worktree     → an isolated branch
     └─ Agent    → a persistent terminal session
```

Each agent lives inside its own worktree, so they can't collide. You stay in one window, one editor, with full visibility into every agent's status.

---

## Features

### Multi-agent orchestration

- **Live agent status** — MSTRY detects Claude Code, OpenAI Codex, Gemini CLI, and OpenCode processes in your terminals and shows whether they're working or idle.
- **One-click CLI install** — install Claude, Codex, Gemini, or OpenCode from Settings. Enable hook-based status tracking per tool.
- **Configurable default command** — set `claude` (or anything else) to launch automatically in every new tab.
- **Persistent tmux sessions** — every tab is backed by tmux. Close MSTRY, reopen it, pick up exactly where you left off.

![Command Palette](docs/screenshot-command-palette.png)

### Git worktrees, built-in

- **Create & delete worktrees** from the sidebar. MSTRY runs `git worktree add` with a new branch, cleans up the folder, prunes metadata, and deletes the local branch on teardown.
- **Checkout main** on any project with a single click.
- **Multi-repo** — add as many projects as you want; drag to reorder them.

### Code editor

- **Monaco-powered editor** with syntax highlighting for 20+ languages.
- **Quick Open** (`⌘P`) — fuzzy-find any file in the workspace powered by ripgrep.
- **Git panel** — see changed files, filter them, click to open a side-by-side diff against HEAD.
- **Unsaved-change indicators** on tabs.

> _Screenshots of the editor and git panel coming soon._

### Ergonomics

- **Command palette** (`⌘K`) — every action, one keystroke away.
- **Drag-and-drop tabs** — reorder terminals and editors freely.
- **Zoom controls** — scale the terminal font on the fly.
- **Tmux mouse mode** toggle (`⌘M`) — copy-paste with the mouse when you want, or hand control to tmux when you don't.

![Settings](docs/screenshot-settings.png)

---

## Keyboard shortcuts

| Shortcut      | Action                                    |
| ------------- | ----------------------------------------- |
| `⌘K`          | Command palette                           |
| `⌘P`          | Quick open file                           |
| `⌘T`          | New terminal tab in current worktree      |
| `⌘Shift+C`    | New Claude agent tab                      |
| `⌘W`          | Close current tab                         |
| `⌘S`          | Save file (in editor tabs)                |
| `⌘B`          | Toggle sidebar                            |
| `⌘M`          | Toggle tmux mouse mode                    |
| `⌘1`–`⌘9`     | Switch to tab N                           |

---

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) — desktop shell
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) — UI
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — code editing and diffs
- [xterm.js](https://xtermjs.org/) + [node-pty](https://github.com/microsoft/node-pty) — real terminal emulation
- [tmux](https://github.com/tmux/tmux) — session persistence
- [ripgrep](https://github.com/BurntSushi/ripgrep) — fuzzy file indexing
- [Tailwind CSS v4](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) — styling and primitives
- [@dnd-kit](https://dndkit.com/) — drag-and-drop tabs

---

## Development

```bash
npm install
npm run dev
```

Build a distributable bundle:

```bash
npm run dist
```

The packaged app lands in `release/`.

---

## License

MIT
