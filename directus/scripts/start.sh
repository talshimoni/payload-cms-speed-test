#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
mkdir -p "$project_dir/uploads" "$project_dir/extensions"

node_major="$(node -p "process.versions.node.split('.')[0]")"
isolated_vm_binary="$project_dir/node_modules/isolated-vm/out/isolated_vm.node"

start_directus() {
  if [ ! -f "$isolated_vm_binary" ]; then
    echo "Missing native module: node_modules/isolated-vm/out/isolated_vm.node"
    echo "Install Directus dependencies under Node 22, then retry:"
    echo "  fnm use 22"
    echo "  yarn --cwd ./directus install"
    echo "  yarn directus:run"
    exit 1
  fi

  echo "Running Directus migrations..."
  npx directus database migrate:latest

  exec npx directus start
}

if [ "$node_major" = "22" ]; then
  start_directus
fi

if command -v fnm >/dev/null 2>&1; then
  if fnm list | grep -q "v22"; then
    echo "Directus requires Node 22 (isolated-vm is incompatible with Node ${node_major}). Running via fnm..."
    exec fnm exec --using=22 bash ./scripts/start.sh
  fi
fi

echo "Directus requires Node 22 because isolated-vm@5.0.3 fails on Node ${node_major}."
echo "Install/use Node 22 and reinstall Directus dependencies:"
echo "  fnm install 22"
echo "  fnm use 22"
echo "  yarn --cwd ./directus install"
echo "  yarn directus:run"
exit 1
