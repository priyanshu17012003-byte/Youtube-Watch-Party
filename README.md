# 🎬 Watch Party App

A real-time synchronized video-watching platform built with the MERN stack. Create a room, invite friends, and watch YouTube videos together — with playback perfectly synced across every connected client.

---

## ✨ Features

- 🔗 **Create & join rooms** — spin up a private watch room and share the link
- 🔄 **Real-time playback sync** — play, pause, and seek stay in sync for every participant
- 👑 **Host & participant roles** — the host controls the room; participants watch along
- 🔒 **Backend permission checks** — only the host can play, pause, seek, or change the video
- 🔁 **Host transfer & kick controls** — hand off host duties or remove a participant
- 💬 **Live room chat** — chat with everyone in the room in real time

---

## 🛠️ Tech Stack

| Layer      | Technology                          |
|------------|--------------------------------------|
| Frontend   | React (JSX), Vite                    |
| Backend    | Node.js, Express                     |
| Real-time  | Socket.IO (WebSockets)                |
| Video      | YouTube IFrame Player API             |

---

## 📁 Folder Structure

```text
watch-party-app/
├── backend/     # Express + Socket.IO server
└── frontend/    # React (JSX) + Vite app
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm

### Installation & Local Setup

Clone the repo, then from the project root (`watch-party-app/`):

```bash
npm install
npm run install:all
npm run dev
```

This installs dependencies for both `frontend` and `backend`, and starts both dev servers concurrently.

| Service   | URL                          |
|-----------|------------------------------|
| Frontend  | http://localhost:5173        |
| Backend   | http://localhost:4000        |

### Running the Backend on a Different Port

If port `4000` is already in use:

```bash
cd backend

# macOS / Linux
PORT=4174 npm start

# Windows (cmd)
set PORT=4174 && npm start
```

> Remember to update the frontend's API/socket URL to match if you change the backend port.

---

## ☁️ Deployment

Since the backend relies on persistent WebSocket connections, host it on a platform with native WebSocket support:

- **Backend:** [Render](https://render.com/) or [Railway](https://railway.app/)
- **Frontend:** [Vercel](https://vercel.com/), [Netlify](https://www.netlify.com/), Render, or Railway

If frontend and backend are deployed separately, set the frontend's environment variable for the API/socket URL to point to your deployed backend (e.g. `VITE_SOCKET_URL=https://your-backend-url.com`).

---

## 🗺️ Roadmap Ideas

- [ ] Support for additional video sources beyond YouTube
- [ ] Persistent room history
- [ ] Reactions/emojis during playback

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
