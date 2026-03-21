import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteResume, fetchResume, uploadResume } from "../api/client";

export default function Resume() {
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);

  const resumeQuery = useQuery({
    queryKey: ["resume"],
    queryFn: fetchResume,
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: (file) =>
      uploadResume(file, (event) => {
        if (event.total) {
          setProgress(Math.round((event.loaded / event.total) * 100));
        }
      }),
    onSuccess: async () => {
      setProgress(100);
      await queryClient.invalidateQueries({ queryKey: ["resume"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteResume,
    onSuccess: async () => {
      setProgress(0);
      await queryClient.invalidateQueries({ queryKey: ["resume"] });
    },
  });

  const handleFile = (file) => {
    if (!file) return;
    setProgress(0);
    uploadMutation.mutate(file);
  };

  return (
    <section className="space-y-6">
      <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.25em] text-mist/55">Resume management</p>
        <h1 className="mt-2 font-display text-4xl text-white">Keep one active resume on file</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-mist/75">
          New uploads replace the existing resume. Previously analyzed posts will stay as-is; only new saved posts use the latest resume.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-56 w-full flex-col items-center justify-center rounded-[32px] border border-dashed border-electric/35 bg-electric/10 p-8 text-center shadow-panel"
      >
        <span className="font-display text-3xl text-white">Drop in a PDF resume</span>
        <span className="mt-3 max-w-xl text-sm leading-6 text-mist/75">
          Click to browse. PDF only, max 5 MB. We extract the text and use it for fitment scoring on future saved roles.
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {(uploadMutation.isPending || progress > 0) && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between text-sm text-mist/75">
            <span>Upload progress</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-electric transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {uploadMutation.error && (
        <div className="rounded-3xl border border-danger/30 bg-danger/10 p-5 text-danger">
          {uploadMutation.error.response?.data?.detail || "Upload failed."}
        </div>
      )}

      {resumeQuery.data && (
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-mist/55">Current resume</p>
              <h2 className="mt-2 font-display text-3xl text-white">{resumeQuery.data.filename}</h2>
              <p className="mt-2 text-sm text-mist/70">Uploaded {new Date(resumeQuery.data.uploaded_at).toLocaleString()}</p>
              <p className="mt-1 text-sm text-mist/60">{resumeQuery.data.text_length} characters extracted</p>
            </div>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              className="rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger"
            >
              Delete resume
            </button>
          </div>
          <div className="mt-5 rounded-3xl border border-white/10 bg-ink/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-mist/55">Preview</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-mist/80">{resumeQuery.data.preview_text}</p>
          </div>
        </div>
      )}

      {resumeQuery.isError && !resumeQuery.data && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-mist/70">
          No resume uploaded yet.
        </div>
      )}
    </section>
  );
}

