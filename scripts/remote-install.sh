#!/usr/bin/env bash
set -euo pipefail

# MSTRY Remote Installer - All-in-One
# Usage: curl -fsSL https://raw.githubusercontent.com/jabaruben/MSTRY/main/scripts/remote-install.sh | bash
# Or with specific branch: curl -fsSL https://raw.githubusercontent.com/jabaruben/MSTRY/<branch>/scripts/remote-install.sh | bash

REPO_URL="${REPO_URL:-https://github.com/jabaruben/MSTRY}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/mstry}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
APP_NAME="MSTRY"

info() { echo "==> $*"; }
error() { echo "ERROR: $*" >&2; exit 1; }

detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif grep -qEi "(Microsoft|WSL)" /proc/version 2>/dev/null || grep -qEi "microsoft" /proc/sys/kernel/osrelease 2>/dev/null; then
        echo "wsl"
    elif [[ -f /etc/os-release ]]; then
        . /etc/os-release
        if [[ "$ID" == "ubuntu" || "$ID" == "debian" || "$ID" == "fedora" ]]; then
            echo "linux"
        else
            echo "linux"
        fi
    else
        echo "linux"
    fi
}

check_command() {
    if ! command -v "$1" &>/dev/null; then
        MISSING_DEPS+=("$1")
        return 1
    fi
    return 0
}

install_node() {
    info "Installing Node.js..."
    local node_installed=false

    if command -v nvm &>/dev/null; then
        info "Using nvm to install Node.js 20..."
        export NVM_DIR="$HOME/.nvm"
        source "$NVM_DIR/nvm.sh" 2>/dev/null || source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
        nvm install 20 || nvm install node
        nvm use 20 || nvm use node
        nvm alias default 20 || nvm alias default node
        node_installed=true
    elif command -v fnm &>/dev/null; then
        info "Using fnm to install Node.js 20..."
        fnm install 20 || fnm install latest
        fnm use 20 || fnm use latest
        fnm default 20 || fnm default latest
        node_installed=true
    else
        if [[ "$OS" == "macos" ]]; then
            if command -v brew &>/dev/null; then
                info "Installing Node.js via Homebrew..."
                brew install node@20
                node_installed=true
            fi
        else
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - || true
            sudo apt install -y nodejs || sudo apt-get install -y nodejs || true
            node_installed=true
        fi
    fi

    if ! $node_installed; then
        info "Could not install Node.js automatically."
        info "Please install Node.js 18+ from https://nodejs.org and run this script again."
        exit 1
    fi
}

install_tmux() {
    info "Installing tmux..."
    if [[ "$OS" == "macos" ]]; then
        if command -v brew &>/dev/null; then
            brew install tmux
        else
            error "Homebrew not found. Install it from https://brew.sh or install tmux manually."
        fi
    else
        sudo apt update || true
        sudo apt install -y tmux
    fi
}

install_git() {
    info "Installing git..."
    if [[ "$OS" == "macos" ]]; then
        if command -v brew &>/dev/null; then
            brew install git
        fi
    else
        sudo apt install -y git
    fi
}

install_dependencies() {
    local missing=()
    check_command node || missing+=("node")
    check_command npm || missing+=("npm")
    check_command git || missing+=("git")
    check_command tmux || missing+=("tmux")

    if [[ ${#missing[@]} -gt 0 ]]; then
        info "Missing dependencies: ${missing[*]}"
        for dep in "${missing[@]}"; do
            case "$dep" in
                node|npm) install_node ;;
                git) install_git ;;
                tmux) install_tmux ;;
            esac
        done
    fi

    local node_version
    node_version=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1) || node_version="0"
    if [[ "$node_version" -lt 18 ]]; then
        info "Node.js version is too old ($node_version). Installing Node.js 20..."
        install_node
    fi
}

main() {
    info "MSTRY Installer"
    info "Repository: $REPO_URL"
    info "Branch: $BRANCH"

    OS=$(detect_os)
    info "Detected OS: $OS"

    install_dependencies

    info "Cloning repository..."
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"

    cd "$INSTALL_DIR"

    info "Installing npm dependencies..."
    npm install

    info "Building application..."
    npm run build

    info "Creating binary directory..."
    mkdir -p "$BIN_DIR"

    info "Installing CLI..."
    local script_path="$INSTALL_DIR/resources/cli/mstry.sh"
    if [[ -f "$script_path" ]]; then
        chmod +x "$script_path"
        if [[ "$OS" == "macos" ]]; then
            sudo ln -sf "$script_path" "/usr/local/bin/mstry"
        else
            ln -sf "$script_path" "$BIN_DIR/mstry"
            chmod +x "$BIN_DIR/mstry"
        fi
        info "CLI installed to: $([[ "$OS" == "macos" ]] && echo '/usr/local/bin/mstry' || echo "$BIN_DIR/mstry")"
    else
        info "Note: CLI script not found at $script_path"
    fi

    info ""
    info "========================================"
    info "MSTRY installed successfully!"
    info "========================================"
    info ""
    info "To run the app:"
    if [[ "$OS" == "macos" ]]; then
        info "  open -a $APP_NAME"
    else
        if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
            info "  export PATH=\"\$PATH:$BIN_DIR\""
            info "  # Add the above line to your ~/.bashrc or ~/.zshrc"
            info ""
        fi
        info "  mstry"
        info ""
        info "Or run directly:"
        info "  node $INSTALL_DIR/out/main/index.js"
    fi
}

main "$@"