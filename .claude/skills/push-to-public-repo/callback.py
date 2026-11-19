# git filter-repo --file-info-callback body: decides what each file becomes in
# the public copy. Runs once per file change; must be deterministic, because a
# rebuild has to reproduce the last public history exactly to fast-forward it.
#
# DROP   gone from every commit (bulk, private, or someone else's)
# STUB   kept as a one-paragraph page, so links to it still land somewhere
# RENAME a file whose name carries a real person's name
DROP = (
    b".claude/skills/offload-design/uploads/",
    b"docs/experiments/2026-10-swarm-tuning/rounds/",
    b"docs/experiments/2026-10-swarm-tuning/research-orchestration.md",
)
STUB = (
    b"docs/sweeps/",
    b"docs/tech/going-public.md",
    b"docs/tech/security-review-2026-09-22.md",
    b"docs/tech/vendor-terms/",
)
KEEP_INSIDE_STUB = (b"docs/tech/vendor-terms/README.md",)
RENAME = {
    b"docs/experiments/2026-10-meaning-floor/cast/meera.json":
        b"docs/experiments/2026-10-meaning-floor/cast/meera.json",
}

if filename.startswith(DROP):
    return (None, mode, blob_id)
filename = RENAME.get(filename, filename)

key = (filename, blob_id)
if key in value.data:
    return (filename, mode, value.data[key])

if filename.startswith(STUB) and filename not in KEEP_INSIDE_STUB:
    if filename.endswith(b".json"):
        new = b"{}\n"
    elif filename.endswith(b".md"):
        new = (b"# Kept private\n\nThis document lives in the private repository only. "
               b"It holds operational or third-party material that is not published.\n")
    else:
        new = b"Kept private: this file lives in the private repository only.\n"
else:
    contents = value.get_contents_by_identifier(blob_id)
    if value.is_binary(contents):
        value.data[key] = blob_id
        return (filename, mode, blob_id)
    new = value.apply_replace_text(contents)

new_id = value.insert_file_with_contents(new)
value.data[key] = new_id
return (filename, mode, new_id)
