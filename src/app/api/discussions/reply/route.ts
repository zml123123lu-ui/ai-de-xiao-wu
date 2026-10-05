import { createReplyFor, redirectAfter } from "@/lib/discussions";

export async function POST(request: Request) {
  return redirectAfter(await createReplyFor(await request.formData()));
}
