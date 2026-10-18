// 035 part B. The pages of a copy: plain HTML a browser opens from a folder.
//
// No script, no remote anything, and every word a person typed is escaped
// text. A link is a link only when it is http or https. The same rows are in
// `data.json` for a program; these are for a person.

import { dayIn, describeRule, parseRule } from "@offload/widgets";

export interface CopyFile {
  /** Path inside the archive: `files/<blob id>.<ext>`. An id, never a name. */
  path: string;
  kind: "image" | "audio" | "pdf";
  name: string | null;
}

export interface CopyRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  location: string | null;
  done: boolean;
  archived: boolean;
  dueAt: string | null;
  occursAt: string | null;
  occursEndAt: string | null;
  /** That it comes round again, as its RFC 5545 rule, anchored on
   *  `occursAt` for an event and `dueAt` for everything else. */
  rrule?: string | null;
  addedAt: string;
  /** Who added it. Null when that account is gone. */
  author: string | null;
  labels: string[];
  files: CopyFile[];
  reminder?: CopyReminder;
}

/** S33. offload's kind of date, and the author's Remind me as their switch
 *  shows it: on, off, or null when not set. Only on the account's own things. */
export interface CopyReminder {
  kind: string | null;
  remindMe: "on" | "off" | null;
}

export interface CopyNote {
  text: string;
  body: string | null;
  author: string | null;
  addedAt: string;
  /** A note can come round again too: its rule, anchored on whichever of the
   *  two dates it has. */
  occursAt?: string | null;
  dueAt?: string | null;
  rrule?: string | null;
  reminder?: CopyReminder;
}

export interface CopyThread {
  /** Its number in the archive: `threads/<n>.html`. */
  n: number;
  id: string;
  name: string;
  shared: boolean;
  /** Everyone else in it, by name. */
  members: string[];
  labels: string[];
  notes: CopyNote[];
  rows: CopyRow[];
}

export interface CopyMessage {
  from: "you" | "offload";
  text: string | null;
  transcript: string | null;
  at: string;
  files: CopyFile[];
}

export interface CopyConversation {
  startedAt: string;
  messages: CopyMessage[];
}

export interface Copy {
  madeAt: string;
  timeZone: string;
  threads: CopyThread[];
  conversations: CopyConversation[];
  /** What offload keeps about the person and the people they named. */
  notes: (CopyNote & { about: "you" | "someone"; how?: "you asked" | "you answered" | "offload learned" | "you added" | "you changed"; kind?: string })[];
  people: { name: string }[];
}

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The archive is opened from a folder, years on, with no stylesheet of ours
// beside it, so there are no tokens to consume: the browser's own system
// colours, which follow the reader's light or dark, and nothing fixed.
const STYLE =
  ":root{color-scheme:light dark}" +
  "body{font:1rem/1.5 system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem}" +
  "h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:2rem}" +
  "article{border-top:thin solid GrayText;padding:.75rem 0}article h3{font-size:1rem;margin:0}" +
  "p{margin:.25rem 0;white-space:pre-wrap}.quiet{color:GrayText;font-size:.875rem}" +
  "img{max-width:100%;height:auto;display:block;margin:.5rem 0}audio{display:block;margin:.5rem 0}";

function page(title: string, body: string, up: string | null): string {
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><style>${STYLE}</style></head><body>` +
    (up ? `<p class="quiet"><a href="${up}">offload</a></p>` : "") +
    `<h1>${esc(title)}</h1>${body}</body></html>\n`
  );
}

function when(iso: string, timeZone: string, time = true): string {
  const options: Intl.DateTimeFormatOptions = { timeZone, day: "numeric", month: "short", year: "numeric" };
  if (time) Object.assign(options, { hour: "2-digit", minute: "2-digit", hour12: false });
  try {
    return new Intl.DateTimeFormat("en-GB", options).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(iso));
  }
}

function link(url: string): string {
  return /^https?:\/\//i.test(url) ? `<a href="${esc(url)}" rel="noreferrer">${esc(url)}</a>` : esc(url);
}

function files(list: CopyFile[], root: string): string {
  return list
    .map((file) => {
      const src = esc(root + file.path);
      const label = esc(file.name ?? file.path.slice("files/".length));
      if (file.kind === "image") return `<a href="${src}"><img src="${src}" alt="${label}"></a>`;
      // 041. A link a browser opens in its own viewer, from the folder.
      if (file.kind === "pdf") return `<p><a href="${src}">${label}</a></p>`;
      return `<audio controls src="${src}"></audio><p class="quiet"><a href="${src}">${label}</a></p>`;
    })
    .join("");
}

/** A row's or a note's rule in the words the thread page uses, anchored on
 *  its day in the reader's zone: an event's on when it happens, a row's on when
 *  it is due, a note's on whichever date it has. Nothing for one that does not
 *  repeat or a rule the grammar does not read: the date beside it is still true
 *  of the first. */
function repeats(item: CopyRow | CopyNote, timeZone: string): string | null {
  const anchor = "type" in item ? (item.type === "event" ? item.occursAt : item.dueAt) : (item.occursAt ?? item.dueAt);
  if (!item.rrule || !anchor) return null;
  const parsed = parseRule(item.rrule);
  return parsed.ok ? esc(describeRule(parsed.rule, dayIn(new Date(anchor), timeZone), "en-GB")) : null;
}

function reminder(item: CopyRow | CopyNote): string | null {
  if (!item.reminder) return null;
  const { kind, remindMe } = item.reminder;
  return [kind ? `Kind of date: ${esc(kind)}` : null, remindMe ? `Remind me ${remindMe}` : null].filter(Boolean).join(" · ") || null;
}

const by = (author: string | null): string => `Added by ${author === null ? "someone who has gone" : esc(author)}`;

export function indexPage(copy: Copy): string {
  const threads = copy.threads
    .map((thread) => `<li><a href="threads/${thread.n}.html">${esc(thread.name)}</a> <span class="quiet">${thread.rows.length}</span></li>`)
    .join("");
  return page(
    "offload",
    `<p>Your copy, made ${when(copy.madeAt, copy.timeZone)}.</p>` +
      `<h2>Threads</h2><ul>${threads}</ul>` +
      `<h2>Everything else</h2><ul>` +
      `<li><a href="conversations.html">Conversations</a></li>` +
      `<li><a href="notes.html">Notes</a></li>` +
      `<li><a href="people.html">People</a></li></ul>` +
      `<p class="quiet">Photos and voice notes are in the files folder. All of it is in data.json too, for a program to read.</p>`,
    null,
  );
}

export function threadPage(thread: CopyThread, timeZone: string): string {
  const head =
    (thread.members.length > 0 ? `<p class="quiet">Shared with ${thread.members.map(esc).join(", ")}</p>` : "") +
    (thread.labels.length > 0 ? `<p class="quiet">Labels: ${thread.labels.map(esc).join(", ")}</p>` : "");
  const notes =
    thread.notes.length === 0
      ? ""
      : `<h2>Notes</h2>` +
        thread.notes
          .map(
            (note) =>
              `<article><p>${esc(note.text)}</p>${note.body ? `<p>${esc(note.body)}</p>` : ""}` +
              (repeats(note, timeZone) ? `<p class="quiet">${repeats(note, timeZone)}</p>` : "") +
              (reminder(note) ? `<p class="quiet">${reminder(note)}</p>` : "") +
              (thread.shared ? `<p class="quiet">${by(note.author)}</p>` : "") +
              `</article>`,
          )
          .join("");
  const rows = thread.rows
    .map((row) => {
      const facts = [
        row.occursAt ? `On ${when(row.occursAt, timeZone)}${row.occursEndAt ? ` to ${when(row.occursEndAt, timeZone)}` : ""}` : null,
        row.dueAt ? `Due ${when(row.dueAt, timeZone)}` : null,
        repeats(row, timeZone),
        row.location ? esc(row.location) : null,
        row.done ? "Done" : null,
        row.archived ? "Archived" : null,
        row.labels.length > 0 ? row.labels.map(esc).join(", ") : null,
        reminder(row),
      ].filter(Boolean);
      const foot = [thread.shared ? by(row.author) : null, when(row.addedAt, timeZone)].filter(Boolean).join(" · ");
      return (
        `<article><h3>${esc(row.title)}</h3>` +
        (row.body ? `<p>${esc(row.body)}</p>` : "") +
        (row.url ? `<p>${link(row.url)}</p>` : "") +
        files(row.files, "../") +
        (facts.length > 0 ? `<p class="quiet">${facts.join(" · ")}</p>` : "") +
        `<p class="quiet">${foot}</p></article>`
      );
    })
    .join("");
  return page(thread.name, head + notes + (notes ? `<h2>In this thread</h2>` : "") + rows, "../index.html");
}

export function conversationsPage(copy: Copy): string {
  const body = copy.conversations
    .map(
      (conversation) =>
        `<h2>${when(conversation.startedAt, copy.timeZone, false)}</h2>` +
        conversation.messages
          .map(
            (message) =>
              `<article><p class="quiet">${message.from === "you" ? "You" : "offload"} · ${when(message.at, copy.timeZone)}</p>` +
              (message.text ? `<p>${esc(message.text)}</p>` : "") +
              (message.transcript ? `<p>${esc(message.transcript)}</p>` : "") +
              files(message.files, "") +
              `</article>`,
          )
          .join(""),
    )
    .join("");
  return page("Conversations", body, "index.html");
}

export function notesPage(copy: Copy): string {
  const section = (title: string, about: "you" | "someone") => {
    const notes = copy.notes.filter((note) => note.about === about);
    if (notes.length === 0) return "";
    return (
      `<h2>${title}</h2>` +
      notes
        .map(
          (note) =>
            `<article><p>${esc(note.text)}</p>${note.body ? `<p>${esc(note.body)}</p>` : ""}` +
            `${note.how ? `<p class="quiet">${esc(`${note.how[0]!.toUpperCase()}${note.how.slice(1)}`)} · ${esc(note.addedAt.slice(0, 10))}</p>` : ""}` +
            `${reminder(note) ? `<p class="quiet">${reminder(note)}</p>` : ""}</article>`,
        )
        .join("")
    );
  };
  return page("Notes", section("About you", "you") + section("About people you named", "someone"), "index.html");
}

export function peoplePage(copy: Copy): string {
  return page("People", `<ul>${copy.people.map((person) => `<li>${esc(person.name)}</li>`).join("")}</ul>`, "index.html");
}
