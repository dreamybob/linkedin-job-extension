import { Link } from "react-router-dom";
import FitmentBadge from "./FitmentBadge";
import StatusBadge from "./StatusBadge";
import { getPostEyebrow, getPostTitle } from "../utils/postPresentation";

export default function PostCard({ post }) {
  return (
    <Link
      to={`/posts/${post.id}`}
      className="group block rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-panel transition hover:border-electric/30 hover:bg-white/10"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.22em] text-mist/55">{getPostEyebrow(post)}</p>
          <h2 className="mt-2 truncate font-display text-2xl text-white">{getPostTitle(post)}</h2>
          <p className="mt-2 truncate text-sm text-mist/70">
            {post.poster_name || "Unknown poster"}
            {post.poster_headline ? ` · ${post.poster_headline}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-mist/70">
            <span className="rounded-full border border-white/10 px-3 py-1">{post.remote_status || "unknown"}</span>
            <span className="rounded-full border border-white/10 px-3 py-1">{post.seniority || "seniority pending"}</span>
          </div>
          {post.error_message && (
            <p className="mt-3 truncate text-sm text-danger/90" title={post.error_message}>
              {post.error_message}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <FitmentBadge score={post.fitment_score} />
          <StatusBadge status={post.status} />
        </div>
      </div>
    </Link>
  );
}
