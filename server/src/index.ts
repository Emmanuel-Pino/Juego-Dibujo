import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173", // nuestro cliente
    methods: ["GET", "POST"],
  },
});

// evento cuando un cliente se conecta
io.on("connection", (socket) => {
  console.log("Un usuario se conectó:", socket.id);

  socket.on("disconnect", () => {
    console.log("Un usuario se desconectó:", socket.id);
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
