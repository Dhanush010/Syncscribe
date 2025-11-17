import { useState, useEffect } from "react";
import { getVersions, restoreVersion, createVersion } from "../api/documentService";

export default function VersionHistory({ documentId, onRestore, open, onClose }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && documentId) {
      loadVersions();
    }
  }, [open, documentId]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      const res = await getVersions(documentId);
      setVersions(res.data);
    } catch (err) {
      console.error("Failed to load versions", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveVersion = async () => {
    try {
      // This will be called from parent with current content
      await loadVersions();
    } catch (err) {
      console.error("Failed to save version", err);
    }
  };

  const handleRestore = async (versionId) => {
    if (!confirm("Restore this version? Current changes will be lost.")) return;
    
    try {
      await restoreVersion(versionId);
      onRestore();
      onClose();
    } catch (err) {
      console.error("Failed to restore version", err);
      alert("Failed to restore version");
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: "fixed",
      right: 0,
      top: 0,
      width: "350px",
      height: "100vh",
      background: "#222",
      color: "#fff",
      padding: "20px",
      overflowY: "auto",
      zIndex: 1000,
      boxShadow: "-2px 0 10px rgba(0,0,0,0.5)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2>Version History</h2>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            fontSize: "24px",
            cursor: "pointer"
          }}
        >
          ×
        </button>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : versions.length === 0 ? (
        <div style={{ color: "#888" }}>No versions yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {versions.map((version) => (
            <div
              key={version._id}
              style={{
                padding: "12px",
                background: "#333",
                borderRadius: "6px",
                border: "1px solid #555"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <div>
                  <div style={{ fontWeight: "bold" }}>{version.name || "Untitled"}</div>
                  <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
                    {new Date(version.createdAt).toLocaleString()}
                  </div>
                  {version.createdBy && (
                    <div style={{ fontSize: "12px", color: "#888" }}>
                      by {typeof version.createdBy === "object" ? version.createdBy.username : "Unknown"}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRestore(version._id)}
                  style={{
                    padding: "6px 12px",
                    background: "#1e90ff",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px"
                  }}
                >
                  Restore
                </button>
              </div>
              <div style={{
                fontSize: "12px",
                color: "#aaa",
                marginTop: "8px",
                maxHeight: "60px",
                overflow: "hidden"
              }}>
                {typeof version.content === "string" ? 
                  (version.content.length > 100 ? version.content.substring(0, 100) + "..." : version.content) :
                  "Delta content"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


