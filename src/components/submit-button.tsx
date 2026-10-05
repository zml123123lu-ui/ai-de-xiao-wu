"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingText = "正在保存…", className = "button primary", name, value, formAction }: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
}) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} name={name} value={value} formAction={formAction} type="submit">{pending ? pendingText : children}</button>;
}
