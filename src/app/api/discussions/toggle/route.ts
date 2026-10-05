import { toggleDiscussionNow, redirectAfter } from "@/lib/discussions";

export async function POST(request: Request) {
  return redirectAfter(await toggleDiscussionNow(await request.formData()));
}
