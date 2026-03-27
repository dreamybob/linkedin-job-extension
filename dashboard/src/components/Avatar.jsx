import { getAvatarInitial, getAvatarStyle } from "../utils/avatar";

export default function Avatar({ name, size = "sm" }) {
  const sizeClasses = size === "md" ? "h-12 w-12 text-base" : "h-8 w-8 text-sm";

  return (
    <div
      className={`inline-flex items-center justify-center rounded-md font-semibold ${sizeClasses} ${getAvatarStyle(name)}`}
      aria-hidden="true"
    >
      {getAvatarInitial(name)}
    </div>
  );
}
