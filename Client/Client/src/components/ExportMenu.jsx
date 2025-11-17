import { useState, useRef, useEffect } from "react";

export default function ExportMenu({ onExport }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const formats = [
    { id: "pdf", label: "PDF" },
    { id: "docx", label: "DOCX" },
    { id: "txt", label: "TXT" },
    { id: "md", label: "Markdown" }
  ];

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        style={{ padding: "6px 12px", background: "#3742fa", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
      >
        Export ▼
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          background: "#333",
          padding: "8px",
          borderRadius: "4px",
          marginTop: "4px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          zIndex: 1000,
          minWidth: "120px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
        }}>
          {formats.map((format) => (
            <button
              key={format.id}
              onClick={() => {
                onExport(format.id);
                setOpen(false);
              }}
              style={{
                padding: "6px 12px",
                background: "#444",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => e.target.style.background = "#555"}
              onMouseLeave={(e) => e.target.style.background = "#444"}
            >
              {format.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


