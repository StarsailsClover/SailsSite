import type { Post, PostInput } from "@/lib/api";

export type StudioDraft = PostInput & {
  id: string;
  version: number;
  featured: boolean;
  updatedAt: string;
  createdAt: string;
};

export type EditorTab = "edit" | "preview" | "history";
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

export function toDraft(post: Post): StudioDraft {
  return {
    id: post.id,
    version: post.version,
    title: post.title,
    slug: post.slug,
    description: post.description,
    bodyMarkdown: post.bodyMarkdown,
    coverUrl: post.coverUrl,
    tags: post.tags,
    status: post.status,
    publishedAt: post.publishedAt,
    featured: post.featured,
    updatedAt: post.updatedAt,
    createdAt: post.createdAt,
  };
}

export function draftPayload(draft: StudioDraft): PostInput & { expectedVersion: number } {
  return {
    title: draft.title,
    slug: draft.slug,
    description: draft.description,
    bodyMarkdown: draft.bodyMarkdown,
    coverUrl: draft.coverUrl,
    tags: draft.tags,
    status: draft.status,
    publishedAt: draft.publishedAt,
    expectedVersion: draft.version,
  };
}

export function formatStudioDate(value: string | null | undefined) {
  if (!value) return "尚未发布";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
}
