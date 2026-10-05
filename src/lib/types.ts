import type { Mood } from "./domain";

export type Profile = {
  id: string;
  display_name: string;
  avatar_color: string;
};

export type Discussion = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author?: Profile;
};

export type Reply = {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author?: Profile;
};

export type Letter = {
  id: string;
  sender_id: string;
  recipient_id: string;
  title: string;
  body: string;
  status: "draft" | "sent";
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  read_at: string | null;
  reply_to_id: string | null;
  sender?: Profile;
  recipient?: Profile;
};

export type DailyStatus = {
  id: string;
  author_id: string;
  status_date: string;
  mood: Mood;
  body: string;
  created_at: string;
  updated_at: string;
  author?: Profile;
};

export type Notification = {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: "discussion" | "reply" | "letter" | "daily_status";
  resource_id: string;
  created_at: string;
  read_at: string | null;
  actor?: Profile;
};
