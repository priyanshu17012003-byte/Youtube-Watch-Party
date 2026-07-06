# Watch Party App

This is the separated version of the YouTube Watch Party project.

## Folder Structure

```text
watch party app/
  backend/    Express + Socket.IO server
  frontend/   React JSX + Vite app
```

## Run Locally

From inside `watch party app`:

```bash
npm install
npm run install:all
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:4000
```

If port `4000` is already busy, run the backend with another port:

```bash
cd backend
set PORT=4174
npm start
```

## What Is Included

- Create and join watch rooms
- Real-time YouTube playback sync
- Host and Participant roles
- Backend permission checks
- Only Host can play, pause, seek, and change video
- Host can transfer host and remove users
- Basic room chat

## Deployment Note

For deployment, host the backend on Render or Railway because it needs WebSockets. Host the frontend on Vercel, Netlify, Render, or Railway. Set the frontend API/socket URL to the deployed backend if both are hosted separately.
