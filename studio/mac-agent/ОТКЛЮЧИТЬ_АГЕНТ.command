#!/bin/zsh
set -euo pipefail
LAUNCH="$HOME/Library/LaunchAgents/studio.vyron.ai.macagent.plist"
launchctl bootout "gui/$(id -u)" "$LAUNCH" >/dev/null 2>&1 || true
launchctl disable "gui/$(id -u)/studio.vyron.ai.macagent" >/dev/null 2>&1 || true
rm -f "$LAUNCH"
echo "Автозапуск Mac Agent остановлен. Проекты и локальные токены оставлены для сохранности."
read -r "?Нажми Enter, чтобы закрыть окно: " _
