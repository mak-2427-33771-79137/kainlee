#!/bin/bash
# Kainlee iOS app — one-step setup on a Mac.
# Run:  bash ~/Documents/kainlee/mobile/setup-mac.sh
# Optional: add your Apple Team ID so signing is already set:  bash .../setup-mac.sh ABCDE12345

cd "$(dirname "$0")" || exit 1
TEAM_ID="${1:-}"
green() { printf "\033[32m✔ %s\033[0m\n" "$1"; }
red()   { printf "\033[31m✘ %s\033[0m\n" "$1"; }
step()  { printf "\n\033[1m%s\033[0m\n" "$1"; }

step "1/5  Checking Xcode"
if [ ! -d /Applications/Xcode.app ]; then
  red "Xcode is not in Applications. Install it from the Mac App Store, open it once, then run this again."; exit 1
fi
if ! xcode-select -p 2>/dev/null | grep -q "Xcode.app"; then
  echo "Pointing the command-line tools at Xcode (your Mac password is needed; it will not show as you type)…"
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer || { red "Could not select Xcode."; exit 1; }
fi
if ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
  echo "Finishing Xcode's first-time setup (password may be needed)…"
  sudo xcodebuild -runFirstLaunch || { red "Open Xcode once, accept the licence, then run this again."; exit 1; }
fi
green "$(xcodebuild -version | head -1)"

step "2/5  Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  red "Node.js is not installed. Install the LTS version from https://nodejs.org, quit Terminal (⌘Q), reopen it, and run this again."; exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  red "Node.js $(node -v) is too old. Install the LTS version from https://nodejs.org, then run this again."; exit 1
fi
green "Node.js $(node -v)"

step "3/5  Installing the app's parts (1–2 minutes)"
rm -rf node_modules
if ! npm install --no-audit --no-fund; then
  red "npm install failed. Send a screenshot of the lines above."; exit 1
fi
green "Installed"

step "4/5  Preparing the Xcode project"
if ! npx cap sync ios; then
  red "Preparing the project failed. Send a screenshot of the lines above."; exit 1
fi
if [ -n "$TEAM_ID" ]; then
  if [[ "$TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]; then
    PBX=ios/App/App.xcodeproj/project.pbxproj
    if grep -q "DEVELOPMENT_TEAM" "$PBX"; then
      sed -i '' "s/DEVELOPMENT_TEAM = [A-Z0-9]*;/DEVELOPMENT_TEAM = $TEAM_ID;/g" "$PBX"
    else
      sed -i '' "s/CODE_SIGN_STYLE = Automatic;/CODE_SIGN_STYLE = Automatic;\\
				DEVELOPMENT_TEAM = $TEAM_ID;/" "$PBX"
    fi
    green "Signing team set to $TEAM_ID"
  else
    red "\"$TEAM_ID\" doesn't look like a Team ID (10 letters/numbers). Choose your Team in Xcode instead."
  fi
fi
green "Project ready"

step "5/5  Opening Xcode"
npx cap open ios
green "Done. In Xcode: pick your iPhone at the top and press ▶ Run."
