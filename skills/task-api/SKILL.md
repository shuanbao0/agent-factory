# Task API Skill

Query and update tasks via the Agent Factory HTTP API.

## Base URL

`http://127.0.0.1:3100/api/agent-tasks`

## Authentication

All requests require a Bearer token:

```
Authorization: Bearer agent-factory-internal-token-2026
```

## Endpoints

### GET — Query your tasks

```bash
curl -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  "http://127.0.0.1:3100/api/agent-tasks?agent=YOUR_AGENT_ID"
```

Optional filters: `?status=pending`, `?projectId=xxx`, `?type=writing`

### POST — Create a task

```bash
curl -X POST -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "YOUR_AGENT_ID",
    "name": "Task name",
    "description": "Task details",
    "projectId": "optional-project-id",
    "type": "writing",
    "priority": "P1",
    "dependencies": []
  }' \
  "http://127.0.0.1:3100/api/agent-tasks"
```

### PUT — Update a task

```bash
curl -X PUT -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "YOUR_AGENT_ID",
    "taskId": "task-xxx",
    "status": "in_progress",
    "progress": 50,
    "output": "path/to/output"
  }' \
  "http://127.0.0.1:3100/api/agent-tasks"
```

#### Status values

`pending` | `assigned` | `in_progress` | `review` | `completed` | `failed`

#### Submit quality self-check

```bash
curl -X PUT -H "Authorization: Bearer $AGENT_FACTORY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "YOUR_AGENT_ID",
    "taskId": "task-xxx",
    "quality": {
      "selfCheck": {
        "passed": true,
        "score": 85,
        "checklist": ["grammar", "plot", "pacing"],
        "at": "2026-03-09T10:00:00Z"
      }
    }
  }' \
  "http://127.0.0.1:3100/api/agent-tasks"
```

## Dependency Check

Setting status to `in_progress` will fail with 409 if any dependency tasks are not completed.

## Pipeline

When a task is completed and its type has a downstream pipeline step (configured per department), a follow-up task is automatically created.
