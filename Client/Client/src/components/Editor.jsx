// src/components/Editor.jsx
export default function Editor({ document, onChange }) {
  if (!document)
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Select or create a document to start editing
      </div>
    );

  return (
    <div className="flex-1 p-6">
      <input
        type="text"
        className="text-2xl font-semibold w-full border-b-2 outline-none mb-4"
        value={document.title}
        onChange={(e) => onChange({ ...document, title: e.target.value })}
      />
      <textarea
        className="w-full h-[80vh] border p-3 rounded-lg outline-none"
        value={document.content}
        onChange={(e) => onChange({ ...document, content: e.target.value })}
      />
    </div>
  );
}
