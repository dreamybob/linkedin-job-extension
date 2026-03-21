function firstMeaningfulLine(text) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
}

export function getPostTitle(post) {
  const fallback = firstMeaningfulLine(post.post_text);
  if (post.job_title) {
    return post.job_title;
  }
  if (fallback) {
    return fallback.length > 90 ? `${fallback.slice(0, 87)}...` : fallback;
  }
  return "LinkedIn post captured";
}

export function getPostEyebrow(post) {
  if (post.company_name) {
    return post.company_name;
  }
  return post.status === "error" ? "Analysis failed" : "Awaiting analysis";
}
