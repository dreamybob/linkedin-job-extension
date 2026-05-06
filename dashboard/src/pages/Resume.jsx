import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, Trash2, UploadCloud } from "lucide-react";
import { deleteResume, fetchStructuredResume, uploadResume } from "../api/client";
import { formatSavedDateTime } from "../utils/formatting";

export default function Resume() {
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);

  const resumeQuery = useQuery({
    queryKey: ["resume-structured"],
    queryFn: fetchStructuredResume,
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
      await queryClient.invalidateQueries({ queryKey: ["resume-structured"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteResume,
    onSuccess: async () => {
      setProgress(0);
      await queryClient.invalidateQueries({ queryKey: ["resume-structured"] });
    },
  });

  const handleFile = (file) => {
    if (!file) return;
    const confirmed = window.confirm(
      "Upload this as your new active resume? Existing job analyses will stay as-is and will not be re-run automatically."
    );
    if (!confirmed) {
      return;
    }
    setProgress(0);
    uploadMutation.mutate(file);
  };

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-panel">
        <p className="text-sm font-medium text-gray-500">Resume Management</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Keep one active resume on file</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
          New uploads become the active source for future analysis. Existing job reviews stay frozen on the resume version they were built against.
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">Uploading a new resume does not re-run older job analyses</p>
            <p className="mt-1 text-sm leading-6 text-amber-700">
              Previously reviewed jobs keep their current overlays and scores. Only future jobs use the newly uploaded resume until you retry an existing review.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-64 w-full flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50 p-8 text-center transition-colors hover:border-blue-300 hover:bg-blue-100/50"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
          <UploadCloud className="h-5 w-5" />
        </div>
        <span className="mt-4 text-lg font-semibold text-gray-900">Upload a PDF resume</span>
        <span className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
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
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center justify-between text-sm text-blue-700">
            <span>Upload progress</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {uploadMutation.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {uploadMutation.error.response?.data?.detail || "Upload failed."}
        </div>
      )}

      {resumeQuery.data && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Current resume</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">{resumeQuery.data.filename}</h2>
                <p className="mt-2 text-sm text-gray-500">Uploaded {formatSavedDateTime(resumeQuery.data.uploaded_at)}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {resumeQuery.data.sections.length} structured section{resumeQuery.data.sections.length === 1 ? "" : "s"} detected
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete resume
            </button>
          </div>
          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Structured preview</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {resumeQuery.data.sections.map((section) => (
                <div key={section.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{section.type}</p>
                      <h3 className="mt-1 text-base font-semibold text-gray-900">{section.title}</h3>
                    </div>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      {section.entries?.length ? `${section.entries.length} entries` : `${section.bullets?.length || 0} bullets`}
                    </span>
                  </div>
                  {section.entries?.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-gray-600">
                      {section.entries.slice(0, 3).map((entry) => (
                        <li key={entry.id}>{entry.title}</li>
                      ))}
                    </ul>
                  )}
                  {section.bullets?.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-gray-600">
                      {section.bullets.slice(0, 3).map((bullet) => (
                        <li key={bullet.id}>{bullet.text}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {resumeQuery.isError && !resumeQuery.data && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <FileText className="mx-auto h-16 w-16 text-gray-300" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">No resume uploaded yet</h2>
          <p className="mt-2 text-sm text-gray-500">Upload your latest PDF resume to enable fitment analysis for future roles.</p>
        </div>
      )}
    </section>
  );
}
