import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Eye,
  FileWarning,
  Loader2,
  PencilLine,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  addResumeTemplate,
  applyResumeSuggestion,
  fetchPostResumeAnalysis,
  fetchResumeSuggestions,
  retryPostAnalysis,
  revertResumeOverlay,
} from "../api/client";

const ANNOTATION_META = {
  strong_match: {
    label: "Strong match",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  needs_rewrite: {
    label: "Needs rewrite",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Sparkles,
  },
  missing_evidence: {
    label: "Missing evidence",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    icon: CircleAlert,
  },
  neutral: {
    label: "Neutral",
    badge: "border-gray-200 bg-gray-50 text-gray-500",
    icon: ChevronRight,
  },
};

export default function PostResumeReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("edit");
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [undoAction, setUndoAction] = useState(null);
  const [undoProgress, setUndoProgress] = useState(100);
  const sectionRefs = useRef({});

  const analysisQuery = useQuery({
    queryKey: ["post-resume", id],
    queryFn: () => fetchPostResumeAnalysis(id),
    refetchInterval: (query) => (query.state.data?.status === "processing" ? 3000 : false),
  });

  const selectedDetails = useMemo(
    () => locateTarget(analysisQuery.data?.sections || [], selectedTarget),
    [analysisQuery.data?.sections, selectedTarget]
  );

  const suggestionsQuery = useQuery({
    queryKey: [
      "post-resume-suggestions",
      id,
      selectedDetails?.targetType,
      selectedDetails?.node?.id,
      analysisQuery.data?.overlay_revision,
    ],
    queryFn: () =>
      fetchResumeSuggestions(id, {
        target_type: selectedDetails.targetType,
        target_id: selectedDetails.node.id,
      }),
    enabled:
      Boolean(selectedDetails) &&
      analysisQuery.data?.status === "complete" &&
      isSuggestionActionable(selectedDetails) &&
      !selectedDetails.node.applied_overlay_id,
  });

  const retryMutation = useMutation({
    mutationFn: () => retryPostAnalysis(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["post-resume", id] });
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: (payload) => applyResumeSuggestion(id, payload),
    onSuccess: async (data) => {
      queryClient.setQueryData(["post-resume", id], data);
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      setUndoAction(data.action || null);
    },
  });

  const revertMutation = useMutation({
    mutationFn: (payload) => revertResumeOverlay(id, payload),
    onSuccess: async (data) => {
      queryClient.setQueryData(["post-resume", id], data);
      await queryClient.invalidateQueries({ queryKey: ["posts"] });
      setUndoAction(null);
    },
  });

  const addTemplateMutation = useMutation({
    mutationFn: (payload) => addResumeTemplate(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["post-resume", id], data);
      setShowTemplatePicker(false);
    },
  });

  useEffect(() => {
    if (!selectedTarget) {
      return;
    }
    if (!selectedDetails) {
      setSelectedTarget(null);
    }
  }, [selectedDetails, selectedTarget]);

  useEffect(() => {
    if (!undoAction?.overlay_id) {
      return;
    }

    setUndoProgress(100);
    const frame = requestAnimationFrame(() => setUndoProgress(0));
    const timeout = setTimeout(() => {
      setUndoAction(null);
    }, undoAction.expires_in_ms || 5000);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [undoAction?.overlay_id, undoAction?.expires_in_ms]);

  const data = analysisQuery.data;

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const openTarget = (targetType, nodeId) => {
    if (mode !== "edit") {
      return;
    }
    setSelectedTarget({ targetType, nodeId });
  };

  const scrollToSection = (sectionId) => {
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (analysisQuery.isLoading && !data) {
    return (
      <section className="space-y-6">
        <LoadingShell />
      </section>
    );
  }

  if (analysisQuery.isError || !data) {
    return (
      <section className="space-y-6">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to posts
        </button>
        <StateCard
          tone="error"
          title="Could not load the resume review"
          description="The dashboard could not reach the new resume analysis endpoint."
        />
      </section>
    );
  }

  const postTitle = data.post?.job_title || "Saved role";
  const companyName = data.post?.company_name || "Awaiting analysis";
  const totalScore = data.score_breakdown?.total ?? null;

  return (
    <section className="space-y-6 pb-24">
      <div className="sticky top-20 z-20">
        <div className="space-y-4">
          {data.status !== "no_resume" && <ModeToggle mode={mode} onModeChange={setMode} />}

          <div
            className={`grid gap-4 ${
              data.status === "complete" && mode === "edit"
                ? "xl:grid-cols-[minmax(0,1fr)_320px] xl:grid-rows-[auto_auto] xl:items-stretch"
                : ""
            }`}
          >
            <ContextBar
              title={postTitle}
              companyName={companyName}
              score={totalScore}
              status={data.status}
              onBack={handleBack}
              onRetry={() => retryMutation.mutate()}
              isRetrying={retryMutation.isPending}
              errorMessage={data.error_message || data.post?.error_message}
            />

            {data.status === "complete" && mode === "edit" && (
              <div className="hidden xl:block xl:self-stretch">
                <RoleFitCard score={totalScore} status={data.status} />
              </div>
            )}

            {data.status !== "no_resume" && (
              <div className={data.status === "complete" && mode === "edit" ? "xl:col-start-1" : ""}>
                <SectionStrip
                  sections={data.sections}
                  mode={mode}
                  status={data.status}
                  showTemplatePicker={showTemplatePicker}
                  onToggleTemplatePicker={() => setShowTemplatePicker((current) => !current)}
                  onAddTemplate={(templateType) => addTemplateMutation.mutate({ template_type: templateType })}
                  onJump={scrollToSection}
                  isAddingTemplate={addTemplateMutation.isPending}
                  availableTemplates={data.available_templates || []}
                />
              </div>
            )}

            {data.status === "complete" && mode === "edit" && (
              <div className="hidden xl:block xl:self-start">
                <SignalList
                  title="Top issues"
                  items={data.top_issues}
                  emptyLabel="No material issues were flagged."
                  onOpenTarget={openTarget}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {data.status === "no_resume" && (
        <EmptyResumeState />
      )}

      {data.status === "error" && (
        <StateCard
          tone="error"
          title="Resume analysis hit a snag"
          description={data.error_message || "Retry the analysis to regenerate the resume review for this job."}
        />
      )}

      {data.status === "processing" && (
        <StateCard
          tone="info"
          title="Resume analysis is still building"
          description="We already have your structured resume. Scoring, labels, and suggestions will appear as soon as the role analysis finishes."
        />
      )}

      {data.status !== "no_resume" && (
        <div className={`grid gap-5 ${data.status === "complete" && mode === "edit" ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
          <div className="space-y-4">
            {data.status === "complete" && mode === "edit" && (
              <OverviewSummaryPanel summary={data.overall_summary} scoreBreakdown={data.score_breakdown} />
            )}

            {mode === "edit" ? (
              <EditResumeCanvas
                sections={data.sections}
                status={data.status}
                onOpenTarget={openTarget}
                onAddEntry={(section) =>
                  addTemplateMutation.mutate({
                    template_type: section.type,
                    parent_section_id: section.id,
                  })
                }
                isMutating={addTemplateMutation.isPending}
                sectionRefs={sectionRefs}
              />
            ) : (
              <PreviewResumeCanvas sections={data.sections} sectionRefs={sectionRefs} />
            )}
          </div>

          {data.status === "complete" && mode === "edit" && (
            <aside className="space-y-4 xl:sticky xl:top-44 xl:self-start">
              <SignalList
                title="Top opportunities"
                items={data.top_opportunities}
                emptyLabel="No enhancement opportunities are available yet."
                onOpenTarget={openTarget}
              />
              <KeywordPanel keywordSummary={data.keyword_summary} />
            </aside>
          )}
        </div>
      )}

      {selectedDetails && (
        <SelectionSheet
          open={Boolean(selectedDetails)}
          target={selectedDetails}
          loadingSuggestions={suggestionsQuery.isFetching}
          suggestions={suggestionsQuery.data?.suggestions || []}
          onClose={() => setSelectedTarget(null)}
          onApply={(suggestion) =>
            applyMutation.mutate({
              suggestion_id: suggestion.id,
              target_type: selectedDetails.targetType,
              target_id: selectedDetails.node.id,
              destination_section_id: suggestion.destination_section_id,
              destination_entry_id: suggestion.destination_entry_id,
            })
          }
          onRevert={(overlayId) => revertMutation.mutate({ overlay_id: overlayId })}
          isApplying={applyMutation.isPending}
          isReverting={revertMutation.isPending}
        />
      )}

      {undoAction?.overlay_id && (
        <UndoBar
          message={undoAction.message}
          progress={undoProgress}
          onUndo={() => revertMutation.mutate({ overlay_id: undoAction.overlay_id })}
          isUndoing={revertMutation.isPending}
        />
      )}
    </section>
  );
}

function ModeToggle({ mode, onModeChange }) {
  return (
    <div className="mx-auto w-fit rounded-xl border-2 border-blue-400 bg-slate-100 p-1">
      <div className="inline-flex rounded-lg bg-transparent">
        <button
          type="button"
          onClick={() => onModeChange("edit")}
          className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
            mode === "edit" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <PencilLine className="h-5 w-5" />
          Editor
        </button>
        <button
          type="button"
          onClick={() => onModeChange("preview")}
          className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
            mode === "preview" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Eye className="h-5 w-5" />
          Preview
        </button>
      </div>
    </div>
  );
}

function ContextBar({ title, companyName, score, status, onBack, onRetry, isRetrying, errorMessage }) {
  return (
    <div className="h-full rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to posts
          </button>
          {status === "error" && <StatusPill status={status} />}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="space-y-1">
              <h1 className="text-xl font-bold tracking-[-0.04em] text-slate-900 sm:text-2xl">{title}</h1>
              <p className="text-sm text-slate-500">{companyName}</p>
              {status === "error" && errorMessage && <p className="text-sm text-rose-600">{errorMessage}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              {status !== "error" && <StatusPill status={status} />}
              {status === "error" && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={isRetrying}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleFitCard({ score, status }) {
  return (
    <div className="h-full rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-3">
        <ScoreRing score={score} loading={status === "processing"} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Role Fit</p>
          <p className="mt-1 text-xs text-slate-600">
            {status === "complete"
              ? "Deterministic score updates as you apply or revert changes."
              : "We will animate the score once the analysis is ready."}
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionStrip({
  sections,
  mode,
  status,
  showTemplatePicker,
  onToggleTemplatePicker,
  onAddTemplate,
  onJump,
  isAddingTemplate,
  availableTemplates,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => onJump(section.id)}
                className="min-w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
              >
                <span className="text-xs font-semibold text-slate-900">{section.title}</span>
              </button>
            ))}
        </div>

        {mode === "edit" && status === "complete" && (
          <button
            type="button"
            onClick={onToggleTemplatePicker}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Add section
          </button>
        )}
      </div>

      {mode === "edit" && status === "complete" && showTemplatePicker && (
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {availableTemplates.map((template) => (
            <button
              key={template.type}
              type="button"
              onClick={() => onAddTemplate(template.type)}
              disabled={isAddingTemplate}
              className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60"
            >
              {template.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OverviewSummaryPanel({ summary, scoreBreakdown }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(186,230,253,0.35),_transparent_40%),linear-gradient(135deg,_#ffffff,_#f8fafc)] p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Overall Read</p>
      <h2 className="mt-2 text-xl font-bold tracking-[-0.04em] text-slate-900">How this resume is landing against the JD</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{summary || "The review is ready. Use the tags and suggestions below to tighten the strongest evidence first."}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Keyword coverage", scoreBreakdown.keyword_coverage],
            ["Experience", scoreBreakdown.experience_alignment],
            ["Skill coverage", scoreBreakdown.skill_coverage],
            ["Section completeness", scoreBreakdown.section_completeness],
            ["Gap penalty", scoreBreakdown.critical_gap_penalty],
          ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/70 bg-white/85 p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
            <p className="mt-1.5 text-xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </div>
  );
}

function EditResumeCanvas({ sections, status, onOpenTarget, onAddEntry, isMutating, sectionRefs }) {
  return (
    <div className="grid gap-4">
      {sections.map((section) => (
        <div
          key={section.id}
          ref={(node) => {
            sectionRefs.current[section.id] = node;
          }}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
            <button type="button" onClick={() => onOpenTarget("section", section.id)} className="space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{section.type}</p>
                <AnnotationBadge annotationType={section.annotation_type} />
                {typeof section.score === "number" && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {section.score}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold tracking-[-0.04em] text-slate-900">{section.title}</h3>
              {section.explanation && <p className="max-w-3xl text-sm leading-6 text-slate-500">{section.explanation}</p>}
            </button>

            {section.can_add_entries && status === "complete" && (
              <button
                type="button"
                onClick={() => onAddEntry(section)}
                disabled={isMutating}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Add entry
              </button>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {status === "processing" && <SectionSkeleton />}

            {section.entries.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <button type="button" onClick={() => onOpenTarget("entry", entry.id)} className="w-full text-left">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold text-slate-900">{entry.title}</h4>
                        <AnnotationBadge annotationType={entry.annotation_type} />
                        {typeof entry.score === "number" && (
                          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            {entry.score}
                          </span>
                        )}
                      </div>
                      {(entry.subtitle || entry.date_range) && (
                        <p className="text-sm text-slate-500">
                          {[entry.subtitle, entry.date_range].filter(Boolean).join("  •  ")}
                        </p>
                      )}
                      {entry.explanation && <p className="text-sm leading-6 text-slate-500">{entry.explanation}</p>}
                    </div>
                    {entry.keywords_missing?.length > 0 && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                        Missing {entry.keywords_missing.join(", ")}
                      </span>
                    )}
                  </div>
                </button>

                <div className="mt-3 space-y-2.5">
                  {entry.bullets.map((bullet) => (
                    <BulletRow key={bullet.id} bullet={bullet} onClick={() => onOpenTarget("bullet", bullet.id)} />
                  ))}
                  {!entry.bullets.length && (
                    <EmptyPlaceholder label="No bullets here yet. Use a grounded insert suggestion or add a template first." />
                  )}
                </div>
              </article>
            ))}

            {section.bullets.length > 0 && (
              <div className="space-y-3">
                {section.bullets.map((bullet) => (
                  <BulletRow key={bullet.id} bullet={bullet} onClick={() => onOpenTarget("bullet", bullet.id)} />
                ))}
              </div>
            )}

            {!section.entries.length && !section.bullets.length && status !== "processing" && (
              <EmptyPlaceholder label="This section is empty. Add a template or apply a missing-evidence suggestion to start filling it." />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewResumeCanvas({ sections, sectionRefs }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff,_#f8fafc)] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
      <div className="mx-auto max-w-4xl space-y-6">
        {sections.map((section) => (
          <div
            key={section.id}
            ref={(node) => {
              sectionRefs.current[section.id] = node;
            }}
            className="border-b border-slate-100 pb-6 last:border-b-0 last:pb-0"
          >
            <div className="flex items-end justify-between gap-4">
              <h3 className="text-lg font-semibold uppercase tracking-[0.24em] text-slate-500">{section.title}</h3>
            </div>

            {section.entries.length > 0 && (
              <div className="mt-4 space-y-5">
                {section.entries.map((entry) => (
                  <article key={entry.id}>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-slate-900">{entry.title}</h4>
                        {entry.subtitle && <p className="text-sm text-slate-500">{entry.subtitle}</p>}
                      </div>
                      {entry.date_range && <p className="text-sm font-medium text-slate-500">{entry.date_range}</p>}
                    </div>
                    {entry.bullets.length > 0 && (
                      <ul className="mt-3 space-y-2 pl-5 text-sm leading-7 text-slate-700">
                        {entry.bullets.map((bullet) => (
                          <li key={bullet.id} className="list-disc">
                            {bullet.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            )}

            {section.bullets.length > 0 && (
              <ul className="mt-4 space-y-2 pl-5 text-sm leading-7 text-slate-700">
                {section.bullets.map((bullet) => (
                  <li key={bullet.id} className="list-disc">
                    {bullet.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BulletRow({ bullet, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-3.5 py-3.5 text-left transition-colors ${
        bullet.applied_overlay_id
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <AnnotationBadge annotationType={bullet.annotation_type} />
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              {formatScoreImpact(bullet.score_impact)}
            </span>
            {bullet.applied_overlay_id && (
              <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                Applied
              </span>
            )}
            {bullet.is_generated && (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                Drafted insert
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{bullet.text}</p>
          {bullet.explanation && <p className="mt-2 text-sm leading-6 text-slate-500">{bullet.explanation}</p>}
        </div>
      </div>
    </button>
  );
}

function SelectionSheet({
  open,
  target,
  loadingSuggestions,
  suggestions,
  onClose,
  onApply,
  onRevert,
  isApplying,
  isReverting,
}) {
  if (!open) {
    return null;
  }

  const { node, targetType, section } = target;
  const actionable = isSuggestionActionable(target);

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl">
        <div className="ml-auto flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_40px_120px_rgba(15,23,42,0.25)]">
          <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <AnnotationBadge annotationType={node.annotation_type} />
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{targetType}</span>
                {typeof node.score === "number" && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {node.score}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold tracking-[-0.04em] text-slate-900">
                {targetType === "bullet" ? "Bullet review" : node.title || section?.title}
              </h2>
              {section && <p className="text-sm text-slate-500">{section.title}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              {targetType === "bullet" ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Current bullet</p>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{node.text}</p>
                </div>
              ) : (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Current focus</p>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{node.explanation || "This selection is ready for review."}</p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="Score impact" value={formatScoreImpact(node.score_impact)} />
                <StatCard label="Matched keywords" value={node.keywords_matched?.length ? node.keywords_matched.join(", ") : "None yet"} />
              </div>

              {node.keywords_missing?.length > 0 && (
                <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">Missing evidence</p>
                  <p className="mt-3 text-sm leading-7 text-rose-700">{node.keywords_missing.join(", ")}</p>
                </div>
              )}

              <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Evaluation</p>
                <p className="mt-3 text-sm leading-7 text-slate-700">{node.explanation || "This selection is not carrying strong role-fit evidence yet."}</p>
              </div>

              {node.applied_overlay_id && (
                <button
                  type="button"
                  onClick={() => onRevert(node.applied_overlay_id)}
                  disabled={isReverting}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
                >
                  <RotateCcw className="h-4 w-4" />
                  Revert applied change
                </button>
              )}

              {actionable && !node.applied_overlay_id && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-semibold text-slate-900">AI enhancement options</p>
                  </div>
                  {loadingSuggestions && (
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Drafting suggestions from the selected context...
                    </div>
                  )}
                  {!loadingSuggestions && suggestions.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      No actionable suggestions were generated for this selection yet.
                    </div>
                  )}
                  {suggestions.map((suggestion) => (
                    <div key={suggestion.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                      <div className="flex flex-col gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                              {suggestion.label}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                              {formatScoreImpact(suggestion.score_delta)}
                            </span>
                          </div>
                          <p className="text-sm leading-7 text-slate-700">{suggestion.text}</p>
                          {suggestion.rationale && <p className="text-sm leading-6 text-slate-500">{suggestion.rationale}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => onApply(suggestion)}
                            disabled={isApplying}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                          >
                            <Sparkles className="h-4 w-4" />
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyResumeState() {
  return (
    <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
      <FileWarning className="mx-auto h-16 w-16 text-slate-300" />
      <h2 className="mt-5 text-2xl font-bold tracking-[-0.04em] text-slate-900">Upload a resume before reviewing job fit</h2>
      <p className="mt-3 text-sm leading-7 text-slate-500">
        This page is designed to score your resume against the JD and show targeted improvements. Add your active resume first.
      </p>
      <Link
        to="/resume"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
      >
        Go to resume management
      </Link>
    </div>
  );
}

function UndoBar({ message, progress, onUndo, isUndoing }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.18)]">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Enhancement applied</p>
          <p className="mt-1 text-sm text-slate-500">{message}</p>
        </div>
        <button
          type="button"
          onClick={onUndo}
          disabled={isUndoing}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
        >
          <RotateCcw className="h-4 w-4" />
          Undo
        </button>
      </div>
      <div className="h-1 bg-slate-100">
        <div className="h-full bg-blue-600 transition-[width] duration-[5000ms] ease-linear" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function SignalList({ title, items, emptyLabel, onOpenTarget }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">{title}</p>
      <div className="mt-4 space-y-3">
        {!items?.length && <p className="text-sm text-slate-500">{emptyLabel}</p>}
        {items?.map((item) => (
          <button
            key={`${item.target_type}-${item.target_id}`}
            type="button"
            onClick={() => onOpenTarget(item.target_type, item.target_id)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
          >
            <div className="flex flex-wrap items-center gap-2">
              <AnnotationBadge annotationType={item.annotation_type} />
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                {formatScoreImpact(item.score_impact)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{item.title}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function KeywordPanel({ keywordSummary }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Keyword coverage</p>
      <div className="mt-4 space-y-4">
        <KeywordGroup label="Matched" tone="match" items={keywordSummary?.matched || []} />
        <KeywordGroup label="Missing" tone="missing" items={keywordSummary?.missing || []} />
        <KeywordGroup label="Nice to have" tone="neutral" items={keywordSummary?.nice_to_have_missing || []} />
      </div>
    </div>
  );
}

function KeywordGroup({ label, tone, items }) {
  const styles = {
    match: "border-emerald-200 bg-emerald-50 text-emerald-700",
    missing: "border-rose-200 bg-rose-50 text-rose-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-500",
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-sm text-slate-500">None</span>}
        {items.map((item) => (
          <span key={item} className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles[tone]}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function AnnotationBadge({ annotationType }) {
  const meta = ANNOTATION_META[annotationType] || ANNOTATION_META.neutral;
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badge}`}
      title={meta.label}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function ScoreRing({ score, loading }) {
  const [displayScore, setDisplayScore] = useState(typeof score === "number" ? score : 0);
  const previousScoreRef = useRef(typeof score === "number" ? score : 0);
  const firstPaintRef = useRef(true);

  useEffect(() => {
    if (loading || typeof score !== "number") {
      return;
    }

    if (firstPaintRef.current) {
      firstPaintRef.current = false;
      previousScoreRef.current = score;
      setDisplayScore(score);
      return;
    }

    const start = previousScoreRef.current;
    const end = score;
    const duration = 400;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(start + (end - start) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previousScoreRef.current = end;
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [loading, score]);

  if (loading || typeof score !== "number") {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, displayScore));
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const stroke = clamped >= 75 ? "#059669" : clamped >= 50 ? "#2563eb" : "#dc2626";

  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">{clamped}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const meta = {
    complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
    processing: "border-blue-200 bg-blue-50 text-blue-700",
    error: "border-rose-200 bg-rose-50 text-rose-700",
    no_resume: "border-slate-200 bg-slate-50 text-slate-600",
  };

  const label = {
    complete: "Analysis ready",
    processing: "Analysis processing",
    error: "Analysis error",
    no_resume: "Resume required",
  }[status];

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${meta[status] || meta.no_resume}`}>{label}</span>;
}

function StateCard({ tone, title, description }) {
  const styles = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
  };

  return (
    <div className={`rounded-[28px] border p-6 ${styles[tone]}`}>
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-3 text-sm leading-7">{description}</p>
    </div>
  );
}

function EmptyPlaceholder({ label }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
      {label}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((index) => (
        <div key={index} className="animate-pulse rounded-[24px] border border-slate-200 bg-slate-50 p-5">
          <div className="h-4 w-40 rounded-full bg-slate-200" />
          <div className="mt-3 h-3 w-2/3 rounded-full bg-slate-200" />
          <div className="mt-6 space-y-2">
            <div className="h-3 rounded-full bg-white" />
            <div className="h-3 w-5/6 rounded-full bg-white" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingShell() {
  return (
    <>
      <div className="animate-pulse rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-4 w-32 rounded-full bg-slate-200" />
        <div className="mt-4 h-8 w-3/4 rounded-full bg-slate-200" />
        <div className="mt-3 h-4 w-1/2 rounded-full bg-slate-100" />
      </div>
      <div className="animate-pulse rounded-[26px] border border-slate-200 bg-white p-5">
        <div className="h-16 rounded-[18px] bg-slate-100" />
      </div>
      <div className="grid gap-5">
        {[0, 1].map((index) => (
          <div key={index} className="animate-pulse rounded-[30px] border border-slate-200 bg-white p-6">
            <div className="h-6 w-40 rounded-full bg-slate-200" />
            <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-100" />
            <div className="mt-6 space-y-3">
              <div className="h-20 rounded-[20px] bg-slate-50" />
              <div className="h-20 rounded-[20px] bg-slate-50" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-sm leading-7 text-slate-700">{value}</p>
    </div>
  );
}

function locateTarget(sections, selectedTarget) {
  if (!selectedTarget) {
    return null;
  }

  for (const section of sections) {
    if (selectedTarget.targetType === "section" && section.id === selectedTarget.nodeId) {
      return { targetType: "section", node: section, section };
    }

    for (const entry of section.entries) {
      if (selectedTarget.targetType === "entry" && entry.id === selectedTarget.nodeId) {
        return { targetType: "entry", node: entry, section, entry };
      }
      for (const bullet of entry.bullets) {
        if (selectedTarget.targetType === "bullet" && bullet.id === selectedTarget.nodeId) {
          return { targetType: "bullet", node: bullet, section, entry };
        }
      }
    }

    for (const bullet of section.bullets) {
      if (selectedTarget.targetType === "bullet" && bullet.id === selectedTarget.nodeId) {
        return { targetType: "bullet", node: bullet, section, entry: null };
      }
    }
  }

  return null;
}

function isSuggestionActionable(target) {
  if (!target) {
    return false;
  }
  if (target.targetType === "bullet") {
    return target.node.annotation_type === "needs_rewrite";
  }
  return target.node.annotation_type === "missing_evidence";
}

function formatScoreImpact(value) {
  const numeric = typeof value === "number" ? value : 0;
  if (numeric > 0) {
    return `+${numeric}`;
  }
  return `${numeric}`;
}
