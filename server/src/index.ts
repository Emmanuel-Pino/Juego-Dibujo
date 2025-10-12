import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

interface Usuario {
  id: string;
  nombre: string;
  color: string;
}

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

// Almacenar usuarios conectados
const usuariosConectados = new Map<string, Usuario>();

// Manejar conexiones de Socket.IO
io.on('connection', (socket) => {
  console.log('✅ Usuario conectado:', socket.id);

  // Escuchar configuración de usuario
  socket.on('usuario_conectado', (usuario: Usuario) => {
    console.log('👤 Usuario configurado:', usuario);
    usuariosConectados.set(socket.id, { ...usuario, id: socket.id });
    
    // Enviar lista actualizada de usuarios a todos
    io.emit('usuarios', Array.from(usuariosConectados.values()));
  });

  // Escuchar mensajes del chat
  socket.on('mensaje', (data: { usuario: string; texto: string; color: string }) => {
    console.log('💬 Mensaje recibido:', data, 'de', socket.id);
    // Enviar a TODOS los clientes (incluyendo el que lo envió)
    io.emit('mensaje', data);
  });

  // Escuchar eventos de dibujo
  socket.on('dibujo', (data: { 
    x: number; 
    y: number; 
    type: 'start' | 'draw' | 'end';
    color: string;
    grosor: number;
    usuario: string;
  }) => {
    console.log('🎨 Dibujo recibido:', data, 'de', socket.id);
    // Enviar a TODOS LOS DEMÁS clientes (excepto el que dibuja)
    socket.broadcast.emit('dibujo', data);
  });

  // Escuchar limpieza de canvas
  socket.on('limpiar_canvas', () => {
    console.log('🗑️ Canvas limpiado por:', socket.id);
    // Enviar a TODOS LOS DEMÁS clientes
    socket.broadcast.emit('limpiar_canvas');
  });

  // Escuchar inicio de juego
  socket.on('iniciar_juego', (data: { palabra: string; turnoActual: string; tiempo: number }) => {
    console.log('🎮 Juego iniciado:', data);
    // Enviar a TODOS los clientes
    io.emit('juego_iniciado', data);
  });

  // Escuchar palabra correcta
  socket.on('palabra_correcta', (data: { usuario: string; palabra: string; puntos: number }) => {
    console.log('🎯 Palabra correcta:', data);
    // Enviar a TODOS los clientes
    io.emit('palabra_adivinada', data);
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log('❌ Usuario desconectado:', socket.id);
    usuariosConectados.delete(socket.id);
    
    // Enviar lista actualizada de usuarios a todos
    io.emit('usuarios', Array.from(usuariosConectados.values()));
  });
});

const PORT = 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});