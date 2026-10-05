import { createDiscussionNow, redirectAfter } from "@/lib/discussions";

export async function POST(request: Request) {
  return redirectAfter(await createDiscussionNow(await request.formData()));
}
