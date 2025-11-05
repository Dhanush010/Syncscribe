import { useEffect, useState, useRef } from "react";
import Sidebar from "./components/Sidebar";
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
} from "./api/documentService";

// ✅ FIXED: This should be a STRING, not new WebSocket()
const WS_URL = "ws://localhost:5000";

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const saveTimer = useRef(null);
  const ws = useRef(null);

  // ✅ WebSocket Connection Setup
  useEffect(() => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => console.log("✅ WebSocket Connected");

    ws.current.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      if (data.type === "DOC_UPDATE" && selectedDoc) {
        setSelectedDoc((prev) => ({ ...prev, content: data.content }));
      }
    };

    ws.current.onclose = () => console.log("❌ WebSocket Disconnected");

    return () => ws.current?.close();
  }, [selectedDoc]);

  useEffect(() => {
    loadDocs();
  }, []);

  const loadDocs = async () => {
    const res = await getDocuments();
    setDocuments(res.data);
  };

  const handleCreate = async () => {
    const res = await createDocument({
      title: "Untitled Document",
      content: "",
    });

    await loadDocs();
    setSelectedDoc(res.data);
  };

  const handleSelect = async (docId) => {
    const res = await getDocuments();
    const freshDocs = res.data;
    setDocuments(freshDocs);

    const doc = freshDocs.find((d) => d._id === docId);
    setSelectedDoc(doc);

    ws.current?.send(
      JSON.stringify({ type: "JOIN_DOC", docId })
    );
  };

  const handleDelete = async (docId) => {
    await deleteDocument(docId);
    await loadDocs();
    setSelectedDoc(null);
  };

  const handleRename = async (id, title) => {
    const doc = documents.find((d) => d._id === id);
    const updatedDoc = { ...doc, title };

    await updateDocument(id, updatedDoc);

    setDocuments((prev) =>
      prev.map((d) => (d._id === id ? updatedDoc : d))
    );

    if (selectedDoc && selectedDoc._id === id) {
      setSelectedDoc(updatedDoc);
    }
  };

  const handleChange = (content) => {
    const updatedDoc = { ...selectedDoc, content };
    setSelectedDoc(updatedDoc);
    setSaving(true);

    // ✅ Realtime sync updates other clients
    ws.current?.send(
      JSON.stringify({
        type: "UPDATE_DOC",
        docId: updatedDoc._id,
        content,
      })
    );

    // ✅ Auto save to DB
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      await updateDocument(updatedDoc._id, updatedDoc);
      setSaving(false);
      setLastSaved(new Date());
    }, 600);
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1e1e1e" }}>
      <Sidebar
        documents={documents}
        selectedId={selectedDoc?._id}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onRename={handleRename}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {selectedDoc && (
          <div
            style={{
              height: "30px",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              padding: "0 15px",
              fontSize: "14px",
              color: "#ccc",
              background: "#222",
              borderBottom: "1px solid #444",
            }}
          >
            {saving
              ? "Saving… 💾"
              : lastSaved
              ? `Saved at ${lastSaved.toLocaleTimeString()} ✅`
              : "Ready ✅"}
          </div>
        )}

        <div style={{ flex: 1, padding: "10px" }}>
          {selectedDoc ? (
            <textarea
              style={{
                width: "100%",
                height: "100%",
                fontSize: "18px",
                padding: "12px",
                border: "1px solid #444",
                background: "#121212",
                color: "white",
                resize: "none",
                outline: "none",
              }}
              value={selectedDoc.content}
              onChange={(e) => handleChange(e.target.value)}
            />
          ) : (
            <p style={{ fontSize: "18px", color: "#aaa" }}>
              Select or create a document to start editing
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
