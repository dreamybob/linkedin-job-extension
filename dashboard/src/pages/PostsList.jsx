import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, Search, Star, Tag } from "lucide-react";
import { Link } from "react-router-dom";
import { deletePost, fetchPosts, updatePostLabels } from "../api/client";
import ActionMenu from "../components/ActionMenu";
import Avatar from "../components/Avatar";
import FitmentBadge from "../components/FitmentBadge";
import PostTags from "../components/PostTags";
import StatusBadge from "../components/StatusBadge";
import { formatSavedDate } from "../utils/formatting";
import { getPostEyebrow, getPostTitle } from "../utils/postPresentation";

const SCORE_FILTERS = [
  { label: "All scores", value: "" },
  { label: "High fit", value: "high" },
  { label: "Medium fit", value: "mid" },
  { label: "Low fit", value: "low" },
  { label: "Pending", value: "pending" },
  { label: "Error", value: "error" },
];

const TAG_FILTERS = [
  { label: "All tags", value: "" },
  { label: "Important", value: "important" },
  { label: "Irrelevant Opening", value: "irrelevant" },
  { label: "Immediate Joiner Preferred", value: "immediate_joiner" },
  { label: "Mandatory Qualification Missing", value: "mandatory_missing" },
];

export default function PostsList() {
  const queryClient = useQueryClient();
  const [scoreBand, setScoreBand] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");

  const params = useMemo(
    () => ({
      ...(scoreBand ? { score_band: scoreBand } : {}),
      ...(tag ? { tag } : {}),
      ...(search ? { search } : {}),
      sort,
      limit: 100,
      offset: 0,
    }),
    [scoreBand, search, sort, tag]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["posts", params],
    queryFn: () => fetchPosts(params),
    refetchInterval: ({ state }) => {
      const items = state.data?.items || [];
      return items.some((item) => item.status === "pending" || item.status === "processing") ? 3000 : false;
    },
  });

  const labelMutation = useMutation({
    mutationFn: ({ id, payload }) => updatePostLabels(id, payload),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      await queryClient.invalidateQueries({ queryKey: ["post", String(variables.id)] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePost,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const posts = data?.items || [];

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Saved Posts</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Your captured PM roles</h1>
            <p className="mt-2 text-sm text-gray-500">
              {data?.total ?? 0} saved post{data?.total === 1 ? "" : "s"} ready for review.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search company, role, poster"
                className="h-11 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none transition-shadow focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <select
              value={scoreBand}
              onChange={(event) => setScoreBand(event.target.value)}
              className="h-11 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {SCORE_FILTERS.map((filter) => (
                <option key={filter.label} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>

            <select
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              className="h-11 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {TAG_FILTERS.map((filter) => (
                <option key={filter.label} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-11 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="newest">Newest first</option>
              <option value="score_desc">Highest fit</option>
              <option value="company_asc">Company A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading && <StateCard tone="info" title="Loading posts" description="Pulling your saved roles and their latest analysis." />}
      {error && <StateCard tone="error" title="Failed to load posts" description="The dashboard could not reach the backend." />}

      {!isLoading && !error && !!posts.length && (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-panel lg:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4">Saved</th>
                  <th className="px-6 py-4">Fit</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Tags</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {posts.map((post) => (
                  <tr key={post.id} className="align-top transition-colors hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link to={`/posts/${post.id}`} className="block">
                        <div className="flex items-start gap-3">
                          <Avatar name={post.poster_name} />
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-gray-900">{getPostTitle(post)}</p>
                            <p className="mt-1 text-sm text-gray-500">{post.poster_name || "Unknown poster"}</p>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{getPostEyebrow(post)}</p>
                      <p className="mt-1 text-sm text-gray-500">{post.remote_status || "Unknown"} · {post.seniority || "Pending"}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatSavedDate(post.saved_at)}</td>
                    <td className="px-6 py-4">
                      <FitmentBadge score={post.fitment_score} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={post.status} />
                    </td>
                    <td className="px-6 py-4">
                      <PostTags post={post} limit={2} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end">
                        <ActionMenu
                          post={post}
                          disabled={deleteMutation.isPending}
                          onToggleImportant={() =>
                            labelMutation.mutate({ id: post.id, payload: { is_important: !post.is_important } })
                          }
                          onToggleIrrelevant={() =>
                            labelMutation.mutate({ id: post.id, payload: { is_irrelevant: !post.is_irrelevant } })
                          }
                          onDelete={() => deleteMutation.mutate(post.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:hidden">
            {posts.map((post) => (
              <div key={post.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/posts/${post.id}`} className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <Avatar name={post.poster_name} />
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-gray-900">{getPostTitle(post)}</p>
                        <p className="mt-1 text-sm text-gray-500">{getPostEyebrow(post)}</p>
                      </div>
                    </div>
                  </Link>
                  <ActionMenu
                    post={post}
                    disabled={deleteMutation.isPending}
                    onToggleImportant={() =>
                      labelMutation.mutate({ id: post.id, payload: { is_important: !post.is_important } })
                    }
                    onToggleIrrelevant={() =>
                      labelMutation.mutate({ id: post.id, payload: { is_irrelevant: !post.is_irrelevant } })
                    }
                    onDelete={() => deleteMutation.mutate(post.id)}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <FitmentBadge score={post.fitment_score} />
                  <StatusBadge status={post.status} />
                </div>

                <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
                  <MetaItem icon={BriefcaseBusiness} label="Poster" value={post.poster_name || "Unknown"} />
                  <MetaItem icon={Star} label="Saved" value={formatSavedDate(post.saved_at)} />
                  <MetaItem icon={Tag} label="Work mode" value={post.remote_status || "Unknown"} />
                </div>

                <div className="mt-4">
                  <PostTags post={post} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!isLoading && !posts.length && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
          <BriefcaseBusiness className="mx-auto h-16 w-16 text-gray-300" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No saved posts yet</h2>
          <p className="mt-2 text-sm text-gray-500">Use the Chrome extension on LinkedIn to capture your first role.</p>
        </div>
      )}
    </section>
  );
}

function MetaItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400" />
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}

function StateCard({ tone, title, description }) {
  const styles = {
    info: "border-blue-200 bg-blue-50 text-blue-700",
    error: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <div className={`rounded-lg border p-6 ${styles[tone]}`}>
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm">{description}</p>
    </div>
  );
}
