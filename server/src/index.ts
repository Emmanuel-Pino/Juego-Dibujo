import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

// Configurar CORS para permitir conexiones del cliente
app.use(cors());

// Configurar Socket.IO con CORS
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173", // Puerto de Vite (cliente React)
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Manejar conexiones de Socket.IO
io.on('connection', (socket) => {
  console.log('✅ Usuario conectado:', socket.id);

  // Escuchar mensajes del chat
  socket.on('mensaje', (data: string) => {
    console.log('💬 Mensaje recibido:', data, 'de', socket.id);
    // Enviar a TODOS los clientes (incluyendo el que lo envió)
    io.emit('mensaje', data);
  });

  // Escuchar eventos de dibujo
  socket.on('dibujo', (data: { x: number; y: number; type: 'start' | 'draw' }) => {
    console.log('🎨 Dibujo recibido:', data, 'de', socket.id);
    // Enviar a TODOS LOS DEMÁS clientes (excepto el que dibuja)
    socket.broadcast.emit('dibujo', data);
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log('❌ Usuario desconectado:', socket.id);
  });
});

const PORT = 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});