# Minesweeper

A web-based Minesweeper game with a persistent leaderboard, served from a containerised Node.js backend.

## Features

- Three difficulty levels — Easy (9×9, 10 mines), Medium (16×16, 40 mines), Hard (16×30, 99 mines)
- First-click safety — mines are generated server-side after the first click, guaranteeing the first cell is never a mine
- Cascade reveal — clicking an empty cell automatically reveals all connected empty cells and their borders
- Right-click (or long-press on mobile) to place / remove flags
- Per-difficulty leaderboard — top 10 fastest clears
- Server-side win verification — the mine map never leaves the server
- Live timer (starts on first click) and mine counter
- Dark mode — follows system preference, with a manual toggle

## Running locally

### With Docker Compose (recommended)

```bash
docker compose up --build
```

Then open <http://localhost:3000>.

The SQLite database is stored in the `minesweeper-data` named volume and survives container restarts.

## Container image

The image is published to the GitHub Container Registry on every push to `main`:

```bash
docker pull ghcr.io/JakePeralta7/minesweeper:latest
docker run -p 3000:3000 -v minesweeper-data:/data ghcr.io/JakePeralta7/minesweeper:latest
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/game` | Start a new game. Body: `{ difficulty: "easy" \| "medium" \| "hard" }` |
| `POST` | `/api/reveal` | Reveal a cell. Body: `{ session_id, row, col, revealed: [{row, col}] }` |
| `GET`  | `/api/leaderboard?difficulty=` | Top 10 scores for a difficulty. |
| `POST` | `/api/leaderboard` | Submit a score. Body: `{ player_name, time_seconds, difficulty, session_id }` |

## Project structure

```
.
├── backend/
│   ├── db.js          # SQLite schema, sessions & scores
│   ├── game.js        # Mine generation, cascade reveal logic
│   ├── server.js      # Express app & API routes
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── style.css      # CSS custom properties + dark mode
│   └── game.js        # Game logic, timer, flag handling, leaderboard UI
├── .github/
│   └── workflows/
│       └── docker-publish.yml
├── docker-compose.yml
└── Dockerfile
```

