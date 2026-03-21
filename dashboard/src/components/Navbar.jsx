import { NavLink } from "react-router-dom";

const linkClasses = ({ isActive }) =>
  [
    "rounded-full border px-4 py-2 text-sm transition",
    isActive
      ? "border-electric bg-electric/15 text-white"
      : "border-white/10 bg-white/5 text-mist/80 hover:border-white/25 hover:bg-white/10",
  ].join(" ");

export default function Navbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-ink/75 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="font-display text-2xl tracking-wide text-white">PM Job Saver</p>
          <p className="text-sm text-mist/70">Capture roles from LinkedIn and review fit in one place.</p>
        </div>
        <nav className="flex items-center gap-3">
          <NavLink to="/" className={linkClasses} end>
            Posts
          </NavLink>
          <NavLink to="/resume" className={linkClasses}>
            Resume
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

