import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import PostsList from "./pages/PostsList";
import PostDetail from "./pages/PostDetail";
import Resume from "./pages/Resume";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-700">
      <Navbar />
      <div className="flex w-full gap-4 px-2 pb-8 pt-6 sm:gap-5 sm:px-3 lg:px-4 2xl:px-5">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<PostsList />} />
            <Route path="/posts/:id" element={<PostDetail />} />
            <Route path="/resume" element={<Resume />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
