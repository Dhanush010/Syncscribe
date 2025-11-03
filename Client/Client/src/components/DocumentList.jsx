// src/components/DocumentList.jsx
export default function DocumentList({ documents, onSelect, onDelete }) {
  return (
    <div className="w-1/4 border-r p-4 bg-gray-50 h-screen overflow-y-auto">
      <h2 className="text-lg font-semibold mb-4">Documents</h2>
      {documents.map((doc) => (
        <div
          key={doc._id}
          className="flex justify-between items-center mb-2 p-2 bg-white rounded shadow hover:bg-gray-100 cursor-pointer"
          onClick={() => onSelect(doc)}
        >
          <span>{doc.title}</span>
          <button
            className="text-red-500 hover:text-red-700"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(doc._id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
