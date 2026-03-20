# Project API Skill

Query, create, and delete projects via the Agent Factory HTTP API.

## Base URL

`http://127.0.0.1:3100/api/projects`

## Authentication

All requests require a Bearer token:

```
Authorization: Bearer agent-factory-internal-token-2026
```

## Concepts

- Projects live under `projects/{department}/{project-slug}/`
- Project ID format: `{department}/{slug}` (e.g. `novel/chapter-1`, `tech/mobile-app`)
- Each department can have multiple projects
- Tasks are linked to projects via `projectId`

## Endpoints

### GET — List projects

```bash
curl -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  "http://127.0.0.1:3100/api/projects"
```

Filter by department:

```bash
curl -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  "http://127.0.0.1:3100/api/projects?department=novel"
```

### POST — Create a project

```bash
curl -X POST -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Chapter 1 Draft",
    "description": "First chapter of the novel",
    "department": "novel"
  }' \
  "http://127.0.0.1:3100/api/projects"
```

When `department` is provided, the project is created under `projects/{department}/{slug}/` with ID `{department}/{slug}`.

### DELETE — Delete a project

```bash
curl -X DELETE -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "novel/chapter-1"}' \
  "http://127.0.0.1:3100/api/projects"
```

## Usage in Department Workflow

As a department head, create projects to organize your team's work:

1. **Create a project** for each distinct work item (e.g. each novel, each product)
2. **Create tasks** under that project using `projectId` in the Task API
3. **Assign tasks** to team members via peer-send

Example workflow:
```bash
# 1. Create project
curl -X POST -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Novel","description":"A fantasy novel","department":"novel"}' \
  "http://127.0.0.1:3100/api/projects"

# 2. Create task under that project
curl -X POST -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent":"novel-chief","name":"Write Chapter 1","projectId":"novel/my-novel","type":"writing","assignees":["novel-writer"]}' \
  "http://127.0.0.1:3100/api/agent-tasks"
```
