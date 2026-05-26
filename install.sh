#!/usr/bin/env bash
#
# mlens installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/97-web3/mlens-cli/main/install.sh | bash
#
# Environment variables:
#   MLENS_INSTALL_DIR   Directory to extract the binary tree into. Default: $HOME/.mlens
#   MLENS_BIN_DIR       Directory to place the `mlens` wrapper in. Default: /usr/local/bin
#                       (falls back to $HOME/.local/bin if /usr/local/bin is not writable)
#   MLENS_VERSION       Release tag to install (e.g. v0.1.0). Default: latest

set -euo pipefail

REPO="97-web3/mlens-cli"
INSTALL_DIR="${MLENS_INSTALL_DIR:-$HOME/.mlens}"
VERSION="${MLENS_VERSION:-latest}"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
err()   { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; }

# ---------- detect platform ----------
uname_s="$(uname -s)"
uname_m="$(uname -m)"

case "$uname_s" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    MINGW*|MSYS*|CYGWIN*)
        err "Windows detected. Please download mlens-windows-*.zip from:"
        err "  https://github.com/${REPO}/releases/latest"
        exit 1
        ;;
    *)
        err "Unsupported operating system: $uname_s"
        exit 1
        ;;
esac

case "$uname_m" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *)
        err "Unsupported architecture: $uname_m"
        exit 1
        ;;
esac

platform="${os}-${arch}"
info "Detected platform: ${platform}"

# ---------- resolve download URL ----------
if [ "$VERSION" = "latest" ]; then
    asset_url="https://github.com/${REPO}/releases/latest/download/mlens-${platform}.tar.gz"
else
    asset_url="https://github.com/${REPO}/releases/download/${VERSION}/mlens-${platform}.tar.gz"
fi

# ---------- download + extract ----------
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

archive="$tmpdir/mlens-${platform}.tar.gz"
info "Downloading: $asset_url"
if ! curl -fsSL --retry 3 -o "$archive" "$asset_url"; then
    err "Failed to download mlens binary."
    err "Check that a release exists at:"
    err "  https://github.com/${REPO}/releases"
    exit 1
fi

info "Extracting to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
# tarball wrapper directory is `mlens/`. Strip it so files land in INSTALL_DIR directly.
tar -xzf "$archive" -C "$INSTALL_DIR" --strip-components=1

# Make sure the binary is executable
chmod +x "$INSTALL_DIR/mlens"

# ---------- install wrapper to PATH ----------
# Wrapper is required (not a symlink) so the binary still sees its sibling
# theme/, assets/, export-html/, docs/, examples/, node_modules/ files.
wrapper_content="#!/usr/bin/env bash
exec \"${INSTALL_DIR}/mlens\" \"\$@\"
"

write_wrapper() {
    local target_dir="$1"
    local target="$target_dir/mlens"
    printf '%s' "$wrapper_content" > "$target"
    chmod +x "$target"
    echo "$target"
}

bin_dir="${MLENS_BIN_DIR:-}"
if [ -z "$bin_dir" ]; then
    if [ -w "/usr/local/bin" ]; then
        bin_dir="/usr/local/bin"
    else
        bin_dir="$HOME/.local/bin"
        mkdir -p "$bin_dir"
    fi
fi

if [ ! -w "$bin_dir" ]; then
    err "Cannot write to $bin_dir"
    err "Set MLENS_BIN_DIR to a writable directory and re-run, or"
    err "manually create a wrapper that runs: $INSTALL_DIR/mlens"
    exit 1
fi

wrapper_path="$(write_wrapper "$bin_dir")"
info "Installed wrapper: $wrapper_path"

# ---------- verify ----------
if command -v mlens >/dev/null 2>&1; then
    info "mlens is on PATH:"
    command -v mlens
else
    warn "mlens is not on your PATH yet."
    warn "Add this line to your shell profile (e.g. ~/.bashrc, ~/.zshrc):"
    warn "  export PATH=\"$bin_dir:\$PATH\""
fi

echo
info "Done. Run \`mlens --help\` to get started."
