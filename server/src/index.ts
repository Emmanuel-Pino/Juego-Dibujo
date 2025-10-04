import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*", // desarrollo: cualquier cliente puede conectarse
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Un usuario se conectó:", socket.id);

  // Chat
  socket.on("mensaje", (data: string) => {
    io.emit("mensaje", data); // reenviar a todos
  });

  // Dibujo: reenviar a todos excepto al que dibuja
  socket.on("dibujo", (data: { x: number; y: number; type: "start" | "draw" }) => {
    socket.broadcast.emit("dibujo", data);
  });

  socket.on("disconnect", () => {
    console.log("Un usuario se desconectó:", socket.id);
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
