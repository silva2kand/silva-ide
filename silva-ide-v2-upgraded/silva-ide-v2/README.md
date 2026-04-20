# ⬡ Silva IDE

A production-ready, AI-powered cross-platform code editor built on Electron + Monaco Editor (same engine as VS Code).

---

## Features

- **Real Monaco Editor** — syntax highlighting for 50+ languages, IntelliSense, bracket matching, code folding, minimap, multi-cursor, find & replace, split editor
- **Real AI Integration** — Anthropic Claude, OpenAI GPT-4o, Google Gemini, Groq (Llama), Ollama (local) with live API calls
- **Integrated Terminal** — full xterm.js terminal with shell support (bash/zsh/PowerShell)
- **File Explorer** — full file tree, create/rename/delete, context menus, file watching
- **Git Integration** — status, diff, stage, commit, pull, push via simple-git
- **Full-text Search** — search across all open files with regex, case-sensitive, whole-word options
- **4 Themes** — Catppuccin Mocha (default), Catppuccin Latte (light), Dracula, GitHub Dark, Nord
- **Command Palette** — Ctrl+Shift+P
- **Keyboard Shortcuts** — full VS Code-compatible shortcuts
- **Cross-platform** — Windows, macOS, Linux

---

## Quick Start

### Prerequisites
- **Node.js** v18+ ([nodejs.org](https://nodejs.org))
- **npm** v9+

### Installation

```bash
# 1. Clone or extract the project
cd silva-ide

# 2. Install dependencies
npm install

# 3. Launch in development mode
npm start

# Or with DevTools open:
npm run dev
```

### Build Distributable

```bash
# Build for your current platform
npm run build

# Platform-specific
npm run build:win    # Windows NSIS installer
npm run build:mac    # macOS DMG
npm run build:linux  # Linux AppImage
```

Builds output to the `dist/` folder.

---

## AI Setup

Go to **Settings panel** (gear icon) → **AI Providers** section.

| Provider | Get Free Key | Best For |
|----------|-------------|----------|
| **Anthropic Claude** | [console.anthropic.com](https://console.anthropic.com) | Best overall, code quality |
| **OpenAI GPT** | [platform.openai.com](https://platform.openai.com) | Versatile, fast |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com/apikey) | Free tier, fast |
| **Groq** | [console.groq.com](https://console.groq.com/keys) | **Free**, blazing fast |
| **Ollama** | [ollama.ai](https://ollama.ai) | **100% local**, no API key |

### Ollama (Local AI, no cost)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh  # Mac/Linux
# Windows: https://ollama.ai/download

# Pull a model
ollama pull llama3.2       # 2GB, general purpose
ollama pull codellama      # 4GB, code-focused
ollama pull deepseek-coder # best for code

# Silva IDE auto-connects to http://localhost:11434
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New file |
| `Ctrl+S` | Save file |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+O` | Open file |
| `Ctrl+Shift+O` | Open folder |
| `Ctrl+W` | Close tab |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+\`` | Toggle terminal |
| `Ctrl+Shift+A` | Toggle AI panel |
| `Ctrl+F` | Find in file |
| `Ctrl+H` | Replace in file |
| `Ctrl+Shift+P` | Command palette |
| `F5` | Run current file |

---

## AI Quick Actions

Select code in the editor, then click in the AI panel:

- **Explain code** — detailed explanation of selected code
- **Fix bugs** — find and fix all bugs
- **Refactor** — improve clarity and performance
- **Add docs** — add docstrings and comments
- **Write tests** — generate unit tests with edge cases
- **Code review** — security, performance, best practices audit

You can also just type any question in the AI chat.

---

## Project Structure

```
silva-ide/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process
│   │   └── preload.js       # Secure IPC bridge
│   └── renderer/
│       ├── index.html       # App shell
│       ├── app.js           # Bootstrap
│       ├── components/
│       │   ├── editor.js    # Monaco editor manager
│       │   ├── fileTree.js  # File explorer
│       │   ├── terminal.js  # xterm.js terminal
│       │   ├── ai.js        # AI panel + API calls
│       │   ├── git.js       # Git integration
│       │   ├── search.js    # Full-text search
│       │   └── settings.js  # Settings manager
│       ├── utils/
│       │   ├── languageDetect.js
│       │   ├── notifications.js
│       │   └── keybindings.js
│       └── styles/
│           └── main.css
├── public/                  # Icons, static assets
├── package.json
└── README.md
```

---

## Supported Languages

JavaScript, TypeScript, Python, Rust, Go, Java, Kotlin, Swift, Ruby, PHP, C, C++, C#, HTML, CSS, SCSS, JSON, YAML, Markdown, Shell, PowerShell, SQL, R, Lua, Dart, Zig, Elixir, Erlang, Haskell, F#, Clojure, Scala, GraphQL, Protobuf, Terraform HCL, Dockerfile, Makefile, and more.

---

## Troubleshooting

**Terminal not working?**
```bash
# node-pty requires native compilation
npm install node-pty --build-from-source
```

**Monaco editor not loading?**
- Check your internet connection (Monaco loads from CDN)
- Or bundle Monaco locally: `npm install monaco-editor` and update the script path

**AI not responding?**
- Check your API key in Settings
- Verify the key has sufficient credits/quota
- For Ollama: ensure `ollama serve` is running

---

## License

MIT © Silva IDE
