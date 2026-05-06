import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Navbar from "./components/Navbar";
import PostsList from "./pages/PostsList";
import PostResumeReview from "./pages/PostResumeReview";
import Resume from "./pages/Resume";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-700">
      <Navbar />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-8 pt-8 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<PostsList />} />
          <Route path="/posts/:id" element={<ResumeRouteRedirect />} />
          <Route path="/posts/:id/resume" element={<PostResumeReview />} />
          <Route path="/resume" element={<Resume />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function ResumeRouteRedirect() {
  const { id } = useParams();
  return <Navigate to={`/posts/${id}/resume`} replace />;
}
