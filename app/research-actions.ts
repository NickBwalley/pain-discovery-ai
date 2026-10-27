"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { researchProject, type ResearchFormState } from "@/lib/research";

export async function searchResearch(
  _previous: ResearchFormState,
  form: FormData,
): Promise<ResearchFormState> {
  const { db, user } = await requireUser();
  let project;
  try {
    project = researchProject(form.getAll("categories"));
  } catch (error) {
    return {
      error:
        error instanceof z.ZodError
          ? error.issues[0].message
          : "Choose a category to get started.",
    };
  }
  const { data, error } = await db
    .from("research_projects")
    .insert({ ...project, owner_id: user.id })
    .select("id")
    .single();
  if (error || !data)
    return { error: "We couldn't create your research. Please try again." };
  // Searching is collection-only: no hidden paid AI calls or provider requirements.
  const queued = await db.rpc("enqueue_discovery", {
    p_project: data.id,
    p_ai: false,
    p_cap: 60,
    p_calls: 1,
  });
  revalidatePath("/");
  redirect(
    `/projects/${data.id}${queued.error ? "?notice=Your%20search%20could%20not%20start.%20Please%20try%20a%20new%20search." : ""}`,
  );
}
