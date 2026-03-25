import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPosts } from "../api/client";
import PostCard from "../components/PostCard";

const FILTERS = [
  { label: "All", value: "" },
  { label: "Score 8-10", value: "high" },
  { label: "Score 5-7", value: "mid" },
  { label: "Score below 5", value: "low" },
  { label: "Pending", value: "pending" },
  { label: "Error", value: "error" },
];

export default function PostsList() {
  const [scoreBand, setScoreBand] = useState("");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");

  const params = useMemo(
    () => ({
      ...(scoreBand ? { score_band: scoreBand } : {}),
      ...(search ? { search } : {}),
      sort,
      limit: 100,
      offset: 0,
    }),
    [scoreBand, search, sort]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["posts", params],
    queryFn: () => fetchPosts(params),
    refetchInterval: ({ state }) => {
      const items = state.data?.items || [];
      return items.some((item) => item.status === "pending" || item.status === "processing") ? 3000 : false;
    },
  });

  return (
    <section className="space-y-6">
      <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-mist/55">Review saved openings</p>
            <h1 className="mt-2 font-display text-4xl text-white">Your captured PM roles</h1>
            <p className="mt-2 text-sm text-mist/70">
              {data?.total ?? 0} saved post{data?.total === 1 ? "" : "s"}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={scoreBand}
              onChange={(event) => setScoreBand(event.target.value)}
              className="rounded-2xl border border-white/10 bg-ink/80 px-4 py-3 text-sm text-mist outline-none"
            >
              {FILTERS.map((filter) => (
                <option key={filter.label} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="rounded-2xl border border-white/10 bg-ink/80 px-4 py-3 text-sm text-mist outline-none"
            >
              <option value="newest">Newest first</option>
              <option value="score_desc">Highest score</option>
              <option value="company_asc">Company A-Z</option>
            </select>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search company, role, or poster"
              className="rounded-2xl border border-white/10 bg-ink/80 px-4 py-3 text-sm text-mist outline-none placeholder:text-mist/35"
            />
          </div>
        </div>
      </div>

      {isLoading && <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-mist/70">Loading posts…</div>}
      {error && <div className="rounded-3xl border border-danger/30 bg-danger/10 p-8 text-danger">Failed to load posts.</div>}

      <div className="space-y-4">
        {data?.items?.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {!isLoading && !data?.items?.length && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-mist/70">
          No saved posts yet. Use the Chrome extension on LinkedIn to capture one.
        </div>
      )}
    </section>
  );
}
