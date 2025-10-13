import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:4000");

function App() {
  const [content, setContent] = useState("");
  const docId = "demo-doc";

  useEffect(() => {
    socket.emit("join-document", docId);

    socket.on("load-document", (data) => setContent(data));
    socket.on("receive-changes", (data) => setContent(data));

    const interval = setInterval(() => {
      socket.emit("save-document", content);
    }, 5000);

    return () => {
      clearInterval(interval);
      socket.off("load-document");
      socket.off("receive-changes");
    };
  }, [content, docId]);

  const handleChange = (e) => {
    const text = e.target.value;
    setContent(text);
    socket.emit("send-changes", text);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1> SyncScribe — Collaborative Document Editor</h1>
      <textarea
        value={content}
        onChange={handleChange}
        rows="20"
        cols="80"
        style={{
          width: "100%",
          height: "70vh",
          fontSize: "16px",
          borderRadius: "8px",
          padding: "10px",
        }}
      />
    </div>
  );
}

export default App;
