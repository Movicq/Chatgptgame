
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

let rooms = {}; // roomId -> { players: [], turn: 0, log: "" }

function generateRoomId() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function getAlive(players) {
  return players.filter(p => p.hp > 0);
}

function broadcastRoomList() {
  io.emit("roomList", Object.keys(rooms));
}

io.on("connection", socket => {
  socket.on("createRoom", ({ playerName, playerClass }) => {
    const roomId = generateRoomId();
    rooms[roomId] = { players: [], turn: 0, log: "" };
    const player = { id: socket.id, name: playerName, cls: playerClass, hp: 100 };
    rooms[roomId].players.push(player);
    socket.join(roomId);
    socket.emit("roomCreated", roomId);
    io.to(roomId).emit("playerJoined", rooms[roomId].players);
    broadcastRoomList();
  });

  socket.on("joinRoom", ({ roomId, playerName, playerClass }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("joinFailed");
      return;
    }
    const player = { id: socket.id, name: playerName, cls: playerClass, hp: 100 };
    room.players.push(player);
    socket.join(roomId);
    io.to(roomId).emit("playerJoined", room.players);
  });

  socket.on("joinRandom", ({ playerName, playerClass }) => {
    const openRoom = Object.entries(rooms).find(([id, r]) => r.players.length < 4);
    if (openRoom) {
      const [roomId, room] = openRoom;
      const player = { id: socket.id, name: playerName, cls: playerClass, hp: 100 };
      room.players.push(player);
      socket.join(roomId);
      socket.emit("roomCreated", roomId);
      io.to(roomId).emit("playerJoined", room.players);
    } else {
      const roomId = generateRoomId();
      rooms[roomId] = { players: [], turn: 0, log: "" };
      const player = { id: socket.id, name: playerName, cls: playerClass, hp: 100 };
      rooms[roomId].players.push(player);
      socket.join(roomId);
      socket.emit("roomCreated", roomId);
      io.to(roomId).emit("playerJoined", rooms[roomId].players);
    }
    broadcastRoomList();
  });

  socket.on("startGame", roomId => {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return;
    room.turn = 0;
    room.log = "Gra rozpoczÄ™ta!";
    io.to(roomId).emit("gameStarted", { players: room.players, turn: room.turn });
  });

  socket.on("performAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;
    const attacker = room.players[room.turn];
    if (!attacker || attacker.id !== socket.id || attacker.hp <= 0) return;

    const enemies = getAlive(room.players).filter(p => p.id !== attacker.id);
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    let log = `${attacker.name} uĹĽywa ${action}`;
    
    if (action === "attack" && target) {
      const dmg = Math.floor(Math.random() * 25) + 5;
      target.hp -= dmg;
      log += ` i zadaje ${dmg} obraĹĽeĹ„ ${target.name}`;
    } else if (action === "defend") {
      attacker.hp += 10;
      log += ` i leczy 10 HP`;
    } else if (action === "special" && target) {
      const dmg = Math.floor(Math.random() * 50);
      target.hp -= dmg;
      log += ` i zadaje ${dmg} specjalnych obraĹĽeĹ„ ${target.name}`;
    }

    room.log = log;
    room.turn = (room.turn + 1) % room.players.length;

    if (getAlive(room.players).length <= 1) {
      io.to(roomId).emit("gameEnded", `${attacker.name} wygrywa!`);
      delete rooms[roomId];
      broadcastRoomList();
    } else {
      io.to(roomId).emit("updateState", { players: room.players, turn: room.turn, log: room.log });
    }
  });

  socket.on("chatMessage", ({ roomId, message }) => {
    const room = rooms[roomId];
    const sender = room?.players.find(p => p.id === socket.id);
    if (sender) {
      io.to(roomId).emit("chatMessage", { name: sender.name, message });
    }
  });

  socket.on("getRoomList", () => {
    broadcastRoomList();
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(roomId).emit("playerLeft", room.players);
        if (room.players.length === 0) {
          delete rooms[roomId];
          broadcastRoomList();
        }
      }
    }
  });
});

http.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
