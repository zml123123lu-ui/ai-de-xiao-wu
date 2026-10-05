import { deleteReplyNow, redirectAfter } from "@/lib/discussions";

export async function POST(request: Request) {
  return redirectAfter(await deleteReplyNow(await request.formData()));
}
