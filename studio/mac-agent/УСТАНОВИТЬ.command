#!/bin/zsh
set -euo pipefail
BASE="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Library/Application Support/VYRON AI STUDIO"
AGENT="$APP/agent.py"
LAUNCH="$HOME/Library/LaunchAgents/studio.vyron.ai.macagent.plist"
echo "VYRON AI STUDIO — установка приватного Mac-агента"
if [[ "$(uname -s)" != "Darwin" ]]; then echo "Только macOS"; exit 1; fi
if ! command -v python3 >/dev/null 2>&1; then echo "Не найден python3. Установи Python 3 и повтори."; exit 1; fi
mkdir -p "$APP" "$HOME/Library/LaunchAgents"
chmod 700 "$APP"
install -m 700 "$BASE/agent.py" "$AGENT"
echo ""
echo "Авторизация Supabase (только для агента; не влияет на VYRON и YouTube):"
python3 "$AGENT" login
echo ""
echo "Для скачивания TTS из Lumean требуется ключ с orders.read + orders.download."
read -r "?Добавить Lumean ключ сейчас? (y/N): " answer
if [[ "$answer" == "y" || "$answer" == "Y" ]]; then python3 "$AGENT" set-lumean; fi
/usr/bin/python3 - "$AGENT" "$LAUNCH" "$APP" <<'PY'
import plistlib,sys
from pathlib import Path
agent, target, app = map(Path, sys.argv[1:])
with target.open("wb") as file:
    plistlib.dump({
      "Label":"studio.vyron.ai.macagent",
      "ProgramArguments":["/usr/bin/env","python3",str(agent),"daemon"],
      "RunAtLoad":True,"KeepAlive":True,
      "StandardOutPath":str(app/"agent-out.log"),
      "StandardErrorPath":str(app/"agent-errors.log"),
      "WorkingDirectory":str(app),
      "ProcessType":"Background",
    }, file)
PY
chmod 600 "$LAUNCH"
launchctl bootout "gui/$(id -u)" "$LAUNCH" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$LAUNCH"
launchctl enable "gui/$(id -u)/studio.vyron.ai.macagent"
echo ""
echo "ГОТОВО: Mac Agent автозапускается при входе в macOS."
echo "Журналы: $APP/agent-errors.log"
echo "Список каналов из VYRON будет считан только из ~/Documents/VYRON/State/mappings.json"
echo "Для рендера нужна установленная отдельная ENDLUME сборка с Studio Bridge."
read -r "?Нажми Enter, чтобы закрыть окно: " _
