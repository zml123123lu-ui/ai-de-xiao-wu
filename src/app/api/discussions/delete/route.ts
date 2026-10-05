import { deleteDiscussionNow, redirectAfter } from "@/lib/discussions";

export async function POST(request: Request) {
  return redirectAfter(await deleteDiscussionNow(await request.formData()));
}
