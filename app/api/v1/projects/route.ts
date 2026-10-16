import { json, parseJson, withApi } from "@/lib/server/http";
import { requireUser } from "@/lib/server/auth";
import { projectDetailsSchema } from "@/lib/projects";
import { createProject, listProjects } from "@/lib/server/services/projects.service";

export const GET = withApi(async () => json(await listProjects((await requireUser()).id)));
export const POST = withApi(async (req) => {
  const user = await requireUser();
  return json(await createProject(user.id, await parseJson(req, projectDetailsSchema)), { status: 201 });
});
