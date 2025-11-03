// src/components/Navbar.jsx
export default function Navbar({ onCreate }) {
  return (
    <nav className="bg-blue-600 text-white px-6 py-3 flex justify-between items-center shadow-md">
      <h1 className="text-xl font-bold">📝 SyncScribe</h1>
      <button
        onClick={onCreate}
        className="bg-white text-blue-600 font-semibold px-4 py-1 rounded hover:bg-gray-200"
      >
        + New Document
      </button>
    </nav>
  );
}
