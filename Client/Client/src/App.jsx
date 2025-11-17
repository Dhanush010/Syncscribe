// src/App.jsx
import { useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import Login from "./components/Login";
import PresenceAvatars from "./components/PresenceAvatars";
import VersionHistory from "./components/VersionHistory";
import CommentsPanel from "./components/CommentsPanel";
import ExportMenu from "./components/ExportMenu";
import {
  getDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  shareDocument,
  generateShareLink,
  verifyToken,
  createVersion,
  exportDocument,
} from "./api/documentService";

import Quill from "quill";
import "quill/dist/quill.snow.css";
import QuillCursors from "quill-cursors";
import Delta from "quill-delta";

// Only register cursors module once (prevents warning in React strict mode)
// Check if already registered by trying to import it
try {
  Quill.import("modules/cursors");
} catch (e) {
  // Not registered yet, register it now
  Quill.register("modules/cursors", QuillCursors);
}

const WS_URL = "ws://localhost:5000";
const RECONNECT_DELAY = 2000;

// minimal toolbar
const minimalToolbar = [
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [users, setUsers] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [showShare, setShowShare] = useState(false);

  const wsRef = useRef(null);
  const quillRef = useRef(null);
  const editorContainerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const usernameRef = useRef(null);
  const colorRef = useRef(null);
  const selectedDocRef = useRef(null);
  const connectedRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const highlightsRef = useRef({});
  const userIdRef = useRef(null);
  const authenticatedRef = useRef(false);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    
    if (token && storedUser) {
      verifyToken()
        .then((res) => {
          setUser(res.data.user);
          setAuthenticated(true);
          authenticatedRef.current = true;
          userIdRef.current = res.data.user.id;
        })
        .catch(() => {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        });
    }
  }, []);

  // WebSocket connection with auto-reconnect
  const connectWebSocket = () => {
    // Don't create new connection if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Close existing connection if in closing/closed state before creating new one
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CLOSING || wsRef.current.readyState === WebSocket.CLOSED)) {
      wsRef.current = null;
    }

    const token = localStorage.getItem("token");
    const ws = new WebSocket(`${WS_URL}?token=${token || ""}`);

    ws.onopen = () => {
      console.log("✅ WS Connected");
      connectedRef.current = true;
      setReconnecting(false);
      
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      // Re-join document if one was selected
      // This will send DOC_SYNC with latest content from server (authoritative)
      // Don't restore from localStorage here - let server content be the source of truth
      if (selectedDocRef.current) {
        ws.send(JSON.stringify({ type: "JOIN_DOC", docId: selectedDocRef.current._id }));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);

        if (data.type === "ASSIGN_ID") {
          usernameRef.current = data.username;
          colorRef.current = data.color;
        }

        if (data.type === "USER_LIST") {
          setUsers(data.users || []);
        }

        if (data.type === "DOC_SYNC") {
          if (!quillRef.current) return;
          
          // Always apply DOC_SYNC if it's for the currently selected document
          // This ensures users always see the latest content from the database when joining
          if (data.docId && selectedDocRef.current && data.docId === selectedDocRef.current._id) {
            try {
              let contentToSet;
              if (typeof data.content === "string") {
                try {
                  contentToSet = JSON.parse(data.content);
                } catch {
                  contentToSet = data.content;
                }
              } else {
                contentToSet = data.content;
              }
              
              // Apply the content
              if (contentToSet && typeof contentToSet === "object" && contentToSet.ops) {
                quillRef.current.setContents(contentToSet, "silent");
              } else if (typeof contentToSet === "string") {
                quillRef.current.setText(contentToSet || "", "silent");
              } else {
                quillRef.current.setContents({ ops: [] }, "silent");
              }

              // Clear unsaved changes after sync - server content is authoritative
              localStorage.removeItem(`unsaved_${selectedDocRef.current._id}`);
            } catch (err) {
              console.error("Error applying DOC_SYNC:", err);
              // Fallback to text
              if (typeof data.content === "string") {
                quillRef.current.setText(data.content || "", "silent");
              }
            }
          }
        }

        if (data.type === "DOC_UPDATE" && data.delta) {
          // Ignore updates from self
          if (data.userId && userIdRef.current && data.userId === userIdRef.current) return;
          if (data.username && usernameRef.current && data.username === usernameRef.current) return;
          if (!quillRef.current) return;
          
          // Only apply if this update is for the currently selected document
          if (data.docId && selectedDocRef.current && data.docId !== selectedDocRef.current._id) return;

          try {
            const delta = new Delta(data.delta.ops || data.delta);
            quillRef.current.updateContents(delta, "silent");
            
            // Update localStorage with the new content
            if (selectedDocRef.current) {
              const content = quillRef.current.getContents();
              localStorage.setItem(`unsaved_${selectedDocRef.current._id}`, JSON.stringify(content));
            }
          } catch (err) {
            console.warn("Delta apply failed, reloading doc", err);
            // Fallback: reload from server
            if (selectedDocRef.current) {
              getDocumentById(selectedDocRef.current._id).then((res) => {
                const doc = res.data;
                try {
                  quillRef.current.setContents(JSON.parse(doc.content), "silent");
                } catch {
                  quillRef.current.setText(doc.content || "");
                }
              }).catch(() => {});
            }
          }
        }

        if (data.type === "CURSOR_MOVE") {
          if (!quillRef.current) return;
          if (data.userId && userIdRef.current && data.userId === userIdRef.current) return;
          if (data.username && usernameRef.current && data.username === usernameRef.current) return;
          
          const cursors = quillRef.current.getModule("cursors");
          try {
            cursors.createCursor(data.username, data.username, data.color);
            cursors.moveCursor(data.username, { index: data.index, length: data.length || 0 });
          } catch {}
        }

        if (data.type === "HIGHLIGHT_TEXT") {
          if (!quillRef.current || data.userId === userIdRef.current) return;
          const range = quillRef.current.getSelection(true);
          const existing = quillRef.current.getFormat(range);
          
          quillRef.current.formatText(data.index, data.length, "background", data.color);
          highlightsRef.current[data.userId] = { index: data.index, length: data.length, color: data.color };
        }

        if (data.type === "HIGHLIGHTS_SYNC") {
          if (data.highlights) {
            data.highlights.forEach((h) => {
              if (h.userId !== userIdRef.current && quillRef.current) {
                quillRef.current.formatText(h.index, h.length, "background", h.color);
                highlightsRef.current[h.userId] = h;
              }
            });
          }
        }

        if (data.type === "REMOVE_HIGHLIGHT") {
          if (highlightsRef.current[data.userId] && quillRef.current) {
            const h = highlightsRef.current[data.userId];
            quillRef.current.formatText(h.index, h.length, "background", false);
            delete highlightsRef.current[data.userId];
          }
        }

        if (data.type === "COMMENT_ADDED" || data.type === "COMMENT_UPDATED" || data.type === "COMMENT_DELETED") {
          // Comments panel will handle this if open
          if (showComments) {
            // Trigger reload in CommentsPanel
          }
        }
      } catch (e) {
        console.error("WS parse error", e);
      }
    };

    ws.onclose = (event) => {
      console.log("❌ WS Closed", event.code, event.reason);
      connectedRef.current = false;
      
      // Don't reconnect if this was a normal closure (code 1000) or if we're not authenticated
      if (event.code === 1000 || !authenticatedRef.current) {
        setReconnecting(false);
        return;
      }
      
      // Only reconnect for unexpected closures
      setReconnecting(true);
      
      // Clear any existing reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      
      // Auto-reconnect after delay, but only if still authenticated and no active connection
      reconnectTimerRef.current = setTimeout(() => {
        if (authenticatedRef.current && 
            (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
          connectWebSocket();
        } else {
          setReconnecting(false);
        }
      }, RECONNECT_DELAY);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    wsRef.current = ws;
  };

  useEffect(() => {
    if (!authenticated) {
      // Clean up if not authenticated
      if (wsRef.current) {
        wsRef.current.close(1000, "Not authenticated");
        wsRef.current = null;
      }
      return;
    }

    // Only connect if not already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Small delay to prevent rapid reconnections in React Strict Mode
    const connectTimer = setTimeout(() => {
      if (authenticated && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
        connectWebSocket();
      }
    }, 100);

    return () => {
      clearTimeout(connectTimer);
      // Cleanup: clear reconnect timer and close connection
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        // Remove event listeners to prevent reconnection attempts
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close(1000, "Component unmounting");
        }
        wsRef.current = null;
      }
    };
  }, [authenticated]);

  // Load documents
  useEffect(() => {
    if (authenticated) {
      loadDocs();
    }
  }, [authenticated]);

  const loadDocs = async () => {
    try {
      const res = await getDocuments();
      setDocuments(res.data);
    } catch (err) {
      console.error("Failed to load docs", err);
    }
  };

  // Initialize Quill
  useEffect(() => {
    if (!editorContainerRef.current || !authenticated) return;
    if (quillRef.current) return;

    quillRef.current = new Quill(editorContainerRef.current, {
      theme: "snow",
      modules: {
        toolbar: minimalToolbar,
        cursors: true,
      },
    });

    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
      .ql-editor { background: #121212; color: #fff; min-height: 300px; }
      .ql-container.ql-snow { background: #1e1e1e; }
      .ql-toolbar.ql-snow { background: #2a2a2a; color: #fff; }
      .ql-editor p { color: #fff; }
    `;
    document.head.appendChild(styleSheet);

    // Text change handler
    quillRef.current.on("text-change", (delta, oldDelta, source) => {
      if (source !== "user") return;
      const currentDoc = selectedDocRef.current;
      if (!currentDoc) return;

      // Save to localStorage for offline support
      const content = quillRef.current.getContents();
      if (currentDoc._id) {
        localStorage.setItem(`unsaved_${currentDoc._id}`, JSON.stringify(content));
      }

      // Send delta over WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "UPDATE_DOC",
          docId: currentDoc._id,
          delta: { ops: delta.ops },
          username: usernameRef.current,
        }));
      }

      // Debounced save to server
      setSaving(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const fullDelta = quillRef.current.getContents();
          await updateDocument(currentDoc._id, { ...currentDoc, content: JSON.stringify(fullDelta) });
          setLastSaved(new Date());
          
          // Clear unsaved after successful save
          localStorage.removeItem(`unsaved_${currentDoc._id}`);
        } catch (err) {
          console.error("Save failed", err);
        } finally {
          setSaving(false);
        }
      }, 600);
    });

    // Selection change - cursor and highlight
    quillRef.current.on("selection-change", (range, oldRange, source) => {
      if (source !== "user") return;
      const currentDoc = selectedDocRef.current;
      if (!currentDoc) return;

      if (range && range.length > 0) {
        // Send highlight
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "HIGHLIGHT_TEXT",
            docId: currentDoc._id,
            index: range.index,
            length: range.length,
          }));
        }
      } else if (oldRange && oldRange.length > 0) {
        // Remove highlight when selection is cleared
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "REMOVE_HIGHLIGHT",
            docId: currentDoc._id,
          }));
        }
      }

      // Send cursor position
      if (range && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "CURSOR_MOVE",
          docId: currentDoc._id,
          username: usernameRef.current,
          color: colorRef.current,
          index: range.index,
          length: range.length || 0,
        }));
      }
    });

    // If a document is already selected when Quill initializes, load it
    if (selectedDocRef.current) {
      const loadSelectedDoc = async () => {
        try {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "JOIN_DOC", docId: selectedDocRef.current._id }));
          } else {
            const res = await getDocumentById(selectedDocRef.current._id);
            const doc = res.data;
            if (doc?.content) {
              try {
                const parsed = typeof doc.content === "string" ? JSON.parse(doc.content) : doc.content;
                if (parsed && typeof parsed === "object" && parsed.ops) {
                  quillRef.current.setContents(parsed, "silent");
                } else {
                  quillRef.current.setText(doc.content || "", "silent");
                }
              } catch {
                quillRef.current.setText(doc.content || "", "silent");
              }
            }
          }
        } catch (err) {
          console.error("Error loading selected document on Quill init:", err);
        }
      };
      loadSelectedDoc();
    }
  }, [authenticated]);

  // Handle document selection
  useEffect(() => {
    if (!selectedDoc || !authenticated) {
      selectedDocRef.current = null;
      return;
    }

    selectedDocRef.current = selectedDoc;

    // Wait for Quill to be initialized
    if (!quillRef.current) {
      console.log("Waiting for Quill to initialize...");
      return;
    }

    // Clear current content first to avoid showing stale content
    quillRef.current.setText("", "silent");

    // Function to load document content
    const loadDocumentContent = async () => {
      try {
        // Always try to join via WebSocket first - it will send DOC_SYNC with latest content
        // This ensures all users see the same content from the database
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          // Join document via WebSocket - server will send DOC_SYNC with latest content from DB
          wsRef.current.send(JSON.stringify({ type: "JOIN_DOC", docId: selectedDoc._id }));
        } else {
          // Fallback: Load from server if WebSocket not ready yet
          // This will be overwritten by DOC_SYNC when WebSocket connects
          const res = await getDocumentById(selectedDoc._id);
          const doc = res.data;
          if (doc?.content && quillRef.current) {
            try {
              const parsed = typeof doc.content === "string" ? JSON.parse(doc.content) : doc.content;
              if (parsed && typeof parsed === "object" && parsed.ops) {
                quillRef.current.setContents(parsed, "silent");
              } else {
                quillRef.current.setText(doc.content || "", "silent");
              }
            } catch {
              quillRef.current.setText(doc.content || "", "silent");
            }
          } else if (quillRef.current) {
            quillRef.current.setText("", "silent");
          }
        }
      } catch (err) {
        console.error("Could not fetch doc from server", err);
        if (quillRef.current) {
          quillRef.current.setText("", "silent");
        }
      }
    };

    loadDocumentContent();
  }, [selectedDoc, authenticated]);

  // CRUD handlers
  const handleCreate = async () => {
    try {
      const res = await createDocument({ title: "Untitled Document", content: "" });
      await loadDocs();
      setSelectedDoc(res.data);
    } catch (err) {
      console.error("create failed", err);
    }
  };

  const handleSelect = async (docId) => {
    try {
      // Leave current document if one is selected
      if (selectedDocRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "LEAVE_DOC", docId: selectedDocRef.current._id }));
      }
      
      // Try to find document in current list first
      let doc = documents.find(d => d._id === docId);
      
      // If not found, fetch fresh list
      if (!doc) {
        const fresh = await getDocuments().catch(() => ({ data: documents }));
        doc = (fresh.data || documents).find(d => d._id === docId);
      }
      
      // If still not found, fetch directly by ID
      if (!doc) {
        const res = await getDocumentById(docId);
        doc = res.data;
      }
      
      if (doc) {
        setSelectedDoc(doc);
      } else {
        console.error("Document not found:", docId);
      }
    } catch (err) {
      console.error("Error selecting document:", err);
    }
  };

  const handleDelete = async (docId) => {
    localStorage.removeItem(`unsaved_${docId}`);
    await deleteDocument(docId).catch(() => {});
    await loadDocs();
    if (selectedDoc?._id === docId) setSelectedDoc(null);
  };

  const handleRename = async (id, title) => {
    const doc = documents.find((d) => d._id === id);
    if (!doc) return;
    const updated = { ...doc, title };
    await updateDocument(id, updated).catch(() => {});
    await loadDocs();
    if (selectedDocRef.current?._id === id) setSelectedDoc(updated);
  };

  const handleShare = async () => {
    if (!selectedDoc) return;
    
    if (shareEmail) {
      try {
        await shareDocument(selectedDoc._id, { email: shareEmail, role: "editor" });
        alert(`Document shared with ${shareEmail}`);
        setShareEmail("");
      } catch (err) {
        alert(err.response?.data?.error || "Failed to share");
      }
    }
  };

  const handleGenerateLink = async () => {
    if (!selectedDoc) return;
    
    try {
      const res = await generateShareLink(selectedDoc._id);
      setShareLink(res.data.shareLink);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to generate link");
    }
  };

  const handleExport = async (format) => {
    if (!selectedDoc) return;
    
    try {
      const url = `http://localhost:5000/api/export/${format}/${selectedDoc._id}`;
      const token = localStorage.getItem("token");
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${selectedDoc.title || "document"}.${format === "md" ? "md" : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert("Failed to export document");
    }
  };

  const handleSaveVersion = async () => {
    if (!selectedDoc || !quillRef.current) return;
    
    try {
      const content = quillRef.current.getContents();
      await createVersion({
        documentId: selectedDoc._id,
        content: JSON.stringify(content),
        name: `Manual save ${new Date().toLocaleString()}`
      });
      alert("Version saved!");
    } catch (err) {
      alert("Failed to save version");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setAuthenticated(false);
    authenticatedRef.current = false;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "User logged out");
      wsRef.current = null;
    }
  };

  if (!authenticated) {
    return <Login onLogin={(userData) => { 
      setUser(userData); 
      setAuthenticated(true); 
      authenticatedRef.current = true;
      userIdRef.current = userData.id; 
    }} />;
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#171717" }}>
      <Sidebar
        documents={documents}
        selectedId={selectedDoc?._id}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onRename={handleRename}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          background: "#222",
          color: "#ddd",
          borderBottom: "1px solid #333"
        }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <PresenceAvatars 
              users={users} 
              currentUserId={userIdRef.current}
              currentUsername={usernameRef.current}
            />
            {reconnecting && (
              <span style={{ color: "#ffa502", fontSize: "12px" }}>Reconnecting...</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {selectedDoc && (
              <>
                <button
                  onClick={() => setShowShare(!showShare)}
                  style={{ padding: "6px 12px", background: "#1e90ff", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                >
                  Share
                </button>
                <button
                  onClick={() => setShowVersions(!showVersions)}
                  style={{ padding: "6px 12px", background: "#ffa502", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                >
                  Versions
                </button>
                <button
                  onClick={() => setShowComments(!showComments)}
                  style={{ padding: "6px 12px", background: "#28a745", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                >
                  Comments
                </button>
                <ExportMenu onExport={handleExport} />
                <button
                  onClick={handleSaveVersion}
                  style={{ padding: "6px 12px", background: "#2ed573", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                >
                  Save Version
                </button>
              </>
            )}
            <div style={{ fontSize: 14 }}>
              {saving ? "Saving…" : (lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : "Ready")}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>{user?.username}</span>
              <button
                onClick={handleLogout}
                style={{ padding: "4px 8px", background: "#ff4757", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Editor area */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div
            ref={editorContainerRef}
            style={{ height: "100%", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* Share Modal */}
      {showShare && (
        <div style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#222",
          padding: "24px",
          borderRadius: "8px",
          zIndex: 2000,
          color: "#fff",
          minWidth: "400px"
        }}>
          <h3 style={{ marginBottom: "16px" }}>Share Document</h3>
          <div style={{ marginBottom: "16px" }}>
            <input
              type="email"
              placeholder="Enter email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              style={{ width: "100%", padding: "8px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: "4px" }}
            />
            <button
              onClick={handleShare}
              style={{ marginTop: "8px", padding: "8px 16px", background: "#1e90ff", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
            >
              Share
            </button>
          </div>
          <div>
            <button
              onClick={handleGenerateLink}
              style={{ padding: "8px 16px", background: "#28a745", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", marginBottom: "8px" }}
            >
              Generate Share Link
            </button>
            {shareLink && (
              <div style={{ padding: "8px", background: "#333", borderRadius: "4px", wordBreak: "break-all", fontSize: "12px" }}>
                {shareLink}
              </div>
            )}
          </div>
          <button
            onClick={() => { setShowShare(false); setShareLink(""); }}
            style={{ marginTop: "16px", padding: "6px 12px", background: "#666", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      )}

      {/* Version History Panel */}
      {showVersions && (
        <VersionHistory
          documentId={selectedDoc?._id}
          open={showVersions}
          onClose={() => setShowVersions(false)}
          onRestore={() => {
            if (selectedDoc) {
              getDocumentById(selectedDoc._id).then((res) => {
                const doc = res.data;
                if (quillRef.current && doc.content) {
                  try {
                    quillRef.current.setContents(JSON.parse(doc.content), "silent");
                  } catch {
                    quillRef.current.setText(doc.content || "");
                  }
                }
              });
            }
          }}
        />
      )}

      {/* Comments Panel */}
      {showComments && (
        <CommentsPanel
          documentId={selectedDoc?._id}
          quill={quillRef.current}
          currentUser={user}
          open={showComments}
          onClose={() => setShowComments(false)}
        />
      )}
    </div>
  );
}
