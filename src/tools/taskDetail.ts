/**
 * Task Detail MCP Tool
 *
 * Returns a task by UUID enriched with its comments and file attachment links
 * in a single call, using parallel fetching for efficiency.
 */
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { GitScrumClient } from "../client/GitScrumClient.js";
import {
  success,
  required,
  type ToolResponse,
} from "./shared/actionHandler.js";

// ============================================================================
// Tool Registration
// ============================================================================

export function registerTaskDetailTools(): Tool[] {
  return [
    {
      name: "task_detail",
      description: [
        "Fetch a task by UUID together with its comments and file attachment links in one call.",
        "",
        "- Requires: uuid (task UUID)",
        "- company_slug and project_slug are resolved automatically from the task if omitted",
        "- Returns: { task, comments, attachments } as a combined object",
      ].join("\n"),
      inputSchema: {
        type: "object" as const,
        properties: {
          uuid: {
            type: "string",
            description: "Task UUID",
          },
          company_slug: {
            type: "string",
            description: "Workspace identifier (resolved automatically if omitted)",
          },
          project_slug: {
            type: "string",
            description: "Project identifier (resolved automatically if omitted)",
          },
        },
        required: ["uuid"],
      },
      annotations: {
        title: "Task Detail (with comments & files)",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];
}

// ============================================================================
// Types
// ============================================================================

interface TaskDetailArgs {
  uuid: string;
  company_slug?: string;
  project_slug?: string;
}

// ============================================================================
// Handler
// ============================================================================

export async function handleTaskDetailTool(
  client: GitScrumClient,
  _name: string,
  args: Record<string, unknown>
): Promise<ToolResponse> {
  const { uuid, company_slug, project_slug } = args as unknown as TaskDetailArgs;

  if (!uuid) return required("uuid");

  // Fetch base task first to resolve company/project slugs if needed
  const task = await client.getTask(uuid, project_slug ?? "", company_slug ?? "");
  const taskData = task as Record<string, unknown>;

  // Use slugs directly from the task object — avoids resolveProjectContext
  // which can silently transform the project_slug via a search lookup.
  const companySlug =
    company_slug ||
    ((taskData?.company as Record<string, unknown>)?.slug as string);
  const projectSlug =
    project_slug ||
    ((taskData?.project as Record<string, unknown>)?.slug as string);

  if (!companySlug || !projectSlug) {
    return required("company_slug and project_slug (could not be resolved from task data)");
  }

  // Fetch comments and attachments in parallel
  const [commentsResult, attachmentsResult] = await Promise.all([
    client.getTaskComments(uuid, companySlug, projectSlug),
    client.getTaskAttachments(uuid, companySlug, projectSlug),
  ]);

  const comments = commentsResult;
  const attachments = attachmentsResult;

  // Surface title and description at the top level for easy access
  const title = (taskData?.title as string) ?? null;
  const description = (taskData?.description as string) ?? null;

  return success(
    JSON.stringify({ title, description, task, comments, attachments }, null, 2),
    {
      company_slug: companySlug,
      project_slug: projectSlug,
      task_uuid: uuid,
    }
  );
}
