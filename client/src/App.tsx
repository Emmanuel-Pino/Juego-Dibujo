import { useEffect } from "react";
import { io } from "socket.io-client";

function App() {
  useEffect(() => {
    const socket = io("http://localhost:3000");

    socket.on("connect", () => {
      console.log("✅ Conectado al servidor con id:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("❌ Desconectado del servidor");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return <h1>Cliente conectado a Socket.IO 🚀</h1>;
}

export default App;
