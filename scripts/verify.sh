#!/usr/bin/env bash
# 全量验证入口：构建浏览器半区、契约检查、单测、两套 e2e、AgentMap lint。
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
node scripts/build-client.mjs
node scripts/check.mjs
node --test test/*.test.mjs
node e2e/run.mjs
python3 tools/agentmap_lint.py --report
