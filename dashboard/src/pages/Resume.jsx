import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { deleteResume, fetchResume, uploadResume } from "../api/client";
import { formatSavedDateTime } from "../utils/formatting";

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
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-panel">
        <p className="text-sm font-medium text-gray-500">Resume Management</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Keep one active resume on file</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
          New uploads replace the existing resume. Previously analyzed posts stay as-is; only future saved roles use the latest resume.
        </p>
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
                <p className="mt-1 text-sm text-gray-500">{resumeQuery.data.text_length} characters extracted</p>
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
            <p className="text-sm font-medium text-gray-500">Preview</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{resumeQuery.data.preview_text}</p>
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
