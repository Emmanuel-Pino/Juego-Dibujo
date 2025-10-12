import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

interface Usuario {
  id: string;
  nombre: string;
  color: string;
}

interface Mensaje {
  id: string;
  usuario: string;
  texto: string;
  timestamp: Date;
  color: string;
}

interface HerramientaDibujo {
  tipo: 'pincel' | 'borrador' | 'rectangulo' | 'circulo' | 'linea' | 'texto';
  color: string;
  grosor: number;
}

interface CanvasState {
  zoom: number;
  panX: number;
  panY: number;
  capaActual: number;
  capas: CanvasRenderingContext2D[];
}

interface JuegoState {
  enJuego: boolean;
  palabraActual: string;
  palabraOculta: string;
  turnoActual: string;
  tiempoRestante: number;
  puntuaciones: { [usuario: string]: number };
  ronda: number;
  maxRondas: number;
}

function App() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [input, setInput] = useState("");
  const [conectado, setConectado] = useState(false);
  const [usuario, setUsuario] = useState<Usuario>({ id: '', nombre: '', color: '#6366f1' });
  const [mostrarConfigUsuario, setMostrarConfigUsuario] = useState(false);
  const [herramienta, setHerramienta] = useState<HerramientaDibujo>({
    tipo: 'pincel',
    color: '#000000',
    grosor: 2
  });
  const [dibujando, setDibujando] = useState(false);
  const [usuariosConectados, setUsuariosConectados] = useState<Usuario[]>([]);
  const [canvasState, setCanvasState] = useState<CanvasState>({
    zoom: 1,
    panX: 0,
    panY: 0,
    capaActual: 0,
    capas: []
  });
  const [juegoState, setJuegoState] = useState<JuegoState>({
    enJuego: false,
    palabraActual: '',
    palabraOculta: '',
    turnoActual: '',
    tiempoRestante: 0,
    puntuaciones: {},
    ronda: 1,
    maxRondas: 5
  });
  const [mostrarConfigJuego, setMostrarConfigJuego] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const gameTimerRef = useRef<number | null>(null);
  const palabrasRef = useRef<string[]>([
    'casa', 'perro', 'gato', 'árbol', 'sol', 'luna', 'coche', 'avión',
    'flor', 'mar', 'montaña', 'ciudad', 'libro', 'música', 'deporte', 'comida'
  ]);

  // Generar color aleatorio para el usuario
  const generarColorUsuario = () => {
    const colores = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
    return colores[Math.floor(Math.random() * colores.length)];
  };

  // Inicializar Socket.IO
  useEffect(() => {
    const socket = io("http://localhost:5000", {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Conectado al servidor con id:", socket.id);
      setConectado(true);
      setUsuario(prev => ({ ...prev, id: socket.id || '', color: generarColorUsuario() }));
      setMostrarConfigUsuario(true);
    });

    socket.on("disconnect", () => {
      console.log("❌ Desconectado del servidor");
      setConectado(false);
    });

    socket.on("mensaje", (data: { usuario: string; texto: string; color: string }) => {
      console.log("💬 Mensaje recibido:", data);
      const nuevoMensaje: Mensaje = {
        id: Date.now().toString(),
        usuario: data.usuario,
        texto: data.texto,
        timestamp: new Date(),
        color: data.color
      };
      setMensajes((prev) => [...prev, nuevoMensaje]);
    });

    socket.on("dibujo", ({ x, y, type, color, grosor, usuario }: { 
      x: number; 
      y: number; 
      type: "start" | "draw" | "end";
      color: string;
      grosor: number;
      usuario: string;
    }) => {
      console.log("🎨 Dibujo recibido de otro cliente:", { x, y, type, color, grosor, usuario });
      const ctx = ctxRef.current;
      if (!ctx) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = grosor;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (type === "start") {
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else if (type === "draw") {
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    });

    socket.on("usuarios", (usuarios: Usuario[]) => {
      setUsuariosConectados(usuarios);
    });

    socket.on("limpiar_canvas", () => {
      console.log("🗑️ Canvas limpiado por otro usuario");
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    socket.on("juego_iniciado", (data: { 
      palabra: string; 
      turnoActual: string; 
      tiempo: number; 
      usuarios: string[];
      puntuaciones: { [usuario: string]: number };
      ronda: number;
    }) => {
      try {
        console.log("🎮 Juego iniciado desde servidor:", data);
        
        // Sincronizar el estado del juego en todos los clientes
        setJuegoState(prev => ({
          ...prev,
          enJuego: true,
          palabraActual: data.palabra,
          palabraOculta: data.palabra.replace(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '_'),
          turnoActual: data.turnoActual,
          tiempoRestante: data.tiempo,
          puntuaciones: data.puntuaciones || {},
          ronda: data.ronda || 1
        }));
        
        // Iniciar el timer en todos los clientes
        if (gameTimerRef.current) {
          clearInterval(gameTimerRef.current);
        }
        
        gameTimerRef.current = setInterval(() => {
          setJuegoState(prev => {
            if (prev.tiempoRestante <= 1) {
              // Tiempo agotado - simplemente reiniciar el timer por ahora
              return {
                ...prev,
                tiempoRestante: 60
              };
            }
            
            return {
              ...prev,
              tiempoRestante: prev.tiempoRestante - 1
            };
          });
        }, 1000);
        
        // Mostrar mensaje de confirmación
        setMensajes(prev => [...prev, {
          id: Date.now().toString(),
          usuario: 'Sistema',
          texto: `🎮 ¡Juego iniciado! Es el turno de ${data.turnoActual} - Palabra: ${data.palabra.replace(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '_')}`,
          timestamp: new Date(),
          color: '#6366f1'
        }]);
      } catch (error) {
        console.error("Error al procesar juego_iniciado:", error);
      }
    });

    socket.on("palabra_adivinada", (data: { usuario: string; palabra: string; puntos: number }) => {
      console.log("🎯 Palabra adivinada:", data);
      // Actualizar puntuaciones y mostrar mensaje
      setMensajes(prev => [...prev, {
        id: Date.now().toString(),
        usuario: 'Sistema',
        texto: `🎉 ¡${data.usuario} adivinó "${data.palabra}" y ganó ${data.puntos} puntos!`,
        timestamp: new Date(),
        color: '#10b981'
      }]);
    });

    socket.on("juego_terminado", () => {
      console.log("🏁 Juego terminado");
      setJuegoState(prev => ({
        ...prev,
        enJuego: false,
        palabraActual: '',
        palabraOculta: '',
        turnoActual: '',
        tiempoRestante: 0
      }));
      
      // Limpiar timer
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      
      setMensajes(prev => [...prev, {
        id: Date.now().toString(),
        usuario: 'Sistema',
        texto: '🏁 ¡Juego terminado! Pueden iniciar un nuevo juego.',
        timestamp: new Date(),
        color: '#f59e0b'
      }]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Inicializar canvas y eventos de dibujo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Configurar estilo del canvas
    ctx.strokeStyle = herramienta.color;
    ctx.lineWidth = herramienta.grosor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    ctxRef.current = ctx;
  }, [herramienta]);

  // Eventos de dibujo simplificados
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const empezarDibujo = (e: MouseEvent) => {
      if (usuario.nombre === '' || e.button !== 0) return; // Solo botón izquierdo
      
      // Si se mantiene Ctrl, iniciar pan
      if (e.ctrlKey || e.metaKey) {
        iniciarPan(e.clientX, e.clientY);
        return;
      }
      
      setDibujando(true);
      const ctx = ctxRef.current;
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Configurar estilo del pincel
      ctx.strokeStyle = herramienta.color;
      ctx.lineWidth = herramienta.grosor;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      
      console.log("🖊️ Empezando a dibujar en:", x, y);
      socketRef.current?.emit("dibujo", { 
        x: x, 
        y: y, 
        type: "start",
        color: herramienta.color,
        grosor: herramienta.grosor,
        usuario: usuario.nombre
      });
    };

    const dibujar = (e: MouseEvent) => {
      if (!dibujando || usuario.nombre === '') return;
      const ctx = ctxRef.current;
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      ctx.lineTo(x, y);
      ctx.stroke();
      
      console.log("🖊️ Dibujando en:", x, y);
      socketRef.current?.emit("dibujo", { 
        x: x, 
        y: y, 
        type: "draw",
        color: herramienta.color,
        grosor: herramienta.grosor,
        usuario: usuario.nombre
      });
    };

    const terminarDibujo = () => {
      if (dibujando) {
        console.log("🖊️ Terminando dibujo");
        socketRef.current?.emit("dibujo", { 
          x: 0, 
          y: 0, 
          type: "end",
          color: herramienta.color,
          grosor: herramienta.grosor,
          usuario: usuario.nombre
        });
      }
      setDibujando(false);
    };

    const manejarWheel = (e: WheelEvent) => {
      e.preventDefault();
      hacerZoom(e.deltaY, e.clientX, e.clientY);
    };

    const manejarKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        resetearCanvas();
      }
    };

    canvas.addEventListener("mousedown", empezarDibujo);
    canvas.addEventListener("mousemove", dibujar);
    canvas.addEventListener("mouseup", terminarDibujo);
    canvas.addEventListener("mouseleave", terminarDibujo);
    canvas.addEventListener("wheel", manejarWheel);
    document.addEventListener("keydown", manejarKeyDown);

    return () => {
      canvas.removeEventListener("mousedown", empezarDibujo);
      canvas.removeEventListener("mousemove", dibujar);
      canvas.removeEventListener("mouseup", terminarDibujo);
      canvas.removeEventListener("mouseleave", terminarDibujo);
      canvas.removeEventListener("wheel", manejarWheel);
      document.removeEventListener("keydown", manejarKeyDown);
    };
  }, [dibujando, herramienta, usuario.nombre]);

  // Auto-scroll del chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [mensajes]);

  const enviarMensaje = () => {
    if (input.trim() === "" || usuario.nombre === '') return;
    
    // Si estamos en juego, verificar si es la palabra correcta
    if (juegoState.enJuego) {
      if (verificarPalabra(input.trim())) {
        // Palabra correcta, el mensaje se enviará automáticamente
        setInput("");
        return;
      }
    }
    
    console.log("📤 Enviando mensaje:", input);
    socketRef.current?.emit("mensaje", {
      usuario: usuario.nombre,
      texto: input,
      color: usuario.color
    });
    setInput("");
  };

  const limpiarCanvas = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Notificar a otros usuarios que se limpió el canvas
    socketRef.current?.emit("limpiar_canvas");
  };

  const configurarUsuario = () => {
    if (usuario.nombre.trim() === '') return;
    setMostrarConfigUsuario(false);
    // Notificar al servidor sobre el nuevo usuario
    socketRef.current?.emit("usuario_conectado", usuario);
  };

  const formatearHora = (fecha: Date) => {
    return fecha.toLocaleTimeString('es-ES', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Funciones del canvas avanzado (simplificadas)

  const hacerZoom = (delta: number, x: number, y: number) => {
    const factor = delta > 0 ? 1.1 : 0.9;
    const nuevoZoom = Math.max(0.1, Math.min(5, canvasState.zoom * factor));
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = x - rect.left;
    const mouseY = y - rect.top;
    
    const worldX = (mouseX - canvasState.panX) / canvasState.zoom;
    const worldY = (mouseY - canvasState.panY) / canvasState.zoom;
    
    setCanvasState(prev => ({
      ...prev,
      zoom: nuevoZoom,
      panX: mouseX - worldX * nuevoZoom,
      panY: mouseY - worldY * nuevoZoom
    }));
  };

  const iniciarPan = (x: number, y: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const startX = x - rect.left;
    const startY = y - rect.top;
    
    const handleMouseMove = (e: MouseEvent) => {
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
      setCanvasState(prev => ({
        ...prev,
        panX: prev.panX + (currentX - startX),
        panY: prev.panY + (currentY - startY)
      }));
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const resetearCanvas = () => {
    setCanvasState({
      zoom: 1,
      panX: 0,
      panY: 0,
      capaActual: 0,
      capas: []
    });
  };

  // Funciones del juego
  const iniciarJuego = () => {
    try {
      if (usuariosConectados.length < 2) {
        alert('Se necesitan al menos 2 jugadores para iniciar el juego');
        return;
      }
      
      const palabraAleatoria = palabrasRef.current[Math.floor(Math.random() * palabrasRef.current.length)];
      
      setMostrarConfigJuego(false);
      
      // Limpiar canvas al iniciar juego
      limpiarCanvas();
      
      // Notificar al servidor - el servidor se encargará de sincronizar a todos
      socketRef.current?.emit('iniciar_juego', {
        palabra: palabraAleatoria,
        turnoActual: usuariosConectados[0].nombre,
        tiempo: 60,
        usuarios: usuariosConectados.map(u => u.nombre)
      });
      
      console.log("🎮 Iniciando juego con palabra:", palabraAleatoria);
    } catch (error) {
      console.error("Error al iniciar juego:", error);
      alert("Error al iniciar el juego. Inténtalo de nuevo.");
    }
  };


  const verificarPalabra = (palabra: string) => {
    if (palabra.toLowerCase() === juegoState.palabraActual.toLowerCase()) {
      // Palabra correcta
      const puntos = Math.max(10, 60 - juegoState.tiempoRestante);
      setJuegoState(prev => ({
        ...prev,
        puntuaciones: {
          ...prev.puntuaciones,
          [prev.turnoActual]: (prev.puntuaciones[prev.turnoActual] || 0) + puntos
        }
      }));
      
      // Notificar a todos
      socketRef.current?.emit('palabra_correcta', {
        usuario: juegoState.turnoActual,
        palabra: juegoState.palabraActual,
        puntos
      });
      
      return true;
    }
    return false;
  };

  // Modal de configuración del juego
  if (mostrarConfigJuego) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div className="card animate-fade-in" style={{ maxWidth: '500px', width: '90%' }}>
          <div className="card-header">
            <h2 style={{ margin: 0, textAlign: 'center' }}>🎮 Configurar Juego</h2>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: '1rem' }}>
              <h3>👥 Jugadores Conectados ({usuariosConectados.length})</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {usuariosConectados.map(user => (
                  <div key={user.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${user.color}`
                  }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: user.color
                    }} />
                    <span>{user.nombre}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Número de rondas: {juegoState.maxRondas}
              </label>
              <input
                type="range"
                min="3"
                max="10"
                value={juegoState.maxRondas}
                onChange={(e) => setJuegoState(prev => ({ ...prev, maxRondas: parseInt(e.target.value) }))}
                style={{ width: '100%' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setMostrarConfigJuego(false)}
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={iniciarJuego}
                disabled={usuariosConectados.length < 2}
                style={{ flex: 1 }}
              >
                ¡Iniciar Juego!
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Modal de configuración de usuario
  if (mostrarConfigUsuario) {
    return (
      <div style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div className="card animate-fade-in" style={{ maxWidth: '400px', width: '90%' }}>
          <div className="card-header">
            <h2 style={{ margin: 0, textAlign: 'center' }}>🎨 Configura tu perfil</h2>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Nombre de usuario
              </label>
              <input
                type="text"
                className="input"
                value={usuario.nombre}
                onChange={(e) => setUsuario(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Ingresa tu nombre"
                maxLength={20}
                onKeyPress={(e) => e.key === "Enter" && configurarUsuario()}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Color de usuario
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'].map(color => (
                  <button
                    key={color}
                    onClick={() => setUsuario(prev => ({ ...prev, color }))}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      border: usuario.color === color ? '3px solid #000' : '2px solid #e2e8f0',
                      backgroundColor: color,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  />
                ))}
              </div>
            </div>
            <button
              className="btn btn-primary btn-lg"
              onClick={configurarUsuario}
              disabled={usuario.nombre.trim() === ''}
              style={{ width: '100%' }}
            >
              ¡Comenzar a dibujar!
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '1rem'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div className="card animate-fade-in" style={{ marginBottom: '1rem' }}>
          <div className="card-header" style={{ textAlign: 'center' }}>
            <h1 className="text-gradient animate-fade-in" style={{ 
              margin: 0, 
              fontSize: '2.5rem',
              fontWeight: '700'
            }}>
              🎨 Juego de Dibujo Colaborativo
            </h1>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <div className={`status-indicator animate-scale-in ${conectado ? 'status-connected' : 'status-disconnected'}`}>
                {conectado ? '✅' : '❌'} {conectado ? 'Conectado' : 'Desconectado'}
              </div>
              {usuario.nombre && (
                <div className="animate-slide-in-right" style={{ 
                  padding: '0.5rem 1rem', 
                  background: usuario.color, 
                  color: 'white', 
                  borderRadius: 'var(--radius-md)',
                  fontWeight: '500'
                }}>
                  👤 {usuario.nombre}
                </div>
              )}
              {!juegoState.enJuego && usuariosConectados.length >= 2 && (
                <button
                  className="btn btn-primary btn-sm animate-bounce"
                  onClick={() => setMostrarConfigJuego(true)}
                >
                  🎮 Iniciar Juego
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid-responsive" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', height: 'calc(100vh - 200px)' }}>
          {/* Panel izquierdo - Chat y usuarios */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Información del juego */}
            {juegoState.enJuego && (
              <div className="card">
                <div className="card-header">
                  <h3 style={{ margin: 0 }}>🎮 Juego en Progreso</h3>
                </div>
                <div className="card-body">
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: '500' }}>Ronda: {juegoState.ronda}/{juegoState.maxRondas}</span>
                      <span style={{ 
                        fontWeight: '600', 
                        color: juegoState.tiempoRestante <= 10 ? 'var(--danger-color)' : 'var(--text-primary)',
                        fontSize: '1.2rem'
                      }}>
                        ⏰ {juegoState.tiempoRestante}s
                      </span>
                    </div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: '500' }}>Turno de: </span>
                      <span style={{ 
                        color: usuariosConectados.find(u => u.nombre === juegoState.turnoActual)?.color,
                        fontWeight: '600'
                      }}>
                        {juegoState.turnoActual}
                      </span>
                    </div>
                    <div style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: '700', 
                      textAlign: 'center',
                      letterSpacing: '0.2em',
                      color: 'var(--primary-color)',
                      margin: '0.5rem 0'
                    }}>
                      {juegoState.palabraOculta}
                    </div>
                  </div>
                  
                  {/* Puntuaciones */}
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>🏆 Puntuaciones</h4>
                    <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                      {Object.entries(juegoState.puntuaciones)
                        .sort(([,a], [,b]) => b - a)
                        .map(([nombre, puntos]) => (
                          <div key={nombre} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.25rem 0',
                            borderBottom: '1px solid var(--border-color)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: usuariosConectados.find(u => u.nombre === nombre)?.color || '#000'
                              }} />
                              <span style={{ fontSize: '0.875rem' }}>{nombre}</span>
                            </div>
                            <span style={{ fontWeight: '600', color: 'var(--primary-color)' }}>{puntos}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Usuarios conectados */}
            <div className="card">
              <div className="card-header">
                <h3 style={{ margin: 0 }}>👥 Usuarios ({usuariosConectados.length})</h3>
              </div>
              <div className="card-body" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                {usuariosConectados.map(usuario => (
                  <div key={usuario.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--border-color)'
                  }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: usuario.color
                    }} />
                    <span style={{ fontSize: '0.875rem' }}>{usuario.nombre}</span>
                    {juegoState.enJuego && juegoState.turnoActual === usuario.nombre && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: '600' }}>
                        🎯
                      </span>
                    )}
                  </div>
                ))}
              </div>
      </div>

      {/* Chat */}
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <h3 style={{ margin: 0 }}>💬 Chat</h3>
              </div>
              <div 
                ref={chatRef}
                className="card-body" 
                style={{ 
                  flex: 1, 
                  overflowY: 'auto', 
                  padding: '1rem',
                  maxHeight: '300px'
                }}
              >
                {mensajes.map((msg, index) => (
                  <div key={msg.id} className="animate-slide-in-right" style={{ 
                    marginBottom: '0.75rem',
                    animationDelay: `${index * 0.1}s`
                  }}>
        <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem', 
                      marginBottom: '0.25rem' 
                    }}>
                      <div className="animate-pulse" style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: msg.color
                      }} />
                      <span style={{ 
                        fontWeight: '600', 
                        fontSize: '0.875rem',
                        color: msg.color 
                      }}>
                        {msg.usuario}
                      </span>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        color: 'var(--text-muted)' 
                      }}>
                        {formatearHora(msg.timestamp)}
                      </span>
                    </div>
                    <p style={{ 
                      margin: 0, 
                      fontSize: '0.875rem',
                      lineHeight: '1.4'
                    }}>
                      {msg.texto}
                    </p>
                  </div>
          ))}
        </div>
              <div className="card-footer">
                <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
                    type="text"
                    className="input"
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && enviarMensaje()}
                    placeholder="Escribe un mensaje..."
                    disabled={usuario.nombre === ''}
          />
          <button 
                    className="btn btn-primary"
            onClick={enviarMensaje}
                    disabled={input.trim() === '' || usuario.nombre === ''}
          >
            Enviar
          </button>
        </div>
              </div>
            </div>
          </div>

          {/* Panel derecho - Canvas y herramientas */}
          <div className="canvas-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Herramientas de dibujo */}
            <div className="card">
              <div className="card-header">
                <h3 style={{ margin: 0 }}>🛠️ Herramientas</h3>
              </div>
              <div className="card-body">
                <div className="tools-responsive" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                  {/* Tipo de herramienta */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Herramienta
                    </label>
                    <select
                      value={herramienta.tipo}
                      onChange={(e) => setHerramienta(prev => ({ ...prev, tipo: e.target.value as any }))}
                      style={{
                        padding: '0.5rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-primary)'
                      }}
                    >
                      <option value="pincel">🖌️ Pincel</option>
                      <option value="borrador">🧽 Borrador</option>
                      <option value="rectangulo">⬜ Rectángulo</option>
                      <option value="circulo">⭕ Círculo</option>
                      <option value="linea">📏 Línea</option>
                    </select>
                  </div>

                  {/* Color */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Color
                    </label>
                    <input
                      type="color"
                      value={herramienta.color}
                      onChange={(e) => setHerramienta(prev => ({ ...prev, color: e.target.value }))}
                      style={{
                        width: '50px',
                        height: '40px',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer'
                      }}
                    />
      </div>

                  {/* Grosor */}
      <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Grosor: {herramienta.grosor}px
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={herramienta.grosor}
                      onChange={(e) => setHerramienta(prev => ({ ...prev, grosor: parseInt(e.target.value) }))}
                      style={{ width: '100px' }}
                    />
                  </div>

                  {/* Controles de canvas */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Zoom</span>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => hacerZoom(-100, 400, 250)}
                          disabled={usuario.nombre === ''}
                          style={{ padding: '0.25rem 0.5rem' }}
                        >
                          ➖
                        </button>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.25rem 0.5rem',
                          background: 'var(--bg-secondary)',
                          borderRadius: 'var(--radius-sm)',
                          minWidth: '40px',
                          textAlign: 'center'
                        }}>
                          {Math.round(canvasState.zoom * 100)}%
                        </span>
                        <button
                          className="btn btn-sm"
                          onClick={() => hacerZoom(100, 400, 250)}
                          disabled={usuario.nombre === ''}
                          style={{ padding: '0.25rem 0.5rem' }}
                        >
                          ➕
                        </button>
                      </div>
                    </div>
                    
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={resetearCanvas}
                      disabled={usuario.nombre === ''}
                      title="Resetear zoom y posición (Ctrl+R)"
                    >
                      🔄 Reset
                    </button>
                    
          <button 
                      className="btn btn-danger"
            onClick={limpiarCanvas}
                      disabled={usuario.nombre === ''}
          >
            🗑️ Limpiar
          </button>
        </div>
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>🎨 Canvas de Dibujo</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    🖱️ Rueda: Zoom | Ctrl+Click: Pan | Ctrl+R: Reset
                  </div>
                </div>
              </div>
              <div className="card-body" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        <canvas
          ref={canvasRef}
                  width={800}
                  height={500}
                  className="canvas-responsive"
          style={{ 
                    border: '2px solid var(--border-color)',
                    cursor: dibujando ? 'crosshair' : (canvasState.zoom !== 1 ? 'grab' : 'default'),
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'white',
                    boxShadow: 'var(--shadow-lg)',
                    maxWidth: '100%',
                    maxHeight: '100%'
                  }}
                />
                
                {/* Indicador de zoom */}
                {canvasState.zoom !== 1 && (
                  <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    padding: '0.25rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: '500'
                  }}>
                    Zoom: {Math.round(canvasState.zoom * 100)}%
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;