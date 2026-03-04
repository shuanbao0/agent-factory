#!/usr/bin/env bash
#
# Agent Factory — Unified Install Script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/shuanbao0/agent-factory/main/scripts/install.sh | bash
#   bash scripts/install.sh [OPTIONS]
#
# Options:
#   --no-prompt          Non-interactive mode (for CI/CD)
#   --skip-ui            Skip UI dependency installation
#   --api-key <key>      Set Anthropic API key directly
#   --dir <path>         Installation directory (default: ./agent-factory)
#   --version <ver>      Install specific version (e.g. v0.2.0, default: latest)
#
set -euo pipefail

# ─── Constants ───────────────────────────────────────────────────────────────

REPO_OWNER="shuanbao0"
REPO_NAME="agent-factory"
GITHUB_REPO="https://github.com/${REPO_OWNER}/${REPO_NAME}"
GITHUB_API="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}"
REQUIRED_NODE_MAJOR=22
NVM_INSTALL_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh"

# ─── Default Options ─────────────────────────────────────────────────────────

INTERACTIVE=true
SKIP_UI=false
API_KEY=""
INSTALL_DIR=""
VERSION=""

# ─── Colors ──────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' DIM='' RESET=''
fi

# ─── Helpers ─────────────────────────────────────────────────────────────────

info()    { echo -e "${BLUE}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "${RED}[ERR]${RESET}  $*" >&2; }
fatal()   { error "$@"; exit 1; }

step() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━ $* ━━━${RESET}"
}

confirm() {
  if [[ "$INTERACTIVE" != true ]]; then
    return 0
  fi
  local prompt="$1"
  local default="${2:-y}"
  local yn
  if [[ "$default" == "y" ]]; then
    read -rp "$(echo -e "${YELLOW}$prompt [Y/n]${RESET} ")" yn
    yn="${yn:-y}"
  else
    read -rp "$(echo -e "${YELLOW}$prompt [y/N]${RESET} ")" yn
    yn="${yn:-n}"
  fi
  [[ "$yn" =~ ^[Yy] ]]
}

command_exists() {
  command -v "$1" &>/dev/null
}

# ─── Parse Arguments ─────────────────────────────────────────────────────────

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-prompt)
        INTERACTIVE=false
        shift
        ;;
      --skip-ui)
        SKIP_UI=true
        shift
        ;;
      --api-key)
        [[ -z "${2:-}" ]] && fatal "--api-key requires a value"
        API_KEY="$2"
        shift 2
        ;;
      --dir)
        [[ -z "${2:-}" ]] && fatal "--dir requires a value"
        INSTALL_DIR="$2"
        shift 2
        ;;
      --version)
        [[ -z "${2:-}" ]] && fatal "--version requires a value"
        VERSION="$2"
        shift 2
        ;;
      -h|--help)
        show_help
        exit 0
        ;;
      *)
        fatal "Unknown option: $1 (use --help for usage)"
        ;;
    esac
  done
}

show_help() {
  cat <<'HELP'
Agent Factory — Unified Install Script

Usage:
  bash install.sh [OPTIONS]

Options:
  --no-prompt          Non-interactive mode (skip all prompts)
  --skip-ui            Skip UI dependency installation
  --api-key <key>      Set Anthropic API key directly
  --dir <path>         Installation directory (default: ./agent-factory)
  --version <ver>      Install specific version (e.g. v0.2.0)
  -h, --help           Show this help message

Examples:
  # Interactive install (recommended)
  bash install.sh

  # CI/CD install with API key
  bash install.sh --no-prompt --api-key sk-ant-xxx

  # Install specific version to custom directory
  bash install.sh --version v0.2.0 --dir ~/my-factory
HELP
}

# ─── OS Detection ────────────────────────────────────────────────────────────

detect_os() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Darwin)
      PLATFORM="macos"
      PKG_MANAGER=""
      if command_exists brew; then
        PKG_MANAGER="brew"
      fi
      ;;
    Linux)
      PLATFORM="linux"
      if grep -qi "microsoft" /proc/version 2>/dev/null; then
        PLATFORM="wsl"
      fi
      # Detect package manager
      if command_exists apt-get; then
        PKG_MANAGER="apt"
      elif command_exists dnf; then
        PKG_MANAGER="dnf"
      elif command_exists yum; then
        PKG_MANAGER="yum"
      elif command_exists pacman; then
        PKG_MANAGER="pacman"
      elif command_exists apk; then
        PKG_MANAGER="apk"
      else
        PKG_MANAGER=""
      fi
      ;;
    *)
      fatal "Unsupported operating system: $OS"
      ;;
  esac

  info "Detected: ${BOLD}$PLATFORM${RESET} ($ARCH)"
}

# ─── Dependency Installation ─────────────────────────────────────────────────

install_pkg() {
  local pkg="$1"
  info "Installing ${BOLD}$pkg${RESET}..."
  case "$PKG_MANAGER" in
    brew)    brew install "$pkg" ;;
    apt)     sudo apt-get update -qq && sudo apt-get install -y -qq "$pkg" ;;
    dnf)     sudo dnf install -y -q "$pkg" ;;
    yum)     sudo yum install -y -q "$pkg" ;;
    pacman)  sudo pacman -S --noconfirm "$pkg" ;;
    apk)     sudo apk add --quiet "$pkg" ;;
    *)       return 1 ;;
  esac
}

ensure_curl() {
  if command_exists curl; then
    return 0
  fi
  warn "curl is not installed."
  if [[ -z "$PKG_MANAGER" ]]; then
    fatal "Cannot auto-install curl: no supported package manager found. Please install curl manually."
  fi
  if confirm "Install curl via $PKG_MANAGER?"; then
    install_pkg curl
    success "curl installed."
  else
    fatal "curl is required. Please install it manually."
  fi
}

ensure_git() {
  if command_exists git; then
    success "git $(git --version | awk '{print $3}') found."
    return 0
  fi
  warn "git is not installed."
  if [[ "$PLATFORM" == "macos" ]]; then
    if confirm "Install git? (via Xcode Command Line Tools)"; then
      info "Installing Xcode Command Line Tools (includes git)..."
      xcode-select --install 2>/dev/null || true
      # Wait for installation — xcode-select --install is async on macOS
      info "Waiting for Xcode CLT installation to complete..."
      until command_exists git; do
        sleep 5
      done
      success "git installed."
    else
      warn "git is not installed. Will try downloading release tarball instead."
      return 1
    fi
  elif [[ -n "$PKG_MANAGER" ]]; then
    if confirm "Install git via $PKG_MANAGER?"; then
      install_pkg git
      success "git installed."
    else
      warn "git is not installed. Will try downloading release tarball instead."
      return 1
    fi
  else
    warn "Cannot auto-install git: no supported package manager found."
    return 1
  fi
}

ensure_node() {
  local current_major=0

  # Check if Node.js is already available
  if command_exists node; then
    local node_version
    node_version="$(node --version 2>/dev/null | sed 's/^v//')"
    current_major="$(echo "$node_version" | cut -d. -f1)"
    if [[ "$current_major" -ge "$REQUIRED_NODE_MAJOR" ]]; then
      success "Node.js v${node_version} found (>= ${REQUIRED_NODE_MAJOR} required)."
      return 0
    fi
    warn "Node.js v${node_version} found, but v${REQUIRED_NODE_MAJOR}+ is required."
  else
    warn "Node.js is not installed."
  fi

  # Try to install via nvm
  info "Will install Node.js ${REQUIRED_NODE_MAJOR} via nvm."

  # Load nvm if already installed but not sourced
  load_nvm

  if ! command_exists nvm; then
    if confirm "Install nvm (Node Version Manager) to manage Node.js?"; then
      install_nvm
    else
      fatal "Node.js >= ${REQUIRED_NODE_MAJOR} is required. Please install it manually:\n  https://nodejs.org/ or https://github.com/nvm-sh/nvm"
    fi
  fi

  # Install required Node.js version via nvm
  info "Installing Node.js ${REQUIRED_NODE_MAJOR} via nvm..."
  nvm install "$REQUIRED_NODE_MAJOR"
  nvm use "$REQUIRED_NODE_MAJOR"

  # Verify
  if command_exists node; then
    local installed_version
    installed_version="$(node --version 2>/dev/null)"
    success "Node.js ${installed_version} installed successfully."
  else
    fatal "Failed to install Node.js. Please install Node.js >= ${REQUIRED_NODE_MAJOR} manually."
  fi
}

load_nvm() {
  # Try common nvm locations
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
  elif [[ -s "/usr/local/opt/nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "/usr/local/opt/nvm/nvm.sh"
  elif [[ -s "$HOME/.config/nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.config/nvm/nvm.sh"
  fi
}

install_nvm() {
  info "Installing nvm..."
  curl -fsSL "$NVM_INSTALL_URL" | bash
  load_nvm
  if ! command_exists nvm; then
    fatal "nvm installation failed. Please install manually: https://github.com/nvm-sh/nvm"
  fi
  success "nvm installed."
}

ensure_npm() {
  if command_exists npm; then
    success "npm $(npm --version) found."
    return 0
  fi
  fatal "npm is not available. It should come with Node.js. Please reinstall Node.js."
}

check_dependencies() {
  step "Step 1/6: Checking system dependencies"

  detect_os
  ensure_curl
  ensure_node
  ensure_npm
  # git is optional — only needed as fallback if release download fails
}

# ─── Project Acquisition ─────────────────────────────────────────────────────

resolve_version() {
  if [[ -n "$VERSION" ]]; then
    # Ensure version starts with 'v'
    if [[ "$VERSION" != v* ]]; then
      VERSION="v${VERSION}"
    fi
    info "Target version: ${BOLD}$VERSION${RESET}"
    return 0
  fi

  # Query latest release from GitHub API
  info "Querying latest release..."
  local api_response
  api_response="$(curl -fsSL "${GITHUB_API}/releases/latest" 2>/dev/null)" || {
    warn "Failed to query GitHub releases API. Will try git clone instead."
    VERSION=""
    return 1
  }

  VERSION="$(echo "$api_response" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
  if [[ -z "$VERSION" ]]; then
    warn "No releases found. Will try git clone instead."
    return 1
  fi

  info "Latest release: ${BOLD}$VERSION${RESET}"
}

download_release() {
  local tarball_name="${REPO_NAME}-${VERSION}.tar.gz"
  local download_url="${GITHUB_REPO}/releases/download/${VERSION}/${tarball_name}"

  info "Downloading ${BOLD}${tarball_name}${RESET}..."
  if curl -fsSL -o "/tmp/${tarball_name}" "$download_url" 2>/dev/null; then
    info "Extracting..."
    mkdir -p "$INSTALL_DIR"
    tar -xzf "/tmp/${tarball_name}" -C "$INSTALL_DIR" --strip-components=1
    rm -f "/tmp/${tarball_name}"
    success "Downloaded and extracted $VERSION."
    return 0
  else
    warn "Release tarball not available at: $download_url"
    return 1
  fi
}

clone_repo() {
  if ! command_exists git; then
    # Try installing git as a last resort
    ensure_git || fatal "Cannot acquire project: no release tarball available and git is not installed.\nPlease install git or check https://github.com/${REPO_OWNER}/${REPO_NAME}/releases"
  fi

  info "Cloning repository..."
  if [[ -n "$VERSION" && "$VERSION" != "latest" ]]; then
    git clone --depth 1 --branch "$VERSION" "$GITHUB_REPO" "$INSTALL_DIR"
  else
    git clone --depth 1 "$GITHUB_REPO" "$INSTALL_DIR"
  fi
  success "Repository cloned."
}

acquire_project() {
  step "Step 2/6: Acquiring Agent Factory"

  # Check if we are already inside the project directory
  if [[ -f "package.json" ]] && grep -q '"name": "agent-factory"' package.json 2>/dev/null; then
    INSTALL_DIR="$(pwd)"
    success "Already in agent-factory directory: $INSTALL_DIR"
    return 0
  fi

  # Set default install directory
  if [[ -z "$INSTALL_DIR" ]]; then
    INSTALL_DIR="$(pwd)/${REPO_NAME}"
  fi

  # Check if directory already exists and contains the project
  if [[ -d "$INSTALL_DIR" && -f "$INSTALL_DIR/package.json" ]] \
     && grep -q '"name": "agent-factory"' "$INSTALL_DIR/package.json" 2>/dev/null; then
    success "Agent Factory already exists at: $INSTALL_DIR"
    return 0
  fi

  # Strategy: try release download first, fall back to git clone
  local acquired=false

  if resolve_version; then
    if download_release; then
      acquired=true
    fi
  fi

  if [[ "$acquired" != true ]]; then
    info "Falling back to git clone..."
    clone_repo
  fi

  success "Project acquired at: ${BOLD}$INSTALL_DIR${RESET}"
}

# ─── Dependency Installation ─────────────────────────────────────────────────

install_dependencies() {
  step "Step 3/6: Installing dependencies"

  cd "$INSTALL_DIR"

  # Root dependencies (openclaw + clawhub)
  info "Installing root dependencies..."
  npm install
  success "Root dependencies installed."

  # UI dependencies
  if [[ "$SKIP_UI" == true ]]; then
    info "Skipping UI dependencies (--skip-ui)."
  else
    if [[ -d "ui" && -f "ui/package.json" ]]; then
      info "Installing UI dependencies..."
      (cd ui && npm install)
      success "UI dependencies installed."
    else
      warn "ui/ directory not found, skipping UI dependencies."
    fi
  fi
}

# ─── Configuration ───────────────────────────────────────────────────────────

init_config() {
  step "Step 4/6: Initializing configuration"

  cd "$INSTALL_DIR"

  # Copy default config files (only if not existing)
  local copied=0

  if [[ -f "config/openclaw.default.json" && ! -f "config/openclaw.json" ]]; then
    cp config/openclaw.default.json config/openclaw.json
    success "Created config/openclaw.json"
    ((copied++)) || true
  elif [[ -f "config/openclaw.json" ]]; then
    info "config/openclaw.json already exists, skipping."
  fi

  if [[ -f "config/models.default.json" && ! -f "config/models.json" ]]; then
    cp config/models.default.json config/models.json
    success "Created config/models.json"
    ((copied++)) || true
  elif [[ -f "config/models.json" ]]; then
    info "config/models.json already exists, skipping."
  fi

  if [[ -f ".env.example" && ! -f ".env" ]]; then
    cp .env.example .env
    success "Created .env from template"
    ((copied++)) || true
  elif [[ -f ".env" ]]; then
    info ".env already exists, skipping."
  fi

  # Create necessary directories
  local dirs=("agents" "workspaces" "templates/custom" "projects")
  for dir in "${dirs[@]}"; do
    mkdir -p "$dir"
  done
  info "Ensured directories: ${dirs[*]}"

  if [[ $copied -eq 0 ]]; then
    info "All config files already present."
  else
    success "$copied config file(s) initialized."
  fi
}

# ─── API Key Configuration ───────────────────────────────────────────────────

configure_api_keys() {
  step "Step 5/6: Configuring API keys"

  cd "$INSTALL_DIR"

  # If --api-key was provided, write it directly
  if [[ -n "$API_KEY" ]]; then
    set_env_value "ANTHROPIC_API_KEY" "$API_KEY"
    success "Anthropic API key configured via --api-key."
    return 0
  fi

  # Check if .env already has a real API key
  if [[ -f ".env" ]] && grep -qE '^ANTHROPIC_API_KEY=sk-ant-[A-Za-z0-9]' .env; then
    success "Anthropic API key already configured in .env."
    return 0
  fi

  # Non-interactive mode: skip prompting
  if [[ "$INTERACTIVE" != true ]]; then
    warn "No API key provided. Set ANTHROPIC_API_KEY in .env before starting."
    return 0
  fi

  # Interactive: prompt for API keys
  echo ""
  info "Agent Factory needs at least one LLM provider API key."
  info "Get your Anthropic API key at: ${BOLD}https://console.anthropic.com/settings/keys${RESET}"
  echo ""

  # Anthropic (primary)
  local anthropic_key
  read -rp "$(echo -e "${CYAN}Anthropic API Key${RESET} (sk-ant-...): ")" anthropic_key
  if [[ -n "$anthropic_key" ]]; then
    set_env_value "ANTHROPIC_API_KEY" "$anthropic_key"
    success "Anthropic API key saved."
  else
    warn "No Anthropic key entered. You can add it later in .env."
  fi

  # OpenAI (optional)
  echo ""
  local openai_key
  read -rp "$(echo -e "${DIM}OpenAI API Key (optional, press Enter to skip):${RESET} ")" openai_key
  if [[ -n "$openai_key" ]]; then
    set_env_value "OPENAI_API_KEY" "$openai_key"
    success "OpenAI API key saved."
  fi

  # DeepSeek (optional)
  local deepseek_key
  read -rp "$(echo -e "${DIM}DeepSeek API Key (optional, press Enter to skip):${RESET} ")" deepseek_key
  if [[ -n "$deepseek_key" ]]; then
    set_env_value "DEEPSEEK_API_KEY" "$deepseek_key"
    success "DeepSeek API key saved."
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local env_file="${INSTALL_DIR}/.env"

  if [[ ! -f "$env_file" ]]; then
    echo "${key}=${value}" > "$env_file"
    return
  fi

  # Replace existing key or append
  if grep -q "^${key}=" "$env_file" 2>/dev/null; then
    # Use a different delimiter to avoid issues with API keys containing /
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$env_file"
    rm -f "${env_file}.bak"
  elif grep -q "^# *${key}=" "$env_file" 2>/dev/null; then
    # Uncomment and set
    sed -i.bak "s|^# *${key}=.*|${key}=${value}|" "$env_file"
    rm -f "${env_file}.bak"
  else
    echo "${key}=${value}" >> "$env_file"
  fi
}

# ─── Verification ────────────────────────────────────────────────────────────

verify_installation() {
  step "Step 6/6: Verifying installation"

  cd "$INSTALL_DIR"

  local checks_passed=0
  local checks_total=0

  # Check openclaw CLI
  ((checks_total++)) || true
  if [[ -f "node_modules/.bin/openclaw" ]]; then
    local oc_version
    oc_version="$(node_modules/.bin/openclaw --version 2>/dev/null || echo 'unknown')"
    success "OpenClaw CLI: ${oc_version}"
    ((checks_passed++)) || true
  else
    warn "OpenClaw CLI not found at node_modules/.bin/openclaw"
  fi

  # Check config files
  ((checks_total++)) || true
  if [[ -f "config/openclaw.json" ]]; then
    success "Config: openclaw.json present"
    ((checks_passed++)) || true
  else
    warn "Config: openclaw.json missing"
  fi

  ((checks_total++)) || true
  if [[ -f ".env" ]]; then
    success "Config: .env present"
    ((checks_passed++)) || true
  else
    warn "Config: .env missing"
  fi

  # Check UI build readiness
  if [[ "$SKIP_UI" != true ]]; then
    ((checks_total++)) || true
    if [[ -d "ui/node_modules" ]]; then
      success "UI: dependencies installed"
      ((checks_passed++)) || true
    else
      warn "UI: node_modules missing"
    fi
  fi

  echo ""
  if [[ $checks_passed -eq $checks_total ]]; then
    success "All checks passed (${checks_passed}/${checks_total})."
  else
    warn "${checks_passed}/${checks_total} checks passed."
  fi
}

# ─── Completion ──────────────────────────────────────────────────────────────

show_completion() {
  echo ""
  echo -e "${BOLD}${GREEN}━━━ Installation Complete! ━━━${RESET}"
  echo ""
  echo -e "  ${BOLD}Project location:${RESET}  $INSTALL_DIR"
  echo ""
  echo -e "  ${BOLD}To start Agent Factory:${RESET}"
  echo -e "    cd $INSTALL_DIR"
  echo -e "    npm start"
  echo ""
  echo -e "  ${BOLD}Services:${RESET}"
  echo -e "    Dashboard:  ${CYAN}http://localhost:3100${RESET}"
  echo -e "    Gateway:    ${CYAN}http://localhost:19100${RESET}"
  echo ""
  echo -e "  ${BOLD}Other commands:${RESET}"
  echo -e "    npm run ui       ${DIM}# Start Dashboard only${RESET}"
  echo -e "    npm run gateway  ${DIM}# Start Gateway only${RESET}"
  echo ""

  if [[ -f "$INSTALL_DIR/.env" ]] && ! grep -qE '^ANTHROPIC_API_KEY=sk-ant-[A-Za-z0-9]' "$INSTALL_DIR/.env"; then
    echo -e "  ${YELLOW}Note:${RESET} Don't forget to set your API key in .env:"
    echo -e "    ${DIM}echo 'ANTHROPIC_API_KEY=sk-ant-...' >> $INSTALL_DIR/.env${RESET}"
    echo ""
  fi

  echo -e "  ${DIM}Docs:  ${GITHUB_REPO}${RESET}"
  echo -e "  ${DIM}Issues: ${GITHUB_REPO}/issues${RESET}"
  echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BOLD}${CYAN}"
  echo "   _                    _     _____         _                   "
  echo "  / \\   __ _  ___ _ __ | |_  |  ___|_ _  ___| |_ ___  _ __ _   _"
  echo " / _ \\ / _\` |/ _ \\ '_ \\| __| | |_ / _\` |/ __| __/ _ \\| '__| | | |"
  echo "/ ___ \\ (_| |  __/ | | | |_  |  _| (_| | (__| || (_) | |  | |_| |"
  echo "/_/   \\_\\__, |\\___|_| |_|\\__| |_|  \\__,_|\\___|\\__\\___/|_|   \\__, |"
  echo "        |___/                                               |___/ "
  echo -e "${RESET}"
  echo -e "${DIM}  One Person + Agent Factory = A Complete AI Company${RESET}"
  echo ""

  parse_args "$@"

  check_dependencies
  acquire_project
  install_dependencies
  init_config
  configure_api_keys
  verify_installation
  show_completion
}

main "$@"
