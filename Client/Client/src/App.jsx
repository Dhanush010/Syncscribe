import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
} from "./api/documentService";

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);

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
      content: ""
    });

    await loadDocs();
    setSelectedDoc(res.data);
  };

  const handleSelect = (docId) => {
    const doc = documents.find((d) => d._id === docId);
    setSelectedDoc(doc);
  };

  const handleDelete = async (docId) => {
    await deleteDocument(docId);
    await loadDocs();
    setSelectedDoc(null);
  };

  const handleRename = async (id, title) => {
    await updateDocument(id, { title });

    setDocuments((prev) =>
      prev.map((doc) => (doc._id === id ? { ...doc, title } : doc))
    );

    if (selectedDoc && selectedDoc._id === id) {
      setSelectedDoc((prev) => ({ ...prev, title }));
    }
  };

  const handleChange = async (content) => {
    const updatedDoc = { ...selectedDoc, content };
    setSelectedDoc(updatedDoc);

    setDocuments((prev) =>
      prev.map((doc) => (doc._id === updatedDoc._id ? updatedDoc : doc))
    );

    await updateDocument(updatedDoc._id, updatedDoc);
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Sidebar
        documents={documents}
        selectedId={selectedDoc?._id}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onRename={handleRename}
      />

      <div style={{ flex: 1, padding: "10px" }}>
        {selectedDoc ? (
          <textarea
            style={{
              width: "100%",
              height: "100%",
              fontSize: "18px",
              padding: "10px",
              border: "1px solid #ccc",
              resize: "none"
            }}
            value={selectedDoc.content}
            onChange={(e) => handleChange(e.target.value)}
          />
        ) : (
          <p style={{ fontSize: "18px" }}>
            Select or create a document to start editing
          </p>
        )}
      </div>
    </div>
  );
}
