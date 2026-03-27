import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import PostsList from "./pages/PostsList";
import PostDetail from "./pages/PostDetail";
import Resume from "./pages/Resume";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-700">
      <Navbar />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-8 pt-8 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<PostsList />} />
          <Route path="/posts/:id" element={<PostDetail />} />
          <Route path="/resume" element={<Resume />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
