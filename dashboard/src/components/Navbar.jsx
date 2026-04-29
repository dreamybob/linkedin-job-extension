export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center px-3 sm:px-4 lg:px-5">
        <div className="min-w-0">
          <p className="truncate text-2xl font-extrabold tracking-[-0.04em] text-gray-900">
            shortlisted<span className="text-blue-600">.</span>
          </p>
        </div>
      </div>
    </header>
  );
}
