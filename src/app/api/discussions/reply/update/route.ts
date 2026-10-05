import { redirectAfter, updateReplyFor } from "@/lib/discussions";

export async function POST(request: Request) {
  return redirectAfter(await updateReplyFor(await request.formData()));
}
