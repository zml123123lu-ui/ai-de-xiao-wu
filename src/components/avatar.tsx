import type { Profile } from "@/lib/types";

export function Avatar({ profile, size = "normal" }: { profile?: Profile; size?: "small" | "normal" }) {
  return <span className={`avatar ${size}`} style={{ backgroundColor: profile?.avatar_color ?? "#8e796c" }} aria-hidden="true">{profile?.display_name?.slice(0, 1) ?? "?"}</span>;
}
