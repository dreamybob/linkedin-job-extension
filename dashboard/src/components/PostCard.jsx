import { Link } from "react-router-dom";
import FitmentBadge from "./FitmentBadge";
import StatusBadge from "./StatusBadge";

export default function PostCard({ post }) {
  return (
    <Link
      to={`/posts/${post.id}`}
      className="group rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-panel transition hover:-translate-y-1 hover:border-electric/30 hover:bg-white/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-mist/55">{post.company_name || "Awaiting analysis"}</p>
          <h2 className="mt-2 font-display text-2xl text-white">{post.job_title || "LinkedIn post captured"}</h2>
          <p className="mt-2 text-sm text-mist/70">
            {post.poster_name || "Unknown poster"}
            {post.poster_headline ? ` · ${post.poster_headline}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <FitmentBadge score={post.fitment_score} />
          <StatusBadge status={post.status} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm text-mist/70">
        <span className="rounded-full border border-white/10 px-3 py-1">{post.remote_status || "unknown"}</span>
        <span className="rounded-full border border-white/10 px-3 py-1">{post.seniority || "seniority pending"}</span>
      </div>
    </Link>
  );
}

