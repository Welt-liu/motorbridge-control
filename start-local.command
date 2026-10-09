#!/bin/zsh
set -eu
task_app_dir="$(cd "$(dirname "$0")" && pwd)"
task_node_bin="$(command -v node || true)"
if [[ -z "$task_node_bin" ]] || ! "$task_node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  task_node_bin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$task_node_bin" ]]; then
  print '请安装 Node.js 24，再按照 README.md 安装依赖和构建。'
  exit 1
fi
cd "$task_app_dir"
exec "$task_node_bin" src/server.js --production
