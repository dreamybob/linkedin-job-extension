import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, ChevronLeft, ChevronRight, RotateCcw, Search, Star, Tag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { deletePost, fetchPosts, retryPostAnalysis, updatePostLabels } from "../api/client";
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

const PAGE_SIZE = 25;

export default function PostsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [scoreBand, setScoreBand] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(scoreBand ? { score_band: scoreBand } : {}),
      ...(tag ? { tag } : {}),
      ...(search ? { search } : {}),
      sort,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [page, scoreBand, search, sort, tag]
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

  const retryMutation = useMutation({
    mutationFn: retryPostAnalysis,
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      await queryClient.invalidateQueries({ queryKey: ["post", String(id)] });
    },
  });

  const posts = data?.items || [];
  const groupedPosts = groupPostsByDate(posts);
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));

  const updateFilter = (setter) => (event) => {
    setPage(1);
    setter(event.target.value);
  };

  const openPost = (id) => navigate(`/posts/${id}`);

  const handleRowKeyDown = (event, id) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPost(id);
    }
  };

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
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
                placeholder="Search company, role, poster"
                className="h-11 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 outline-none transition-shadow focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <select
              value={scoreBand}
              onChange={updateFilter(setScoreBand)}
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
              onChange={updateFilter(setTag)}
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
              onChange={updateFilter(setSort)}
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
          <div className="space-y-6">
            <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-panel lg:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Company</th>
                    <th className="px-6 py-4">Fit</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Tags</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {groupedPosts.map(([dateLabel, items]) => (
                    <Fragment key={dateLabel}>
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-3">
                          <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{dateLabel}</h2>
                            <p className="text-sm text-gray-500">
                              {items.length} post{items.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </td>
                      </tr>
                      {items.map((post) => (
                        <tr
                          key={post.id}
                          className={`cursor-pointer align-top transition-colors hover:bg-gray-50 ${
                            post.status === "error" ? "bg-red-50/40" : ""
                          }`}
                          onClick={() => openPost(post.id)}
                          onKeyDown={(event) => handleRowKeyDown(event, post.id)}
                          tabIndex={0}
                          role="link"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-3">
                              <Avatar name={post.poster_name} />
                              <div className="min-w-0">
                                <p className="truncate text-base font-semibold text-gray-900">{getPostTitle(post)}</p>
                                <p className="mt-1 text-sm text-gray-500">{post.poster_name || "Unknown poster"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-900">{getPostEyebrow(post)}</p>
                            <p className="mt-1 text-sm text-gray-500">{post.remote_status || "Unknown"} · {post.seniority || "Pending"}</p>
                          </td>
                          <td className="px-6 py-4">
                            <FitmentBadge score={post.fitment_score} variant="table" />
                          </td>
                          <td className="px-6 py-4" onClick={(event) => event.stopPropagation()}>
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge status={post.status} />
                              {post.status === "error" && (
                                <button
                                  type="button"
                                  onClick={() => retryMutation.mutate(post.id)}
                                  disabled={retryMutation.isPending}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  Retry
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <PostTags post={post} limit={2} />
                          </td>
                          <td className="px-6 py-4" onClick={(event) => event.stopPropagation()}>
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
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {groupedPosts.map(([dateLabel, items]) => (
              <section key={dateLabel} className="space-y-3 lg:hidden">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">{dateLabel}</h2>
                  <p className="text-sm text-gray-500">
                    {items.length} post{items.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="grid gap-4">
                  {items.map((post) => (
                    <div
                      key={post.id}
                      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-lg"
                      onClick={() => openPost(post.id)}
                      onKeyDown={(event) => handleRowKeyDown(event, post.id)}
                      tabIndex={0}
                      role="link"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-3">
                            <Avatar name={post.poster_name} />
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-gray-900">{getPostTitle(post)}</p>
                              <p className="mt-1 text-sm text-gray-500">{getPostEyebrow(post)}</p>
                            </div>
                          </div>
                        </div>
                        <div onClick={(event) => event.stopPropagation()}>
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
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                        <FitmentBadge score={post.fitment_score} />
                        <StatusBadge status={post.status} />
                        {post.status === "error" && (
                          <button
                            type="button"
                            onClick={() => retryMutation.mutate(post.id)}
                            disabled={retryMutation.isPending}
                            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Retry
                          </button>
                        )}
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
                        <MetaItem icon={BriefcaseBusiness} label="Poster" value={post.poster_name || "Unknown"} />
                        <MetaItem icon={Tag} label="Work mode" value={post.remote_status || "Unknown"} />
                        <MetaItem icon={Star} label="Group" value={dateLabel} />
                      </div>

                      <div className="mt-4">
                        <PostTags post={post} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={data?.total || 0}
            pageSize={PAGE_SIZE}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          />
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

function groupPostsByDate(posts) {
  const groups = new Map();

  posts.forEach((post) => {
    const label = formatSavedDate(post.saved_at);
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(post);
  });

  return Array.from(groups.entries());
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

function Pagination({ currentPage, totalPages, totalItems, pageSize, onPrevious, onNext }) {
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-500">
        Showing {start}-{end} of {totalItems} posts
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={currentPage === 1}
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <span className="text-sm font-medium text-gray-700">
          Page {currentPage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
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
