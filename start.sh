#!/bin/bash

# start.sh - Script to start Meno-Web in the background on port 9007

echo "Starting Meno-Web deployment process..."

# 1. Install dependencies
echo "Installing dependencies..."
npm install

# 2. Build the project
echo "Building the project..."
npm run build

# 3. Start the application in the background using PM2
# We use npx to run PM2 without requiring a global installation
echo "Starting the application on port 9007 using pm2..."
npx pm2 start npm --name "meno-web" -- run start:prod

echo "Deployment complete! Meno-Web should be running on http://localhost:9007"
echo "To check the status, run: npx pm2 status"
echo "To view logs, run: npx pm2 logs meno-web"
echo "To stop the app, run: npx pm2 stop meno-web"
