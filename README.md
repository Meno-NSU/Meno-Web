# Meno-Web

This is the frontend project for Meno. It is built using React and Vite.

## Development Setup

To run the project locally for development:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

## Production Deployment

This project includes a script to easily build and run the application in the background on your server using PM2 (via `npx`). The application will be served on port `9012`.

1. Make the script executable (if it isn't already):
   ```bash
   chmod +x start.sh
   ```

2. Run the start script:
   ```bash
   ./start.sh
   ```

### Managing the Background Process

The server is managed by PM2, providing process management features. You can use the following commands to manage the server:

- **Check status**: `npx pm2 status`
- **View logs**: `npx pm2 logs meno-web`
- **Stop application**: `npx pm2 stop meno-web`
- **Restart application**: `npx pm2 restart meno-web`
- **Delete application from PM2**: `npx pm2 delete meno-web`

## Code Validation (CI)

This project uses a GitHub Actions CI workflow to validate the codebase. On every push or pull request to the `main` or `master` branches, the CI pipeline automatically:
- Installs dependencies
- Lints the code using ESLint (`npm run lint`)
- Builds the production bundle (`npm run build`)
