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

// Estado del juego global
let estadoJuego: {
  enJuego: boolean;
  palabraActual: string;
  palabraOculta: string;
  turnoActual: string;
  tiempoRestante: number;
  puntuaciones: { [usuario: string]: number };
  ronda: number;
  maxRondas: number;
  jugadores: string[];
  indiceTurno: number;
} = {
  enJuego: false,
  palabraActual: '',
  palabraOculta: '',
  turnoActual: '',
  tiempoRestante: 0,
  puntuaciones: {},
  ronda: 1,
  maxRondas: 5,
  jugadores: [],
  indiceTurno: 0
};

// Historial de todos los trazos dibujados (para sincronizar nuevos usuarios)
let historialCanvas: Array<{
  x: number;
  y: number;
  type: "start" | "draw" | "end" | "shape";
  color: string;
  grosor: number;
  usuario: string;
  herramienta?: string;
  puntoInicio?: { x: number; y: number };
}> = [];

// Timer del juego
let gameTimer: NodeJS.Timeout | null = null;

// Palabras disponibles para el juego
const palabrasDisponibles = [
  'casa', 'perro', 'gato', 'árbol', 'sol', 'luna', 'coche', 'avión',
  'flor', 'mar', 'montaña', 'ciudad', 'libro', 'música', 'deporte', 'comida',
  'pelota', 'estrella', 'robot', 'castillo', 'helado', 'pizza', 'teléfono', 'computadora'
];

// Función para detener el temporizador
function detenerTemporizador() {
  if (gameTimer) {
    clearInterval(gameTimer);
    gameTimer = null;
    console.log('⏹️ Temporizador detenido');
  }
}

// Función para iniciar el temporizador del juego
function iniciarTemporizador() {
  // Detener temporizador anterior si existe
  detenerTemporizador();
  
  console.log('⏱️ Iniciando temporizador con', estadoJuego.tiempoRestante, 'segundos');
  
  gameTimer = setInterval(() => {
    if (estadoJuego.tiempoRestante > 0) {
      estadoJuego.tiempoRestante--;
      
      // Enviar actualización de tiempo a todos los clientes
      io.emit('tiempo_actualizado', { tiempo: estadoJuego.tiempoRestante });
      
      console.log(`⏰ Tiempo restante: ${estadoJuego.tiempoRestante}s`);
    } else {
      // El tiempo se acabó, cambiar de turno
      console.log('⏰ Tiempo agotado, cambiando de turno...');
      cambiarTurno();
    }
  }, 1000);
}

// Función para seleccionar una nueva palabra aleatoria
function seleccionarNuevaPalabra(): string {
  const index = Math.floor(Math.random() * palabrasDisponibles.length);
  const palabraAleatoria = palabrasDisponibles[index];
  return palabraAleatoria || 'casa'; // Fallback en caso de error
}

// Función para cambiar de turno
function cambiarTurno() {
  detenerTemporizador();
  
  // Incrementar índice del turno
  estadoJuego.indiceTurno++;
  
  // Si todos han jugado, incrementar ronda
  if (estadoJuego.indiceTurno >= estadoJuego.jugadores.length) {
    estadoJuego.indiceTurno = 0;
    estadoJuego.ronda++;
    
    console.log(`🎮 Nueva ronda: ${estadoJuego.ronda}/${estadoJuego.maxRondas}`);
    
    // Verificar si el juego terminó
    if (estadoJuego.ronda > estadoJuego.maxRondas) {
      finalizarJuego();
      return;
    }
  }
  
  // Obtener el nuevo jugador del turno
  const nuevoTurno = estadoJuego.jugadores[estadoJuego.indiceTurno];
  if (!nuevoTurno) {
    console.error('❌ No se pudo obtener el jugador del turno');
    finalizarJuego();
    return;
  }
  estadoJuego.turnoActual = nuevoTurno;
  estadoJuego.tiempoRestante = 60; // Resetear tiempo
  
  // Seleccionar nueva palabra
  const nuevaPalabra = seleccionarNuevaPalabra();
  estadoJuego.palabraActual = nuevaPalabra;
  estadoJuego.palabraOculta = nuevaPalabra.replace(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '_');
  
  console.log(`🔄 Cambio de turno - Nuevo turno: ${nuevoTurno}, Palabra: ${nuevaPalabra}`);
  
  // Limpiar el canvas para el nuevo turno
  io.emit('limpiar_canvas');
  // NUEVO: Limpiar historial del canvas
historialCanvas = [];
console.log('📝 Historial del canvas limpiado para nuevo turno');
  
  // Notificar a todos los clientes sobre el nuevo turno
  io.emit('juego_iniciado', {
    palabra: estadoJuego.palabraActual,
    turnoActual: estadoJuego.turnoActual,
    tiempo: estadoJuego.tiempoRestante,
    usuarios: estadoJuego.jugadores,
    puntuaciones: estadoJuego.puntuaciones,
    ronda: estadoJuego.ronda,
    maxRondas: estadoJuego.maxRondas
  });
  
  // Reiniciar temporizador
  iniciarTemporizador();
}

// Función para finalizar el juego
function finalizarJuego() {
  console.log('🏁 Juego finalizado');
  detenerTemporizador();
  
  // Resetear estado del juego
  estadoJuego.enJuego = false;
  estadoJuego.palabraActual = '';
  estadoJuego.palabraOculta = '';
  estadoJuego.turnoActual = '';
  estadoJuego.tiempoRestante = 0;
  estadoJuego.ronda = 1;
  estadoJuego.indiceTurno = 0;
  estadoJuego.jugadores = [];
  
  // Notificar a todos los clientes
  io.emit('juego_terminado');
}

// Manejar conexiones de Socket.IO
io.on('connection', (socket) => {
  console.log('✅ Usuario conectado:', socket.id);

 // Escuchar configuración de usuario
socket.on('usuario_conectado', (usuario: Usuario) => {
  console.log('👤 Usuario configurado:', usuario);
  usuariosConectados.set(socket.id, { ...usuario, id: socket.id });
  
  // Enviar lista actualizada de usuarios a todos
  io.emit('usuarios', Array.from(usuariosConectados.values()));
  
  // NUEVO: Enviar historial del canvas al usuario que acaba de conectarse
  if (historialCanvas.length > 0) {
    console.log(`📤 Enviando ${historialCanvas.length} trazos del historial a`, usuario.nombre);
    socket.emit('sincronizar_canvas', { historial: historialCanvas });
  }
  
  // Si hay un juego en progreso, sincronizar el estado
  if (estadoJuego.enJuego) {
    socket.emit('juego_iniciado', {
      palabra: estadoJuego.palabraActual,
      turnoActual: estadoJuego.turnoActual,
      tiempo: estadoJuego.tiempoRestante,
      usuarios: Array.from(usuariosConectados.values()).map(u => u.nombre),
      puntuaciones: estadoJuego.puntuaciones,
      ronda: estadoJuego.ronda,
      maxRondas: estadoJuego.maxRondas
    });
  }
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
    type: 'start' | 'draw' | 'end' | 'shape';
    color: string;
    grosor: number;
    usuario: string;
    herramienta?: string;
    puntoInicio?: { x: number; y: number };
  }) => {
    console.log('🎨 Dibujo recibido:', data, 'de', socket.id);
    
    // NUEVO: Guardar en el historial (excepto eventos 'end' que son solo control)
    if (data.type !== 'end') {
      historialCanvas.push(data);
    }
    
    // Enviar a TODOS LOS DEMÁS clientes (excepto el que dibuja)
    socket.broadcast.emit('dibujo', data);
  });

  // Escuchar limpieza de canvas
socket.on('limpiar_canvas', () => {
  console.log('🗑️ Canvas limpiado por:', socket.id);
  
  // NUEVO: Limpiar el historial del canvas
  historialCanvas = [];
  console.log('📝 Historial del canvas limpiado');
  
  // Enviar a TODOS LOS DEMÁS clientes
  socket.broadcast.emit('limpiar_canvas');
});

  // Escuchar inicio de juego
  socket.on('iniciar_juego', (data: { palabra: string; turnoActual: string; tiempo: number; usuarios: string[]; maxRondas?: number }) => {
    console.log('🎮 Juego iniciado:', data);
    
    // Detener cualquier temporizador anterior
    detenerTemporizador();
    
    // Actualizar estado global del juego
    estadoJuego = {
      enJuego: true,
      palabraActual: data.palabra,
      palabraOculta: data.palabra.replace(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '_'),
      turnoActual: data.turnoActual,
      tiempoRestante: data.tiempo,
      puntuaciones: data.usuarios.reduce((acc, user) => ({ ...acc, [user]: 0 }), {}),
      ronda: 1,
      maxRondas: data.maxRondas || 5,
      jugadores: data.usuarios,
      indiceTurno: 0
    };
    
    // Crear objeto de juego con información completa
    const juegoData = {
      palabra: data.palabra,
      turnoActual: data.turnoActual,
      tiempo: data.tiempo,
      usuarios: data.usuarios,
      puntuaciones: estadoJuego.puntuaciones,
      ronda: 1,
      maxRondas: estadoJuego.maxRondas
    };
    
    // Enviar a TODOS los clientes
    io.emit('juego_iniciado', juegoData);
    
    // Iniciar el temporizador del juego
    iniciarTemporizador();
  });

  // Escuchar palabra correcta
  socket.on('palabra_correcta', (data: { usuario: string; palabra: string; tiempoRestante: number }) => {
    console.log('🎯 Palabra correcta:', data);
    
    if (!estadoJuego.enJuego) return;
    
    // Calcular puntos basados en el tiempo restante (más rápido = más puntos)
    const puntos = Math.max(10, Math.floor(estadoJuego.tiempoRestante * 2)); // 2 puntos por segundo restante, mínimo 10
    
    // Actualizar puntuaciones en el estado global
    estadoJuego.puntuaciones[data.usuario] = (estadoJuego.puntuaciones[data.usuario] || 0) + puntos;
    
    console.log(`💰 ${data.usuario} ganó ${puntos} puntos. Total: ${estadoJuego.puntuaciones[data.usuario]}`);
    
    // Enviar a TODOS los clientes el mensaje de palabra adivinada
    io.emit('palabra_adivinada', {
      usuario: data.usuario,
      palabra: data.palabra,
      puntos: puntos
    });
    
    // Enviar puntuaciones actualizadas
    io.emit('puntuaciones_actualizadas', {
      puntuaciones: estadoJuego.puntuaciones
    });
    
    // Cambiar de turno después de 3 segundos
    setTimeout(() => {
      if (estadoJuego.enJuego) {
        cambiarTurno();
      }
    }, 3000);
  });

  // Escuchar fin de juego
  socket.on('terminar_juego', () => {
    console.log('🏁 Juego terminado por solicitud de usuario');
    finalizarJuego();
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log('❌ Usuario desconectado:', socket.id);
    const usuarioDesconectado = usuariosConectados.get(socket.id);
    usuariosConectados.delete(socket.id);
    
    // Si había un juego en progreso y era el turno del usuario desconectado
    if (estadoJuego.enJuego && usuarioDesconectado && estadoJuego.turnoActual === usuarioDesconectado.nombre) {
      console.log('⚠️ Usuario del turno actual se desconectó, cambiando turno...');
      // Remover al usuario de la lista de jugadores
      estadoJuego.jugadores = estadoJuego.jugadores.filter(j => j !== usuarioDesconectado.nombre);
      delete estadoJuego.puntuaciones[usuarioDesconectado.nombre];
      
      // Si quedan menos de 2 jugadores, terminar el juego
      if (estadoJuego.jugadores.length < 2) {
        console.log('⚠️ No hay suficientes jugadores, terminando juego...');
        finalizarJuego();
      } else {
        // Ajustar índice si es necesario
        if (estadoJuego.indiceTurno >= estadoJuego.jugadores.length) {
          estadoJuego.indiceTurno = 0;
        }
        cambiarTurno();
      }
    } else if (estadoJuego.enJuego && usuarioDesconectado) {
      // Remover al usuario de la lista de jugadores
      const indiceUsuario = estadoJuego.jugadores.indexOf(usuarioDesconectado.nombre);
      if (indiceUsuario !== -1) {
        estadoJuego.jugadores.splice(indiceUsuario, 1);
        delete estadoJuego.puntuaciones[usuarioDesconectado.nombre];
        
        // Ajustar el índice del turno si es necesario
        if (indiceUsuario < estadoJuego.indiceTurno) {
          estadoJuego.indiceTurno--;
        }
        
        // Si quedan menos de 2 jugadores, terminar el juego
        if (estadoJuego.jugadores.length < 2) {
          console.log('⚠️ No hay suficientes jugadores, terminando juego...');
          finalizarJuego();
        } else {
          // Notificar actualización de puntuaciones
          io.emit('puntuaciones_actualizadas', {
            puntuaciones: estadoJuego.puntuaciones
          });
        }
      }
    }
    
    // Enviar lista actualizada de usuarios a todos
    io.emit('usuarios', Array.from(usuariosConectados.values()));
  });
});

const PORT = 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});