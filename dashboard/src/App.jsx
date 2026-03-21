import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import PostsList from "./pages/PostsList";
import PostDetail from "./pages/PostDetail";
import Resume from "./pages/Resume";

export default function App() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(117,228,179,0.18),_transparent_35%),linear-gradient(180deg,_#08111f_0%,_#0f1b31_42%,_#13213a_100%)] text-mist">
      <Navbar />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
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

