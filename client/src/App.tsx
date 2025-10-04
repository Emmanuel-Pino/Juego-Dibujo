import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

function App() {
  const [mensajes, setMensajes] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [conectado, setConectado] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Inicializar Socket.IO
  useEffect(() => {
    const socket = io("http://localhost:5000", {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Conectado al servidor con id:", socket.id);
      setConectado(true);
    });

    socket.on("disconnect", () => {
      console.log("❌ Desconectado del servidor");
      setConectado(false);
    });

    socket.on("mensaje", (data: string) => {
      console.log("💬 Mensaje recibido:", data);
      setMensajes((prev) => [...prev, data]);
    });

    socket.on("dibujo", ({ x, y, type }: { x: number; y: number; type: "start" | "draw" }) => {
      console.log("🎨 Dibujo recibido de otro cliente:", { x, y, type });
      const ctx = ctxRef.current;
      if (!ctx) return;

      if (type === "start") {
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else if (type === "draw") {
        ctx.lineTo(x, y);
        ctx.stroke();
      }
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
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    ctxRef.current = ctx;

    let dibujando = false;

    const empezarDibujo = (e: MouseEvent) => {
      dibujando = true;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
      console.log("🖊️ Empezando a dibujar en:", e.offsetX, e.offsetY);
      socketRef.current?.emit("dibujo", { x: e.offsetX, y: e.offsetY, type: "start" });
    };

    const dibujar = (e: MouseEvent) => {
      if (!dibujando) return;
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
      console.log("🖊️ Dibujando en:", e.offsetX, e.offsetY);
      socketRef.current?.emit("dibujo", { x: e.offsetX, y: e.offsetY, type: "draw" });
    };

    const terminarDibujo = () => {
      if (dibujando) {
        console.log("🖊️ Terminando dibujo");
      }
      dibujando = false;
    };

    canvas.addEventListener("mousedown", empezarDibujo);
    canvas.addEventListener("mousemove", dibujar);
    canvas.addEventListener("mouseup", terminarDibujo);
    canvas.addEventListener("mouseleave", terminarDibujo);

    return () => {
      canvas.removeEventListener("mousedown", empezarDibujo);
      canvas.removeEventListener("mousemove", dibujar);
      canvas.removeEventListener("mouseup", terminarDibujo);
      canvas.removeEventListener("mouseleave", terminarDibujo);
    };
  }, []);

  const enviarMensaje = () => {
    if (input.trim() === "") return;
    console.log("📤 Enviando mensaje:", input);
    socketRef.current?.emit("mensaje", input);
    setInput("");
  };

  const limpiarCanvas = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Juego-Dibujo 🚀</h1>
      
      {/* Estado de conexión */}
      <div style={{ 
        marginBottom: "20px", 
        padding: "10px", 
        backgroundColor: conectado ? "#d4edda" : "#f8d7da",
        border: `1px solid ${conectado ? "#c3e6cb" : "#f5c6cb"}`,
        borderRadius: "5px"
      }}>
        Estado: <strong>{conectado ? "✅ Conectado" : "❌ Desconectado"}</strong>
      </div>

      {/* Chat */}
      <div style={{ marginBottom: "20px" }}>
        <h2>Chat de prueba</h2>
        <div style={{ 
          border: "1px solid #ddd", 
          height: "200px", 
          overflowY: "scroll", 
          padding: "10px",
          backgroundColor: "#f9f9f9",
          borderRadius: "5px"
        }}>
          {mensajes.map((msg, idx) => (
            <p key={idx} style={{ margin: "5px 0" }}>💬 {msg}</p>
          ))}
        </div>
        <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
          <input 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && enviarMensaje()}
            placeholder="Escribe un mensaje"
            style={{ flex: 1, padding: "8px", borderRadius: "5px", border: "1px solid #ddd" }}
          />
          <button 
            onClick={enviarMensaje}
            style={{ padding: "8px 20px", borderRadius: "5px", cursor: "pointer" }}
          >
            Enviar
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Canvas de dibujo</h2>
          <button 
            onClick={limpiarCanvas}
            style={{ padding: "8px 20px", borderRadius: "5px", cursor: "pointer" }}
          >
            🗑️ Limpiar
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          style={{ 
            border: "2px solid #333", 
            cursor: "crosshair",
            borderRadius: "5px",
            backgroundColor: "white"
          }}
        ></canvas>
        <p style={{ marginTop: "10px", color: "#666", fontSize: "14px" }}>
          💡 Tip: Abre esta página en dos pestañas diferentes para probar el dibujo en tiempo real
        </p>
      </div>
    </div>
  );
}

export default App;