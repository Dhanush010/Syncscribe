import { useState } from "react";
import { FaTrash } from "react-icons/fa";

const Sidebar = ({ documents, onSelect, onCreate, onDelete, selectedId, onRename }) => {
  const [editId, setEditId] = useState(null);
  const [tempTitle, setTempTitle] = useState("");

  const startEditing = (doc) => {
    setEditId(doc._id);
    setTempTitle(doc.title);
  };

  const finishEditing = (doc) => {
    setEditId(null);
    if (tempTitle.trim() !== "" && tempTitle !== doc.title) {
      onRename(doc._id, tempTitle);
    }
  };

  return (
    <div style={{ width: "260px", background: "#000", color: "#fff", padding: "12px" }}>
      <button 
        onClick={onCreate}
        style={{ width: "100%", padding: "10px", background: "#28a745", color: "#fff", borderRadius: "6px", border: "none", cursor: "pointer" }}
      >
        + New Document
      </button>

      <h3 style={{ marginTop: "15px" }}>Documents</h3>

      {documents.map((doc) => (
        <div 
          key={doc._id}
          onClick={() => onSelect(doc._id)}
          style={{
            padding: "8px",
            margin: "6px 0",
            background: doc._id === selectedId ? "#333" : "#111",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer"
          }}
        >
          {editId === doc._id ? (
            <input
              value={tempTitle}
              autoFocus
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={() => finishEditing(doc)}
              onKeyDown={(e) => e.key === "Enter" && finishEditing(doc)}
              style={{ flex: 1, background: "#222", color: "#fff", border: "1px solid #555", borderRadius: "4px", padding: "2px" }}
            />
          ) : (
            <span onDoubleClick={() => startEditing(doc)}>{doc.title}</span>
          )}

          <FaTrash
            onClick={(e) => {
              e.stopPropagation();
              onDelete(doc._id);
            }}
            style={{ color: "red", cursor: "pointer", marginLeft: "8px" }}
          />
        </div>
      ))}
    </div>
  );
};

export default Sidebar;
