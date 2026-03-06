#!/bin/bash
set -e

APP_DIR="/home/ben/ewelink"

echo "=== Entering App Directory ==="
cd "$APP_DIR"

echo "=== Installing dependencies ==="
npm install

echo "=== Building Next.js APP ==="
npm run build

echo "=== Installing PM2 globally ==="
echo PAS123456789 | sudo -S npm install -g pm2

echo "=== Starting App with PM2 ==="
pm2 delete ewelink || true
pm2 start npm --name "ewelink" -- start

echo "=== Saving PM2 Process and setting up Startup Script ==="
pm2 save
echo PAS123456789 | sudo -S env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ben --hp /home/ben || true

echo "=== Done! Application is running & auto-start is configured. ==="
