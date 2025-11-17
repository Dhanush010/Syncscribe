import { useState, useEffect } from "react";
import { getComments, createComment, updateComment, deleteComment } from "../api/documentService";

export default function CommentsPanel({ documentId, quill, currentUser, open, onClose }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [selectedRange, setSelectedRange] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    if (open && documentId) {
      loadComments();
    }
  }, [open, documentId]);

  const loadComments = async () => {
    try {
      const res = await getComments(documentId);
      setComments(res.data);
    } catch (err) {
      console.error("Failed to load comments", err);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !quill) return;

    const selection = quill.getSelection(true);
    if (!selection) {
      alert("Please select text to comment on");
      return;
    }

    const selectedText = quill.getText(selection.index, selection.length);

    try {
      const res = await createComment({
        documentId,
        text: newComment,
        selection: {
          index: selection.index,
          length: selection.length,
          text: selectedText
        }
      });
      setComments([...comments, res.data]);
      setNewComment("");
    } catch (err) {
      console.error("Failed to create comment", err);
      alert("Failed to create comment");
    }
  };

  const handleReply = async (parentId) => {
    if (!replyText.trim()) return;

    try {
      const res = await createComment({
        documentId,
        text: replyText,
        parentId
      });
      await loadComments();
      setReplyingTo(null);
      setReplyText("");
    } catch (err) {
      console.error("Failed to reply", err);
      alert("Failed to reply");
    }
  };

  const handleResolve = async (commentId, resolved) => {
    try {
      await updateComment(commentId, { resolved: !resolved });
      await loadComments();
    } catch (err) {
      console.error("Failed to update comment", err);
    }
  };

  const handleDelete = async (commentId) => {
    if (!confirm("Delete this comment?")) return;
    
    try {
      await deleteComment(commentId);
      await loadComments();
    } catch (err) {
      console.error("Failed to delete comment", err);
      alert("Failed to delete comment");
    }
  };

  const highlightSelection = (index, length) => {
    if (!quill) return;
    quill.setSelection(index, length);
    quill.scrollIntoView();
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
        <h2>Comments</h2>
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

      <div style={{ marginBottom: "20px" }}>
        <textarea
          placeholder="Select text and add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          style={{
            width: "100%",
            minHeight: "80px",
            padding: "10px",
            background: "#333",
            color: "#fff",
            border: "1px solid #555",
            borderRadius: "4px",
            resize: "vertical"
          }}
        />
        <button
          onClick={handleAddComment}
          disabled={!newComment.trim()}
          style={{
            marginTop: "8px",
            padding: "8px 16px",
            background: "#28a745",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: newComment.trim() ? "pointer" : "not-allowed",
            opacity: newComment.trim() ? 1 : 0.5
          }}
        >
          Add Comment
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {comments.map((comment) => (
          <div
            key={comment._id}
            style={{
              padding: "12px",
              background: comment.resolved ? "#2a2a2a" : "#333",
              borderRadius: "6px",
              border: "1px solid #555",
              opacity: comment.resolved ? 0.6 : 1
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <div>
                <div style={{ fontWeight: "bold" }}>
                  {typeof comment.author === "object" ? comment.author.username : "Unknown"}
                </div>
                <div style={{ fontSize: "12px", color: "#888" }}>
                  {new Date(comment.createdAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {comment.author?.id === currentUser?.id && (
                  <button
                    onClick={() => handleDelete(comment._id)}
                    style={{
                      background: "#ff4757",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => handleResolve(comment._id, comment.resolved)}
                  style={{
                    background: comment.resolved ? "#ffa502" : "#28a745",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontSize: "12px"
                  }}
                >
                  {comment.resolved ? "Unresolve" : "Resolve"}
                </button>
              </div>
            </div>

            {comment.selection && (
              <div
                onClick={() => highlightSelection(comment.selection.index, comment.selection.length)}
                style={{
                  fontSize: "12px",
                  color: "#1e90ff",
                  cursor: "pointer",
                  marginBottom: "8px",
                  padding: "4px",
                  background: "#2a2a2a",
                  borderRadius: "4px"
                }}
              >
                "{comment.selection.text.substring(0, 50)}..."
              </div>
            )}

            <div style={{ marginBottom: "8px" }}>{comment.text}</div>

            {comment.replies && comment.replies.length > 0 && (
              <div style={{ marginLeft: "20px", marginTop: "8px" }}>
                {comment.replies.map((reply) => (
                  <div
                    key={reply._id}
                    style={{
                      padding: "8px",
                      background: "#2a2a2a",
                      borderRadius: "4px",
                      marginBottom: "8px"
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: "bold" }}>
                      {typeof reply.author === "object" ? reply.author.username : "Unknown"}
                    </div>
                    <div style={{ fontSize: "11px", color: "#888" }}>
                      {new Date(reply.createdAt).toLocaleString()}
                    </div>
                    <div style={{ fontSize: "13px", marginTop: "4px" }}>{reply.text}</div>
                  </div>
                ))}
              </div>
            )}

            {replyingTo === comment._id ? (
              <div style={{ marginTop: "8px" }}>
                <textarea
                  placeholder="Write a reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: "60px",
                    padding: "8px",
                    background: "#2a2a2a",
                    color: "#fff",
                    border: "1px solid #555",
                    borderRadius: "4px",
                    fontSize: "12px"
                  }}
                />
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <button
                    onClick={() => handleReply(comment._id)}
                    disabled={!replyText.trim()}
                    style={{
                      padding: "4px 12px",
                      background: "#1e90ff",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      cursor: replyText.trim() ? "pointer" : "not-allowed",
                      opacity: replyText.trim() ? 1 : 0.5,
                      fontSize: "12px"
                    }}
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => {
                      setReplyingTo(null);
                      setReplyText("");
                    }}
                    style={{
                      padding: "4px 12px",
                      background: "#666",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setReplyingTo(comment._id)}
                style={{
                  marginTop: "8px",
                  padding: "4px 12px",
                  background: "none",
                  color: "#1e90ff",
                  border: "1px solid #1e90ff",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                Reply
              </button>
            )}
          </div>
        ))}
      </div>

      {comments.length === 0 && (
        <div style={{ color: "#888", textAlign: "center", marginTop: "40px" }}>
          No comments yet. Select text and add a comment!
        </div>
      )}
    </div>
  );
}


