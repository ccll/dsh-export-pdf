#!/usr/bin/env bash
# 全量验证入口：先校验已提交客户端 bundle，再重建并确认无漂移，然后跑单测、两套 e2e 与 AgentMap lint。
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
node scripts/check.mjs
node scripts/build-client.mjs
git diff --exit-code -- .dsh-plugin/client.js
node --test test/*.test.mjs
node e2e/run.mjs
python3 tools/agentmap_lint.py --report
