export default function PresenceAvatars({ users, currentUserId, currentUsername }) {
  const getInitials = (username) => {
    if (!username) return "?";
    const parts = username.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  };

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      {users.length === 0 ? (
        <span style={{ color: "#888" }}>No users</span>
      ) : (
        <>
          {users.map((user) => (
            <div
              key={user.userId || user.username}
              title={user.username}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: user.color || "#666",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer",
                border: (currentUserId && user.userId === currentUserId) || 
                       (currentUsername && user.username === currentUsername) 
                       ? "2px solid #fff" : "none",
                boxShadow: (currentUserId && user.userId === currentUserId) || 
                          (currentUsername && user.username === currentUsername)
                          ? "0 0 8px rgba(255,255,255,0.5)" : "none"
              }}
            >
              {getInitials(user.username)}
            </div>
          ))}
          <span style={{ color: "#888", fontSize: "14px" }}>({users.length})</span>
        </>
      )}
    </div>
  );
}


