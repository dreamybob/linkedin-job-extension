import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  MapPin,
  MessageSquare,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { deletePost, fetchPost, updatePostLabels } from "../api/client";
import Avatar from "../components/Avatar";
import FitmentBadge from "../components/FitmentBadge";
import GapsList from "../components/GapsList";
import PostTags from "../components/PostTags";
import RequirementsList from "../components/RequirementsList";
import StatusBadge from "../components/StatusBadge";
import { usePollingInterval } from "../hooks/usePollingInterval";
import { formatSavedDateTime } from "../utils/formatting";
import { getPostEyebrow, getPostTitle } from "../utils/postPresentation";

export default function PostDetail() {
  const { id } = useParams();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["post", id],
    queryFn: () => fetchPost(id),
    refetchInterval: (query) => usePollingInterval(query.state.data?.status),
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

  if (isLoading) {
    return <StateCard tone="info" title="Loading analysis" description="Gathering role details and fit signals." />;
  }

  if (error || !data) {
    return <StateCard tone="error" title="Failed to load post" description="The detail view could not be loaded." />;
  }

  const fitmentSummary =
    data.fitment_summary ||
    (data.status === "error"
      ? data.error_message || "Analysis failed before the role could be extracted."
      : "Analysis is still in progress.");

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-blue-700">
          <ArrowLeft className="h-4 w-4" />
          Back to posts
        </Link>

        <div className="flex flex-wrap gap-3">
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
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-500">{getPostEyebrow(data)}</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">{getPostTitle(data)}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Avatar name={data.poster_name} size="md" />
              <div className="min-w-0">
                {data.poster_profile_url ? (
                  <a
                    href={data.poster_profile_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
                  >
                    {data.poster_name || "Unknown poster"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="text-sm font-semibold text-gray-900">{data.poster_name || "Unknown poster"}</p>
                )}
                <p className="text-sm text-gray-500">{data.poster_headline || "Poster headline not available"}</p>
              </div>
            </div>
            <div className="mt-4">
              <PostTags post={data} />
            </div>
            {data.error_message && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{data.error_message}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <FitmentBadge score={data.fitment_score} />
            <StatusBadge status={data.status} />
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <InfoCard icon={Building2} title="Company" value={data.company_name || "Unknown"} />
          <InfoCard icon={MapPin} title="Location" value={data.location || "Unknown"} />
          <InfoCard icon={Globe} title="Work mode" value={data.remote_status || "Unknown"} />
          <InfoCard icon={UserRound} title="Saved on" value={formatSavedDateTime(data.saved_at)} />
          <InfoCard icon={Link2} title="Company profile" value={<ExternalValue href={data.company_linkedin_url}>Open company on LinkedIn</ExternalValue>} />
          <InfoCard icon={Send} title="Apply method" value={data.application_method || "Unknown"} />
          <InfoCard icon={MessageSquare} title="Required PM experience" value={data.required_pm_experience || data.experience_years || "Not specified"} />
          <InfoCard icon={ExternalLink} title="Post URL" value={<ExternalValue href={data.post_url}>Open LinkedIn post</ExternalValue>} />
        </div>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Fitment summary</h2>
        <p className="mt-3 text-sm leading-7 text-gray-700">{fitmentSummary}</p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Application guidance</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <DetailLine label="Application method" value={data.application_method || "Unknown"} />
          <DetailLine label="Apply link" value={<ExternalValue href={data.apply_url}>Open application link</ExternalValue>} />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Qualification checks</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className={`rounded-lg border p-4 ${data.immediate_joiner_preferred ? "border-purple-200 bg-purple-50" : "border-gray-200 bg-gray-50"}`}>
            <p className="text-sm font-medium text-gray-500">Immediate Joiner Preferred</p>
            <p className={`mt-2 text-sm font-semibold ${data.immediate_joiner_preferred ? "text-purple-700" : "text-gray-700"}`}>
              {data.immediate_joiner_preferred ? "Yes, called out in the post." : "Not clearly required."}
            </p>
          </div>
          <div className={`rounded-lg border p-4 ${data.mandatory_qualification_missing ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
            <p className="text-sm font-medium text-gray-500">Mandatory Qualification Missing</p>
            <p className={`mt-2 text-sm font-semibold ${data.mandatory_qualification_missing ? "text-amber-700" : "text-gray-700"}`}>
              {data.mandatory_qualification_missing ? "Potential blocker detected." : "No clear mandatory blocker detected."}
            </p>
          </div>
        </div>

        {data.mandatory_qualification_reasons?.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-700">What appears to be missing</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-700">
              {data.mandatory_qualification_reasons.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {data.mandatory_qualification_details?.length > 0 && (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-amber-700">
                {data.mandatory_qualification_details.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <RequirementsList
        mustHaveSkills={data.must_have_skills}
        niceToHaveSkills={data.nice_to_have_skills}
        experienceYears={data.experience_years}
        cultureSignals={data.culture_signals}
        redFlags={data.red_flags}
      />

      <GapsList
        strongMatches={data.strong_matches}
        gaps={data.gaps}
        anglesToEmphasize={data.angles_to_emphasize}
        outreachTalkingPoints={data.outreach_talking_points}
      />

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Linked content</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
          {data.linked_content || "No external links were fetched for this post."}
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900">Original post text</h2>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
          {expanded ? data.post_text : `${data.post_text.slice(0, 700)}${data.post_text.length > 700 ? "…" : ""}`}
        </p>
      </section>
    </section>
  );
}

function InfoCard({ icon: Icon, title, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        <Icon className="h-4 w-4 text-gray-400" />
        <span>{title}</span>
      </div>
      <div className="mt-2 text-sm text-gray-700">{value}</div>
    </div>
  );
}

function DetailLine({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <div className="mt-2 text-sm text-gray-700">{value}</div>
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
