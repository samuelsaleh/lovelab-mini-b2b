# Agent folders and files

Private file trees per agent (contracts, personal price lists, anything an
admin wants to share with one agent). Rows in `agent_folders` /
`agent_folder_files`, bytes in the `documents` bucket. "Owner" below means the
agent whose `agent_id` is on the folder (resolved across same-email ids);
organization members may list a team folder.

| Method | Path | Auth | RL | Purpose |
|---|---|---|---|---|
| GET | `/api/agent-folders?agent_id=…\|organization_id=…[&parent_id=…]` | A / owner / org member | 60 | Folders at one level |
| POST | `/api/agent-folders` | A / owner | 30 | Create a subfolder |
| PATCH | `/api/agent-folders/[id]` | A / owner | 30 | Rename |
| DELETE | `/api/agent-folders/[id]` | A / owner | 20 | Delete the subtree and its files (root folder refused) |
| GET | `/api/agent-folder-files?folder_id=…` | A / owner | 60 | Files in a folder |
| POST | `/api/agent-folder-files` | A / owner | 20 | Upload (multipart `file`, `folder_id`; ≤ 25 MB; PDF, image, Office, txt, csv) |
| GET | `/api/agent-folder-files/[id]` | A / owner | none | `{ "url": "<signed, 1 h>", "name": "…" }` |
| PATCH | `/api/agent-folder-files/[id]` | A / owner | 30 | Rename `{ "name" }` |
| DELETE | `/api/agent-folder-files/[id]` | A / owner | 30 | Delete file and row |
| GET | `/api/org-folders` | S | 60 | Sidebar tree for the Team page |

Bodies: `POST /api/agent-folders { "agent_id", "name", "parent_id?" }`,
`PATCH { "name" }`. Responses are `{ "folders": [ … ] }`, `{ "folder": { … } }`,
`{ "files": [ … ] }`, `{ "file": { … } }`, `{ "ok": true }`.

### `GET /api/org-folders`

Builds the left-hand tree: for each organization the caller belongs to (all of
them for admins), the root, the sub-agents and each member's subfolders with
`doc_count`. Admins also receive `commercials` (agents outside any
organization).

```json
{ "orgFolders": [ { "organization": { "id", "name" }, "root": { … },
                   "members": [ { "profile": { … }, "folder": { … }, "doc_count": 4 } ] } ],
  "commercials": [ … ] }
```

Related: `POST /api/organizations/[id]/folders/provision` (re)creates the tree
idempotently; `scripts/backfill-org-folders.mjs`, `inspect-agent-folders.mjs`,
`cleanup-agent-folders.mjs`.
