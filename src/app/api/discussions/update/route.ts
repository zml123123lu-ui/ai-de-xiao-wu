import { redirectAfter, updateDiscussionNow } from "@/lib/discussions";

export async function POST(request: Request) {
  return redirectAfter(await updateDiscussionNow(await request.formData()));
}
