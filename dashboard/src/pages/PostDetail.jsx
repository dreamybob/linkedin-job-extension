import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deletePost, fetchPost } from "../api/client";
import FitmentBadge from "../components/FitmentBadge";
import StatusBadge from "../components/StatusBadge";
import RequirementsList from "../components/RequirementsList";
import GapsList from "../components/GapsList";
import { usePollingInterval } from "../hooks/usePollingInterval";

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

  if (isLoading) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-mist/70">Loading analysis…</div>;
  }

  if (error || !data) {
    return <div className="rounded-3xl border border-danger/30 bg-danger/10 p-8 text-danger">Failed to load the post.</div>;
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-mist/70 transition hover:text-white">
          ← Back to posts
        </Link>
        <button
          type="button"
          onClick={() => deleteMutation.mutate()}
          className="rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger"
        >
          Delete post
        </button>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-mist/55">{data.company_name || "Awaiting analysis"}</p>
            <h1 className="mt-2 font-display text-4xl text-white">{data.job_title || "LinkedIn post captured"}</h1>
            <p className="mt-3 text-sm text-mist/70">
              {data.poster_name || "Unknown poster"}
              {data.poster_headline ? ` · ${data.poster_headline}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <FitmentBadge score={data.fitment_score} />
            <StatusBadge status={data.status} />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InfoCard title="Location" value={data.location || "Unknown"} />
          <InfoCard title="Work mode" value={data.remote_status || "unknown"} />
          <InfoCard title="Seniority" value={data.seniority || "Unknown"} />
          <InfoCard title="Domain" value={data.domain || "Unknown"} />
          <InfoCard title="Compensation" value={data.compensation || "Not listed"} />
          <InfoCard title="Post URL" value={<ExternalLink href={data.post_url}>Open LinkedIn post</ExternalLink>} />
        </div>
      </div>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel">
        <h2 className="font-display text-2xl text-white">Fitment summary</h2>
        <p className="mt-3 text-base leading-7 text-mist/85">{data.fitment_summary || "Analysis is still in progress."}</p>
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

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel">
        <h2 className="font-display text-2xl text-white">Linked content</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-mist/80">
          {data.linked_content || "No external links were fetched for this post."}
        </p>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-white">Original post text</h2>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-mist"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-mist/80">
          {expanded ? data.post_text : `${data.post_text.slice(0, 400)}${data.post_text.length > 400 ? "…" : ""}`}
        </p>
      </section>
    </section>
  );
}

function InfoCard({ title, value }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-ink/45 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-mist/55">{title}</p>
      <div className="mt-2 text-sm text-mist">{value}</div>
    </div>
  );
}

function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-electric hover:text-white">
      {children}
    </a>
  );
}

