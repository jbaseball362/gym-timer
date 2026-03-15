#!/bin/bash
# Gym Timer — launch script
# Starts the Node.js server and opens the display in a browser (fullscreen, audio unlocked)
# Supports Linux and macOS with Chrome, Chromium, Firefox, and Edge

cd "$(dirname "$0")"

PORT="${PORT:-3000}"
URL="http://localhost:$PORT"

# Detect OS
OS="$(uname -s)"

# Ensure the server is stopped on exit or interrupt
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
  fi
  echo ""
  echo "Gym Timer stopped."
}
trap cleanup EXIT INT TERM

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is not installed."
  echo "Download it at https://nodejs.org/"
  exit 1
fi

# Check for node_modules
if [ ! -d "node_modules" ]; then
  echo "Error: Dependencies not installed. Run 'npm install' first."
  exit 1
fi

# Check if port is already in use
if command -v lsof &> /dev/null; then
  if lsof -iTCP:"$PORT" -sTCP:LISTEN &> /dev/null; then
    echo "Error: Port $PORT is already in use."
    echo "Either stop the other process or use a different port: PORT=3001 ./start-gym-timer.sh"
    exit 1
  fi
elif command -v ss &> /dev/null; then
  if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    echo "Error: Port $PORT is already in use."
    echo "Either stop the other process or use a different port: PORT=3001 ./start-gym-timer.sh"
    exit 1
  fi
fi

# Start the server in the background
npm start &
SERVER_PID=$!

# Wait for the server to be ready
echo "Starting Gym Timer server..."
for i in {1..10}; do
  if curl -s "$URL" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -s "$URL" > /dev/null 2>&1; then
  echo "Error: Server failed to start on port $PORT"
  exit 1
fi

# Find an available browser
BROWSER=""
BROWSER_TYPE=""

find_browser() {
  case "$OS" in
    Linux)
      if command -v google-chrome &> /dev/null; then
        BROWSER="google-chrome"; BROWSER_TYPE="chrome"
      elif command -v chromium-browser &> /dev/null; then
        BROWSER="chromium-browser"; BROWSER_TYPE="chrome"
      elif command -v chromium &> /dev/null; then
        BROWSER="chromium"; BROWSER_TYPE="chrome"
      elif command -v microsoft-edge &> /dev/null; then
        BROWSER="microsoft-edge"; BROWSER_TYPE="chrome"
      elif command -v firefox &> /dev/null; then
        BROWSER="firefox"; BROWSER_TYPE="firefox"
      fi
      ;;
    Darwin)
      if [ -d "/Applications/Google Chrome.app" ]; then
        BROWSER="Google Chrome"; BROWSER_TYPE="chrome"
      elif [ -d "/Applications/Microsoft Edge.app" ]; then
        BROWSER="Microsoft Edge"; BROWSER_TYPE="chrome"
      elif [ -d "/Applications/Firefox.app" ]; then
        BROWSER="Firefox"; BROWSER_TYPE="firefox"
      elif [ -d "/Applications/Chromium.app" ]; then
        BROWSER="Chromium"; BROWSER_TYPE="chrome"
      fi
      ;;
  esac
}

find_browser

if [ -z "$BROWSER" ]; then
  echo "No supported browser found. Open $URL manually."
  echo "Supported: Chrome, Chromium, Edge, Firefox"
  wait $SERVER_PID
  exit 1
fi

# Print status
echo ""
echo "  Gym Timer is running!"
echo ""
echo "  Display:    $URL"
echo "  Controller: $URL/control"
echo "  Browser:    $BROWSER"
if [ "$BROWSER_TYPE" = "firefox" ]; then
  echo ""
  echo "  Note: Firefox does not support automatic audio unlock."
  echo "  You will need to tap the screen once to enable sound."
  echo "  For the best experience, use Chrome or Edge."
fi
echo ""

# Launch the browser with appropriate flags
case "$OS" in
  Linux)
    if [ "$BROWSER_TYPE" = "chrome" ]; then
      $BROWSER --app="$URL" --start-maximized --autoplay-policy=no-user-gesture-required
    else
      $BROWSER --new-window "$URL"
    fi
    ;;
  Darwin)
    if [ "$BROWSER_TYPE" = "chrome" ]; then
      open -a "$BROWSER" --args --app="$URL" --start-maximized --autoplay-policy=no-user-gesture-required
    else
      open -a "$BROWSER" "$URL"
    fi
    ;;
esac
