import { redirect } from "next/navigation";

export default function ConfigLegalPage() {
  redirect("/settings?tab=legal");
}
