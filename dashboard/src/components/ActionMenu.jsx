import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Star, Tag, Trash2 } from "lucide-react";

function MenuButton({ icon: Icon, label, active, destructive, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        destructive
          ? "text-red-600 hover:bg-red-50 disabled:bg-transparent disabled:text-red-300"
          : active
            ? "bg-blue-50 text-blue-700"
            : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}

export default function ActionMenu({ post, onToggleImportant, onToggleIrrelevant, onDelete, disabled }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const closeAndRun = (callback) => (event) => {
    event.stopPropagation();
    setOpen(false);
    callback();
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-panel">
          <MenuButton
            icon={Star}
            label={post.is_important ? "Remove Important" : "Mark Important"}
            active={post.is_important}
            onClick={closeAndRun(onToggleImportant)}
          />
          <MenuButton
            icon={Tag}
            label={post.is_irrelevant ? "Remove Irrelevant" : "Mark Irrelevant"}
            active={post.is_irrelevant}
            onClick={closeAndRun(onToggleIrrelevant)}
          />
          <MenuButton
            icon={Trash2}
            label={disabled ? "Deleting..." : "Delete post"}
            destructive
            onClick={closeAndRun(onDelete)}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
