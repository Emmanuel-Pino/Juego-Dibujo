import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

function App() {
  const [mensajes, setMensajes] = useState<string[]>([]);
  const [input, setInput] = useState("");

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io("http://localhost:3000");
    socketRef.current = socket;

    // Conexión al servidor
    socket.on("connect", () => {
      console.log("✅ Conectado al servidor con id:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("❌ Desconectado del servidor");
    });

    // Chat
    socket.on("mensaje", (data: string) => {
      setMensajes((prev) => [...prev, data]);
    });

    // Canvas: recibir coordenadas de otros jugadores
    socket.on("dibujo", ({ x, y, type }: { x: number; y: number; type: "start" | "draw" }) => {
      const canvas = document.getElementById("canvas") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
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

  const enviarMensaje = () => {
    if (input.trim() === "") return;
    socketRef.current?.emit("mensaje", input);
    setInput("");
  };

  // Canvas: eventos de dibujo local
  useEffect(() => {
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dibujando = false;

    const empezarDibujo = (e: MouseEvent) => {
      dibujando = true;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
      socketRef.current?.emit("dibujo", { x: e.offsetX, y: e.offsetY, type: "start" });
    };

    const dibujar = (e: MouseEvent) => {
      if (!dibujando) return;
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
      socketRef.current?.emit("dibujo", { x: e.offsetX, y: e.offsetY, type: "draw" });
    };

    const terminarDibujo = () => {
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

  return (
    <div style={{ padding: "20px" }}>
      <h1>Juego-Dibujo 🚀</h1>

      {/* Chat */}
      <div style={{ marginBottom: "20px" }}>
        <h2>Chat de prueba</h2>
        <div style={{ border: "1px solid black", height: "200px", overflowY: "scroll", padding: "10px" }}>
          {mensajes.map((msg, idx) => (
            <p key={idx}>{msg}</p>
          ))}
        </div>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escribe un mensaje" />
        <button onClick={enviarMensaje}>Enviar</button>
      </div>

      {/* Canvas */}
      <div>
        <h2>Canvas de dibujo</h2>
        <canvas
          id="canvas"
          width={600}
          height={400}
          style={{ border: "1px solid black", cursor: "crosshair" }}
        ></canvas>
      </div>
    </div>
  );
}

export default App;
