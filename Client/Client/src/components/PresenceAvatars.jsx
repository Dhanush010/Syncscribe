export default function PresenceAvatars({ users, currentUserId, currentUsername }) {
  const getInitials = (username) => {
    if (!username) return "?";
    const parts = username.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  };

  // Deduplicate users by userId or username to prevent duplicate keys
  const uniqueUsers = users.reduce((acc, user) => {
    const key = user.userId || user.username;
    if (!acc.find(u => (u.userId || u.username) === key)) {
      acc.push(user);
    }
    return acc;
  }, []);

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      {uniqueUsers.length === 0 ? (
        <span style={{ color: "#888" }}>No users</span>
      ) : (
        <>
          {uniqueUsers.map((user, index) => (
            <div
              key={user.userId || user.username || `user-${index}`}
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
          <span style={{ color: "#888", fontSize: "14px" }}>({uniqueUsers.length})</span>
        </>
      )}
    </div>
  );
}


