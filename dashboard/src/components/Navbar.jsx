import { FileText, Home } from "lucide-react";
import { NavLink } from "react-router-dom";

const linkClasses = ({ isActive }) =>
  [
    "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
    isActive
      ? "bg-blue-50 text-blue-700"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  ].join(" ");

export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="truncate text-2xl font-extrabold tracking-[-0.04em] text-gray-900">
            shortlisted<span className="text-blue-600">.</span>
          </p>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink to="/" className={linkClasses} end>
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Posts</span>
          </NavLink>
          <NavLink to="/resume" className={linkClasses}>
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Resume</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
