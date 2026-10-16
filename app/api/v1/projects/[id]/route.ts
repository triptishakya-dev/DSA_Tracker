import { json, noContent, parseJson, withApi } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { projectPatchSchema } from "@/lib/projects";
import { deleteProject, updateProject } from "@/lib/server/services/projects.service";

type Context = { params: Promise<{ id: string }> };
export const PATCH = withApi(async (req, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  return json(await updateProject(user.id, id, await parseJson(req, projectPatchSchema)));
});
export const DELETE = withApi(async (_req, context: Context) => {
  const user = await requireUser();
  await deleteProject(user.id, (await context.params).id);
  return noContent();
});
