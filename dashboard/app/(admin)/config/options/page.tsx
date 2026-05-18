import { redirect } from "next/navigation";

export default function ConfigOptionsPage() {
  redirect("/settings?tab=options");
}
