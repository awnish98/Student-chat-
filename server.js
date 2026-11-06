const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e6
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const MAX_ROOM_USERS = 30;

app.disable("x-powered-by");
app.use((req, res, next) => {
  if (/^\/(server\.js|package\.json|package-lock\.json|\.env)(\/|$)/i.test(req.path)) return res.sendStatus(404);
  next();
});
app.get("/health", (_req, res) => {
  res.json({ status: "ok", app: "AWNISH CHAT" });
});
app.use(express.static(__dirname, { dotfiles: "deny", index: false }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function sendMembers(room) {
  const members = rooms.get(room);
  if (!members) return;
  io.to(room).emit("members", [...members.entries()].map(([id, name]) => ({ id, name })));
}

io.on("connection", (socket) => {
  socket.on("join-room", (data, callback = () => {}) => {
    const name = clean(data?.name, 24);
    const room = clean(data?.room, 16).toUpperCase();

    if (name.length < 2 || !/^[A-Z0-9-]{4,16}$/.test(room)) {
      return callback({ ok: false, error: "नाम और 4-16 अक्षर का Room Code लिखें।" });
    }

    if (!rooms.has(room)) rooms.set(room, new Map());
    const members = rooms.get(room);

    if (members.size >= MAX_ROOM_USERS && !members.has(socket.id)) {
      return callback({ ok: false, error: "यह रूम भर चुका है।" });
    }

    if (socket.data.room) {
      const oldRoom = socket.data.room;
      socket.leave(oldRoom);
      rooms.get(oldRoom)?.delete(socket.id);
      sendMembers(oldRoom);
      if (rooms.get(oldRoom)?.size === 0) rooms.delete(oldRoom);
    }

    socket.data.name = name;
    socket.data.room = room;
    socket.join(room);
    members.set(socket.id, name);
    sendMembers(room);
    socket.to(room).emit("system-message", `${name} रूम में आए।`);
    callback({ ok: true, room, id: socket.id });
  });

  socket.on("chat-message", (raw) => {
    const room = socket.data.room;
    const message = clean(raw, 600);
    if (!room || !message) return;
    io.to(room).emit("chat-message", {
      id: `${Date.now()}-${socket.id}`,
      name: socket.data.name,
      message,
      time: new Date().toISOString()
    });
  });

  // WebRTC signalling relay. Media itself is exchanged peer-to-peer.
  socket.on("call-signal", (data) => {
    const room = socket.data.room;
    if (!room || !data || typeof data.to !== "string") return;
    if (!rooms.get(room)?.has(data.to)) return;
    io.to(data.to).emit("call-signal", {
      from: socket.id,
      name: socket.data.name,
      description: data.description,
      candidate: data.candidate,
      kind: data.kind
    });
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (!room) return;
    const members = rooms.get(room);
    if (!members) return;
    members.delete(socket.id);
    socket.to(room).emit("system-message", `${socket.data.name || "एक सदस्य"} रूम से चले गए।`);
    sendMembers(room);
    if (members.size === 0) rooms.delete(room);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AWNISH CHAT ready on port ${PORT}`);
});
