import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Crown, LogIn, Play, Trash2, Users, Video } from 'lucide-react';
import { io } from 'socket.io-client';

const initialRoomState = {
  videoId: 'dQw4w9WgXcQ',
  playState: 'paused',
  currentTime: 0,
  updatedAt: Date.now()
};

const serverUrl = import.meta.env.VITE_SERVER_URL || '';

export default function App() {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState(new URLSearchParams(location.search).get('room') || '');
  const [activeRoom, setActiveRoom] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [roomState, setRoomState] = useState(initialRoomState);
  const [videoInput, setVideoInput] = useState('');
  const [notice, setNotice] = useState('');
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const playerRef = useRef(null);
  const isRemoteUpdate = useRef(false);
  const currentUserRef = useRef(null);
  const socketRef = useRef(null);
  const isHostRef = useRef(false);
  const isHost = currentUser?.role === 'Host';

  const inviteLink = useMemo(() => {
    if (!activeRoom) return '';
    return `${location.origin}${location.pathname}?room=${activeRoom}`;
  }, [activeRoom]);

  useEffect(() => {
    currentUserRef.current = currentUser;
    isHostRef.current = currentUser?.role === 'Host';
  }, [currentUser]);

  useEffect(() => {
    const nextSocket = io(serverUrl);
    socketRef.current = nextSocket;
    setSocket(nextSocket);

    nextSocket.on('sync_state', (state) => {
      setRoomState(state);
      applyStateToPlayer(state);
    });

    nextSocket.on('user_joined', ({ participants: nextParticipants }) => {
      setParticipants(nextParticipants);
    });

    nextSocket.on('user_left', ({ participants: nextParticipants }) => {
      setParticipants(nextParticipants);
    });

    nextSocket.on('role_assigned', ({ participants: nextParticipants }) => {
      setParticipants(nextParticipants);
      const freshUser = nextParticipants.find((user) => user.id === currentUserRef.current?.id);
      if (freshUser) setCurrentUser(freshUser);
    });

    nextSocket.on('participant_removed', ({ userId, participants: nextParticipants, message }) => {
      if (currentUserRef.current?.id === userId) {
        setNotice(message || 'You were removed from the room.');
        setActiveRoom('');
        setCurrentUser(null);
        setParticipants([]);
        setChat([]);
      } else {
        setParticipants(nextParticipants);
      }
    });

    nextSocket.on('chat_message', (message) => {
      setChat((items) => [...items.slice(-60), message]);
    });

    return () => {
      nextSocket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!activeRoom) return;
    loadYouTubeApi().then(() => {
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player('youtube-player', {
        videoId: roomState.videoId,
        playerVars: {
          rel: 0,
          modestbranding: 1
        },
        events: {
          onStateChange: (event) => {
            if (isRemoteUpdate.current || !isHostRef.current || !socketRef.current) return;
            if (event.data === window.YT.PlayerState.PLAYING) socketRef.current.emit('play');
            if (event.data === window.YT.PlayerState.PAUSED) {
              socketRef.current.emit('seek', { time: playerRef.current?.getCurrentTime() || 0 });
              socketRef.current.emit('pause');
            }
          }
        }
      });
    });
  }, [activeRoom, roomState.videoId]);

  async function createRoom(event) {
    event.preventDefault();
    setNotice('');
    const response = await fetch(`${serverUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username || 'Host' })
    });
    const data = await response.json();
    setRoomCode(data.roomId);
    joinRoom(data.roomId);
  }

  function joinExistingRoom(event) {
    event.preventDefault();
    joinRoom(roomCode);
  }

  function joinRoom(roomId) {
    if (!socket || !roomId.trim()) return;
    socket.emit('join_room', { roomId: roomId.trim(), username: username || 'Guest' }, (response) => {
      if (!response.ok) {
        setNotice(response.message || 'Could not join that room.');
        return;
      }

      setActiveRoom(roomId.trim());
      setCurrentUser(response.currentUser);
      setParticipants(response.participants);
      setRoomState(response.state);
      history.replaceState(null, '', `?room=${roomId.trim()}`);
      applyStateToPlayer(response.state);
    });
  }

  function applyStateToPlayer(state) {
    const player = playerRef.current;
    if (!player) return;

    isRemoteUpdate.current = true;
    const currentVideoId = player.getVideoData()?.video_id;
    if (currentVideoId !== state.videoId) {
      player.cueVideoById(state.videoId);
    }

    const drift = Math.abs((player.getCurrentTime() || 0) - state.currentTime);
    if (drift > 1.25) player.seekTo(state.currentTime, true);
    if (state.playState === 'playing') player.playVideo();
    if (state.playState === 'paused') player.pauseVideo();
    window.setTimeout(() => {
      isRemoteUpdate.current = false;
    }, 600);
  }

  function emitControl(eventName) {
    socket?.emit(eventName, {}, handleAck);
  }

  function seekBy(seconds) {
    const nextTime = Math.max(0, (playerRef.current?.getCurrentTime() || roomState.currentTime) + seconds);
    socket?.emit('seek', { time: nextTime }, handleAck);
  }

  function changeVideo(event) {
    event.preventDefault();
    socket?.emit('change_video', { videoId: videoInput }, (response) => {
      handleAck(response);
      if (response.ok) setVideoInput('');
    });
  }

  function assignRole(userId, role) {
    socket?.emit('assign_role', { userId, role }, handleAck);
  }

  function removeParticipant(userId) {
    socket?.emit('remove_participant', { userId }, handleAck);
  }

  function sendChat(event) {
    event.preventDefault();
    socket?.emit('chat_message', { message: chatInput }, (response) => {
      if (response.ok) setChatInput('');
    });
  }

  function handleAck(response) {
    if (response && !response.ok) setNotice(response.message || 'Action was rejected.');
  }

  return (
    <main className="app">
      <section className="topbar">
        <div>
          <p className="eyebrow"></p>
          <h1>YouTube Watch Party</h1>
        </div>
        {currentUser && (
          <div className="identity">
            <span>{currentUser.username}</span>
            <strong>{currentUser.role}</strong>
          </div>
        )}
      </section>

      {!activeRoom ? (
        <section className="lobby">
          <form onSubmit={createRoom} className="panel">
            <Crown aria-hidden="true" />
            <h2>Create room</h2>
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your name" />
            <button type="submit">
              <Video size={18} /> Start party
            </button>
          </form>

          <form onSubmit={joinExistingRoom} className="panel">
            <LogIn aria-hidden="true" />
            <h2>Join room</h2>
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your name" />
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="Room code" />
            <button type="submit">
              <Users size={18} /> Join
            </button>
          </form>
        </section>
      ) : (
        <section className="room">
          <div className="watch">
            <div className="player-shell">
              <div id="youtube-player" />
            </div>

            <div className="controls">
              <button disabled={!isHost} onClick={() => emitControl('play')} aria-label="Play">
                <Play size={18} /> Play
              </button>
              <button disabled={!isHost} onClick={() => emitControl('pause')}>Pause</button>
              <button disabled={!isHost} onClick={() => seekBy(-10)}>-10s</button>
              <button disabled={!isHost} onClick={() => seekBy(10)}>+10s</button>
            </div>

            <form className="video-form" onSubmit={changeVideo}>
              <input
                disabled={!isHost}
                value={videoInput}
                onChange={(event) => setVideoInput(event.target.value)}
                placeholder="Paste YouTube URL or video ID"
              />
              <button disabled={!isHost} type="submit">Change video</button>
            </form>

            <div className="share">
              <span>Room {activeRoom}</span>
              <button type="button" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                <Copy size={16} /> Copy invite
              </button>
            </div>
          </div>

          <aside className="sidebar">
            <section className="people">
              <h2>Participants</h2>
              {participants.map((participant) => (
                <div className="person" key={participant.id}>
                  <div>
                    <strong>{participant.username}</strong>
                    <span>{participant.role}</span>
                  </div>
                  {isHost && participant.id !== currentUser?.id && (
                    <div className="person-actions">
                      <button title="Transfer host" onClick={() => assignRole(participant.id, 'Host')}>
                        <Crown size={15} />
                      </button>
                      <button title="Remove" onClick={() => removeParticipant(participant.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>

            <section className="chat">
              <h2>Chat</h2>
              <div className="messages">
                {chat.map((message) => (
                  <p key={message.id}>
                    <strong>{message.username}</strong>
                    {message.message}
                  </p>
                ))}
              </div>
              <form onSubmit={sendChat}>
                <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Message" />
                <button type="submit">Send</button>
              </form>
            </section>
          </aside>
        </section>
      )}

      {notice && <p className="notice">{notice}</p>}
    </main>
  );
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    window.onYouTubeIframeAPIReady = () => resolve();
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    }
  });
}
