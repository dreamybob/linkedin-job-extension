import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Loader2,
  MapPin,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import {
  deletePost,
  ensureGapAnalysis,
  fetchPost,
  retryGapAnalysis,
  retryPostAnalysis,
  updatePostLabels,
} from "../api/client";
import FitmentBadge from "../components/FitmentBadge";
import StatusBadge from "../components/StatusBadge";
import { usePollingInterval } from "../hooks/usePollingInterval";
import { formatSavedDate } from "../utils/formatting";
import { getPostTitle } from "../utils/postPresentation";

const TABS = [
  { id: "fix", label: "Fix My Resume" },
  { id: "understand", label: "Understand This Role" },
];

const REWRITE_LABELS = {
  rephrase_existing: "Replace in Resume",
  add_new_bullet: "Add to Resume",
  restructure_section: "Restructure Section",
};

export default function PostDetail() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("fix");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["post", id],
    queryFn: () => fetchPost(id),
    refetchInterval: (query) => usePollingInterval(query.state.data?.status),
  });

  const shouldLoadGapAnalysis = data?.status === "done";
  const gapQuery = useQuery({
    queryKey: ["gap-analysis", id],
    queryFn: () => ensureGapAnalysis(id),
    enabled: Boolean(id && shouldLoadGapAnalysis),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 3000 : false),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePost(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      navigate("/");
    },
  });

  const labelMutation = useMutation({
    mutationFn: (payload) => updatePostLabels(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["post", id] });
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryPostAnalysis(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["post", id] });
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      await queryClient.invalidateQueries({ queryKey: ["gap-analysis", id] });
    },
  });

  const gapRetryMutation = useMutation({
    mutationFn: () => retryGapAnalysis(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gap-analysis", id] });
    },
  });

  const hasLoadedPost = Boolean(data);
  const isPendingState = data?.status === "pending" || data?.status === "processing";

  if ((error || !data) && !isLoading) {
    return (
      <section className="space-y-6">
        <TopBackLink />
        <StateCard tone="error" title="Failed to load post" description="The detail view could not be loaded." />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <TopBackLink />

        <div className="flex flex-wrap gap-3">
          {hasLoadedPost && data.status === "error" && (
            <button
              type="button"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              Retry
            </button>
          )}
          {hasLoadedPost && (
            <>
              <button
                type="button"
                onClick={() => labelMutation.mutate({ is_important: !data.is_important })}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  data.is_important ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {data.is_important ? "Marked Important" : "Mark Important"}
              </button>
              <button
                type="button"
                onClick={() => labelMutation.mutate({ is_irrelevant: !data.is_irrelevant })}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  data.is_irrelevant ? "bg-gray-700 text-white hover:bg-gray-800" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {data.is_irrelevant ? "Marked Irrelevant" : "Mark Irrelevant"}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" />
                Delete post
              </button>
            </>
          )}
        </div>
      </div>

      {isLoading && (
        <StateCard
          tone="info"
          title="Loading post details"
          description="Pulling the saved post, analysis state, and extracted fields."
        />
      )}

      {hasLoadedPost && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
          <div className="space-y-6">
            <HeaderCard post={data} />

            {isPendingState && <AnalysisInProgressState status={data.status} postUrl={data.post_url} />}

            {data.status === "error" && (
              <StateCard
                tone="error"
                title="Analysis failed"
                description="We could not complete extraction for this post. You can retry now, or return to the list and continue reviewing other saved roles."
              />
            )}

            {data.status === "done" && (
              <section className="space-y-5">
                <JobDetailTabs activeTab={activeTab} onChange={setActiveTab} />
                {activeTab === "fix" ? (
                  <FixMyResumeTab
                    fitmentScore={data.fitment_score}
                    gapAnalysis={gapQuery.data}
                    isLoading={gapQuery.isLoading || (gapQuery.isFetching && !gapQuery.data)}
                    isRetrying={gapRetryMutation.isPending}
                    onRetry={() => gapRetryMutation.mutate()}
                  />
                ) : (
                  <ComingSoonPanel />
                )}
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <FitOverviewCard score={data.fitment_score} status={data.status} />
            <JobMetadataPanel post={data} />
          </aside>
        </div>
      )}
    </section>
  );
}

function TopBackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-blue-700">
      <ArrowLeft className="h-4 w-4" />
      Back to posts
    </Link>
  );
}

function HeaderCard({ post }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-panel">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500">Post detail</p>
        <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">{getPostTitle(post)}</h1>
        <div className="mt-4 flex items-center gap-3 text-lg font-semibold text-gray-700">
          <Building2 className="h-5 w-5 text-gray-400" />
          <span>{post.company_name || "Company not mentioned"}</span>
        </div>
        {post.error_message && <p className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{post.error_message}</p>}
      </div>
    </div>
  );
}

function JobDetailTabs({ activeTab, onChange }) {
  return (
    <div className="flex justify-end border-b border-gray-200">
      <div className="flex flex-wrap justify-end gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
            }`}
          >
            {tab.label}
            {tab.id === "understand" && <span className="ml-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">Soon</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function FixMyResumeTab({ fitmentScore, gapAnalysis, isLoading, isRetrying, onRetry }) {
  if (isLoading || !gapAnalysis || gapAnalysis.status === "pending") {
    return <GapAnalysisSkeleton />;
  }

  if (gapAnalysis.status === "no_resume") {
    return (
      <EmptyTabState
        icon={FileText}
        title="Add your resume to see personalised fixes."
        action={<Link to="/resume" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Open Resume</Link>}
      />
    );
  }

  if (gapAnalysis.status === "error") {
    return (
      <EmptyTabState
        icon={RotateCcw}
        title="We couldn't analyse your resume right now. Try again."
        description={gapAnalysis.error_message}
        action={
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" />
            {isRetrying ? "Retrying..." : "Retry"}
          </button>
        }
      />
    );
  }

  const sortedGaps = [...(gapAnalysis.gaps || [])].sort((left, right) => left.rank - right.rank).slice(0, 5);

  return (
    <div className="space-y-5">
      <VerdictBanner verdict={gapAnalysis.overall_verdict} fitmentScore={fitmentScore} />
      <ResumeStrengths strengths={gapAnalysis.resume_strengths} />
      {sortedGaps.length ? (
        <div className="space-y-4">
          {sortedGaps.map((gap, index) => (
            <GapCard key={`${gap.rank}-${gap.gap_title}`} gap={gap} fallbackRank={index + 1} />
          ))}
        </div>
      ) : (
        <EmptyTabState icon={Sparkles} title="Your resume looks well-aligned with this role." />
      )}
    </div>
  );
}

function VerdictBanner({ verdict, fitmentScore }) {
  const tone = getVerdictTone(fitmentScore);

  return (
    <section className={`rounded-lg border p-5 ${tone.container}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${tone.icon}`}>
          <Wrench className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Verdict</p>
          <p className={`mt-2 text-base font-semibold leading-7 ${tone.text}`}>
            {verdict || "Gap analysis completed for this role."}
          </p>
        </div>
      </div>
    </section>
  );
}

function ResumeStrengths({ strengths }) {
  const visibleStrengths = (strengths || []).slice(0, 3);
  if (!visibleStrengths.length) {
    return null;
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900">What's Working</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {visibleStrengths.map((strength) => (
          <span key={strength} className="rounded-md border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
            {strength}
          </span>
        ))}
      </div>
    </section>
  );
}

function GapCard({ gap, fallbackRank }) {
  const [copied, setCopied] = useState(false);
  const noFix = gap.rewrite_type === "no_fix_possible";
  const ctaLabel = REWRITE_LABELS[gap.rewrite_type] || "Copy Rewrite";

  const copyRewrite = async () => {
    await copyText(gap.suggested_rewrite || "");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ImpactBadge impact={gap.impact} />
        <span className="text-sm font-bold text-gray-400">#{gap.rank || fallbackRank}</span>
      </div>

      <div className="mt-4">
        <h3 className="text-xl font-bold text-gray-900">{gap.gap_title}</h3>
        <p className="mt-2 text-sm leading-6 text-gray-700">{gap.what_is_missing}</p>
        <p className="mt-3 text-sm leading-6 text-gray-500">{gap.why_it_matters}</p>
      </div>

      {gap.resume_evidence && (
        <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <FileText className="h-4 w-4 text-gray-400" />
            From your resume
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-600">"{gap.resume_evidence}"</p>
        </div>
      )}

      <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
          <Clipboard className="h-4 w-4" />
          Suggested rewrite
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-blue-950">"{gap.suggested_rewrite}"</p>

        {noFix ? (
          <p className="mt-4 text-sm font-medium text-amber-700">
            This is a genuine gap. Consider addressing it in your cover letter.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={copyRewrite}
              className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              type="button"
              onClick={copyRewrite}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {ctaLabel}
            </button>
            <button
              type="button"
              disabled
              title="Direct resume editing coming soon."
              className="cursor-not-allowed rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-400"
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function ImpactBadge({ impact }) {
  const normalized = impact || "low";
  const styles = {
    high: "border-red-200 bg-red-50 text-red-700",
    medium: "border-amber-200 bg-amber-50 text-amber-700",
    low: "border-gray-200 bg-gray-50 text-gray-700",
  };

  return (
    <span className={`rounded-md border px-2.5 py-0.5 text-xs font-medium ${styles[normalized] || styles.low}`}>
      {normalized}
    </span>
  );
}

function GapAnalysisSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div key={item} className="animate-pulse rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="h-6 w-28 rounded bg-gray-200" />
          <div className="mt-5 h-5 w-2/3 rounded bg-gray-200" />
          <div className="mt-3 h-4 w-full rounded bg-gray-100" />
          <div className="mt-2 h-4 w-5/6 rounded bg-gray-100" />
          <div className="mt-5 h-24 rounded-md bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyTabState({ icon: Icon, title, description, action }) {
  return (
    <section className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-gray-900">{title}</h2>
      {description && <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}

function ComingSoonPanel() {
  return <EmptyTabState icon={Sparkles} title="Understand This Role is coming soon." />;
}

function FitOverviewCard({ score, status }) {
  const scoreMeta = getFitScoreMeta(score);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-panel">
      <p className="text-sm font-medium text-gray-500">Fit score</p>
      <div className="mt-5 flex items-end gap-2">
        <span className="text-4xl font-bold text-gray-900">{scoreMeta.value}</span>
        <span className="pb-1 text-base font-semibold text-gray-400">/10</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-gray-900">{scoreMeta.label}</p>
      <p className="mt-1 text-sm leading-6 text-gray-600">{scoreMeta.description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <FitmentBadge score={score} />
        <StatusBadge status={status} />
      </div>
    </section>
  );
}

function JobMetadataPanel({ post }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-panel">
      <p className="text-sm font-semibold text-gray-500">Job metadata</p>

      <div className="mt-6 space-y-5">
        <MetadataItem
          icon={UserRound}
          label="Posted by"
          value={
            post.poster_profile_url ? (
              <ExternalValue href={post.poster_profile_url}>{post.poster_name || "Open profile"}</ExternalValue>
            ) : (
              post.poster_name || "Not mentioned"
            )
          }
        />
        <MetadataItem icon={MapPin} label="Location" value={post.location || "Not mentioned"} />
        <MetadataItem icon={Globe} label="Work mode" value={formatWorkMode(post.remote_status)} />
        <MetadataItem icon={BriefcaseBusiness} label="Seniority" value={post.seniority || "Not mentioned"} />
        <MetadataItem icon={CalendarDays} label="Saved on" value={formatSavedDate(post.saved_at)} />
        <MetadataItem icon={Link2} label="Post link" value={<ExternalValue href={post.post_url}>Open LinkedIn post</ExternalValue>} />
        <MetadataItem icon={BadgeDollarSign} label="Compensation" value={post.compensation || "Not mentioned"} />
      </div>
    </section>
  );
}

function MetadataItem({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-3 border-b border-gray-100 pb-5 last:border-b-0 last:pb-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <div className="mt-1 text-sm font-medium leading-6 text-gray-800">{value}</div>
      </div>
    </div>
  );
}

function ExternalValue({ href, children }) {
  if (!href) {
    return <span className="text-gray-400">Not available</span>;
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
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

function getFitScoreMeta(score) {
  if (typeof score !== "number") {
    return {
      value: "--",
      label: "Fit pending",
      description: "We will show a scored fit view here once analysis completes.",
    };
  }

  if (score >= 8) {
    return {
      value: score.toFixed(1).replace(".0", ""),
      label: "High alignment",
      description: "This role appears strongly aligned with your current experience.",
    };
  }

  if (score >= 5) {
    return {
      value: score.toFixed(1).replace(".0", ""),
      label: "Medium alignment",
      description: "There is meaningful overlap, with a few areas worth positioning carefully.",
    };
  }

  return {
    value: score.toFixed(1).replace(".0", ""),
    label: "Low alignment",
    description: "The role has several gaps relative to your current profile.",
  };
}

function getVerdictTone(score) {
  if (typeof score !== "number") {
    return {
      container: "border-gray-200 bg-gray-50",
      icon: "bg-white text-gray-500",
      text: "text-gray-800",
    };
  }

  if (score >= 8) {
    return {
      container: "border-green-200 bg-green-50",
      icon: "bg-white text-green-700",
      text: "text-green-900",
    };
  }

  if (score >= 5) {
    return {
      container: "border-amber-200 bg-amber-50",
      icon: "bg-white text-amber-700",
      text: "text-amber-900",
    };
  }

  return {
    container: "border-red-200 bg-red-50",
    icon: "bg-white text-red-700",
    text: "text-red-900",
  };
}

function formatWorkMode(value) {
  if (!value) {
    return "Not mentioned";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.includes("hybrid")) {
    return "Hybrid";
  }
  if (normalized.includes("remote") || normalized.includes("wfh")) {
    return "WFH";
  }
  if (normalized.includes("on-site") || normalized.includes("onsite") || normalized.includes("office") || normalized.includes("wfo")) {
    return "WFO";
  }

  return value;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function AnalysisInProgressState({ status, postUrl }) {
  const title = status === "processing" ? "Analysis in progress" : "Analysis queued";
  const description =
    status === "processing"
      ? "We are extracting company, fit, application, and qualification signals for this saved post."
      : "This post has been saved and is waiting for analysis to start.";

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
          <Loader2 className={`h-5 w-5 ${status === "processing" ? "animate-spin" : ""}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-blue-900">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-blue-800">{description}</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-blue-800">
            <li>Company, role, and work mode details will appear here once extraction completes.</li>
            <li>Fitment, gaps, and application guidance will populate automatically after analysis finishes.</li>
            <li>You can return to the list now, or wait here while the page refreshes every few seconds.</li>
          </ul>
          <div className="mt-4">
            <ExternalValue href={postUrl}>Open LinkedIn post</ExternalValue>
          </div>
        </div>
      </div>
    </section>
  );
}
