#!/usr/bin/env bash
# Rebuilds the self-hosted Material Symbols subset. To use a new icon, add its name here (alphabetical order) and run this.
set -euo pipefail
cd "$(dirname "$0")/.."

ICONS="close,diamond,explore,hourglass_top,local_fire_department,login,logout,mail,military_tech,notifications,person,savings,swords"
# Google only serves woff2 to browser user agents.
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

FONT_URL=$(curl -fsS -A "$UA" "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@400,0&icon_names=$ICONS" | sed -nE 's/.*url\(([^)]+)\).*/\1/p')
curl -fsS "$FONT_URL" -o src/app/fonts/material-symbols-subset.woff2
