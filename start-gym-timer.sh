#!/bin/bash
# Gym Timer — launch script
# Starts the Node.js server and opens the display in Chromium (fullscreen, audio unlocked)

cd "$(dirname "$0")"

# Start the server in the background
npm start &
SERVER_PID=$!

# Wait for the server to be ready
echo "Starting Gym Timer server..."
for i in {1..10}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Opening display in Chromium..."

# Try chromium-browser first, fall back to google-chrome
if command -v chromium-browser &> /dev/null; then
  BROWSER="chromium-browser"
elif command -v google-chrome &> /dev/null; then
  BROWSER="google-chrome"
elif command -v chromium &> /dev/null; then
  BROWSER="chromium"
else
  echo "No Chromium/Chrome found. Open http://localhost:3000 manually."
  wait $SERVER_PID
  exit 1
fi

$BROWSER --app=http://localhost:3000 --start-maximized --autoplay-policy=no-user-gesture-required

# When the browser closes, stop the server
kill $SERVER_PID 2>/dev/null
