#!/bin/bash

# start.sh - Script to start Meno-Web in the background on port 9012

echo "Starting Meno-Web deployment process..."

# 1. Install dependencies
echo "Installing dependencies..."
npm install

# 2. Build the project
echo "Building the project..."
npm run build

# 3. Start the application in the background using PM2
# Environment variables PORT and BACKEND_URL are read from .env by server.js
echo "Starting the application using pm2..."
npx pm2 start server.js --name "meno-web"

echo "Deployment complete! Meno-Web should be running on http://localhost:9012"
echo "To check the status, run: npx pm2 status"
echo "To view logs, run: npx pm2 logs meno-web"
echo "To stop the app, run: npx pm2 stop meno-web"
