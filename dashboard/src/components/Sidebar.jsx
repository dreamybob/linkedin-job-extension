import { FileText, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchPosts } from "../api/client";

function navClasses(active) {
  return [
    "flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-sm font-semibold transition-colors",
    active
      ? "bg-blue-50 text-blue-700"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  ].join(" ");
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const savedJobsActive = pathname === "/" || pathname.startsWith("/posts");
  const resumeActive = pathname.startsWith("/resume");
  const { data } = useQuery({
    queryKey: ["sidebar-post-count"],
    queryFn: () => fetchPosts({ limit: 1, offset: 0 }),
    staleTime: 30000,
  });

  return (
    <aside className="sticky top-20 h-[calc(100vh-6rem)] w-14 shrink-0 border-r border-gray-200 pr-2 sm:w-56 sm:pr-3">
      <nav className="space-y-2">
        <Link to="/" className={navClasses(savedJobsActive)} title="Saved Jobs">
          <span className="inline-flex items-center gap-3">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Saved Jobs</span>
          </span>
          <span
            className={`hidden rounded-md px-2 py-0.5 text-xs font-bold sm:inline-flex ${
              savedJobsActive ? "bg-white text-blue-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {data?.total ?? "--"}
          </span>
        </Link>
        <Link to="/resume" className={navClasses(resumeActive)} title="Resume">
          <span className="inline-flex items-center gap-3">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Resume</span>
          </span>
        </Link>
      </nav>
    </aside>
  );
}
