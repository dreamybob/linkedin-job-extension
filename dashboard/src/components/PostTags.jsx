const TAG_STYLES = {
  important: "border-blue-200 bg-blue-50 text-blue-700",
  irrelevant: "border-gray-200 bg-gray-100 text-gray-700",
  immediate_joiner: "border-purple-200 bg-purple-50 text-purple-700",
  mandatory_missing: "border-amber-200 bg-amber-50 text-amber-700",
};

export function buildPostTags(post) {
  const tags = [];

  if (post.is_important) {
    tags.push({ key: "important", label: "Important" });
  }
  if (post.is_irrelevant) {
    tags.push({ key: "irrelevant", label: "Irrelevant Opening" });
  }
  if (post.immediate_joiner_preferred) {
    tags.push({ key: "immediate_joiner", label: "Immediate Joiner Preferred" });
  }
  if (post.mandatory_qualification_missing) {
    tags.push({ key: "mandatory_missing", label: "Mandatory Qualification Missing" });
  }

  return tags;
}

export default function PostTags({ post, limit }) {
  const tags = buildPostTags(post);
  const visibleTags = typeof limit === "number" ? tags.slice(0, limit) : tags;

  if (!visibleTags.length) {
    return <span className="text-sm text-gray-400">No tags</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {visibleTags.map((tag) => (
        <span
          key={tag.key}
          className={`rounded-md border px-2.5 py-0.5 text-xs font-medium ${TAG_STYLES[tag.key]}`}
        >
          {tag.label}
        </span>
      ))}
      {typeof limit === "number" && tags.length > limit && (
        <span className="rounded-md border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-500">
          +{tags.length - limit}
        </span>
      )}
    </div>
  );
}
