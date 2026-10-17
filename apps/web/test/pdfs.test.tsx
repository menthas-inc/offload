// @vitest-environment happy-dom
//
// 041. PDFs on the web: what the composer takes and refuses, the chip, opening
// a PDF in the browser's own viewer, and the Storage copy.
//
// AC-2  the button is the paperclip, "Add a photo or PDF"; a pasted PDF does
//       not attach.
// AC-3  a PDF chip: paperclip, a name clipped in the middle, PDF in its name.
// AC-5  ten files, two of them PDFs.
// AC-6  AC-7  the refusals and their lines.
// AC-11 a tap opens the PDF in a new tab in the same click, nothing fetched
//       first.
// AC-14 a PDF with no clean copy says so and opens nothing.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PDFS, clipMiddle, isPdf, takeFiles } from "@offload/widgets";
import {
  PhotoRefused,
  draftName,
  openPdf,
  openPdfSaying,
  pdfUrl,
  retryPdf,
  refuseFile,
  uploadPhoto,
} from "../src/lib/dump";
import { AttachChip } from "../src/components/shell/AttachChip";
import { AnswerResults } from "../src/components/shell/AnswerResult";
import { SentPhoto } from "../src/components/shell/SentPhoto";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

async function render(node: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(node));
  return host;
}

describe("what the composer takes", () => {
  it("knows a PDF by its type, or by its name when the browser gives no type", () => {
    expect(isPdf(file("a.pdf", "application/pdf"))).toBe(true);
    expect(isPdf(file("a.PDF", ""))).toBe(true);
    expect(isPdf(file("Boarding.pdf", "application/octet-stream"))).toBe(true);
    expect(isPdf(file("a.zip", "application/octet-stream"))).toBe(false);
    expect(isPdf(file("a.docx", ""))).toBe(false);
  });

  it("refuses what is neither, and a PDF over 20 MB", () => {
    expect(refuseFile(file("a.pdf", "application/pdf"))).toBeNull();
    expect(refuseFile(file("a.jpg", "image/jpeg"))).toBeNull();
    expect(refuseFile(file("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBe("not_a_photo");
    expect(refuseFile(file("big.pdf", "application/pdf", 20 * 1024 * 1024 + 1))).toBe("too_big");
  });

  it("takes two PDFs at most and ten files in all, and says which", () => {
    expect(MAX_PDFS).toBe(2);
    const pdf = (n: number) => Array.from({ length: n }, (_, i) => file(`p${i}.pdf`, "application/pdf"));
    const jpg = (n: number) => Array.from({ length: n }, (_, i) => file(`j${i}.jpg`, "image/jpeg"));

    const third = takeFiles([{ kind: "pdf" }], pdf(2));
    expect(third.taken).toHaveLength(1);
    expect(third.line).toBe("Two PDFs at a time.");

    const eleventh = takeFiles(Array.from({ length: 9 }, () => ({ kind: "image" as const })), jpg(2));
    expect(eleventh.taken).toHaveLength(1);
    expect(eleventh.line).toBe("Ten at a time.");

    const both = takeFiles([], [...pdf(3), ...jpg(1)]);
    expect(both.taken.map((f) => f.name)).toEqual(["p0.pdf", "p1.pdf", "j0.jpg"]);
    expect(both.line).toBe("Two PDFs at a time.");
  });

  it("names an unnamed PDF PDF, PDF 2, counting the draft's unnamed PDFs", () => {
    expect(draftName(file("", "application/pdf"), [])).toBe("PDF");
    expect(draftName(file("", "application/pdf"), [{ kind: "pdf", named: false }])).toBe("PDF 2");
    expect(draftName(file("", "application/pdf"), [{ kind: "image", named: false }])).toBe("PDF");
    expect(draftName(file("Boarding pass.pdf", "application/pdf"), [])).toBe("Boarding pass.pdf");
  });

  it("hears a locked PDF from the server as its own refusal", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "locked_pdf" }), { status: 415 }));
    await expect(uploadPhoto(file("a.pdf", "application/pdf"), "k")).rejects.toEqual(new PhotoRefused("locked_pdf"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "not_a_photo" }), { status: 415 }));
    await expect(uploadPhoto(file("a.pdf", "application/pdf"), "k")).rejects.toEqual(new PhotoRefused("not_a_photo"));
  });
});

describe("the chip", () => {
  it("clips a long name in the middle, keeping what tells two apart", () => {
    expect(clipMiddle("Boarding_pass_TAP_LIS_14OCT.pdf")).toBe("Boarding_…_14OCT.pdf");
    expect(clipMiddle("short.pdf")).toBe("short.pdf");
  });

  it("draws a PDF with the paperclip, says PDF in its name, and has the lines", async () => {
    const host = await render(<AttachChip name="Boarding_pass_TAP_LIS_14OCT.pdf" file={file("Boarding_pass_TAP_LIS_14OCT.pdf", "application/pdf")} kind="pdf" error="locked_pdf" onRemove={() => {}} />);
    expect(host.querySelector('[aria-label="PDF, Boarding_pass_TAP_LIS_14OCT.pdf"]')).not.toBeNull();
    expect(host.innerHTML).toContain("paperclip.svg");
    expect(host.textContent).toContain("Boarding_…_14OCT.pdf");
    expect(host.textContent).toContain("Only unlocked PDFs.");
    const photo = await render(<AttachChip name="a.docx" file={file("a.docx", "")} kind="image" error="not_a_photo" onRemove={() => {}} />);
    expect(photo.textContent).toContain("Only photos and PDFs.");
  });
});

describe("opening a PDF", () => {
  const tab = () => ({ opener: {} as unknown, close: vi.fn(), location: { replace: vi.fn() } });

  it("opens the PDF's own route in a new tab, in the click, with nothing fetched first", () => {
    const opened = tab();
    const open = vi.spyOn(window, "open").mockReturnValue(opened as never);
    const fetched = vi.spyOn(globalThis, "fetch");
    expect(openPdf({ blobId: "b1", openable: true })).toBe("opened");
    expect(open).toHaveBeenCalledWith(pdfUrl("b1"), "_blank");
    // Nothing in the tab can reach back to offload's.
    expect(opened.opener).toBeNull();
    expect(pdfUrl("b1")).toMatch(/\/v1\/blobs\/b1\/pdf$/);
    expect(fetched).not.toHaveBeenCalled();
  });

  it("knows when the browser blocked the tab, which noopener would hide", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(openPdf({ blobId: "b1", openable: true })).toBe("blocked");
  });

  it("opens nothing for a PDF with no clean copy, and says which kind of nothing", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(openPdf({ blobId: "b1", openable: false })).toBe("not_yet");
    expect(openPdf({ blobId: "b1", openable: false, unreadable: true })).toBe("never");
    expect(open).not.toHaveBeenCalled();
  });

  it("retries in a tab opened in the click, sent to the PDF only once the server has it", async () => {
    const ready = tab();
    vi.spyOn(window, "open").mockReturnValue(ready as never);
    const head = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    expect(await retryPdf("b1")).toBe("opened");
    expect(head).toHaveBeenCalledWith(pdfUrl("b1"), expect.objectContaining({ method: "HEAD", credentials: "include" }));
    expect(ready.location.replace).toHaveBeenCalledWith(pdfUrl("b1"));

    const waiting = tab();
    vi.spyOn(window, "open").mockReturnValue(waiting as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    expect(await retryPdf("b1")).toBe("not_yet");
    expect(waiting.close).toHaveBeenCalled();
    expect(waiting.location.replace).not.toHaveBeenCalled();
  });

  it("says what happened with Retry, except for a PDF that will never open", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const say = vi.fn();
    openPdfSaying({ blobId: "b1", openable: false }, say);
    expect(say).toHaveBeenLastCalledWith("Not here yet.", expect.any(Function));
    openPdfSaying({ blobId: "b1", openable: true }, say);
    expect(say).toHaveBeenLastCalledWith("Did not open.", expect.any(Function));
    openPdfSaying({ blobId: "b1", openable: false, unreadable: true }, say);
    expect(say).toHaveBeenLastCalledWith("Can't open this one.");
  });

  it("draws a sent PDF with the paperclip until page 1 exists, named to open", async () => {
    const onOpen = vi.fn();
    const host = await render(
      <SentPhoto photo={{ blobId: "b1", kind: "pdf", name: "Boarding pass.pdf", pages: 1, ready: false, openable: true }} onOpen={onOpen} />,
    );
    const button = host.querySelector<HTMLButtonElement>('[aria-label="Open Boarding pass.pdf"]')!;
    expect(host.innerHTML).toContain("paperclip.svg");
    await act(async () => button.click());
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("a settled turn", () => {
  it("takes each file's state from the answer, keeping the device's own copy", async () => {
    const { settledPhotos } = await import("../src/lib/dump");
    const sent = [
      { blobId: "p1", kind: "image" as const, name: "a.jpg", width: 1, height: 1, ready: false, localUrl: "blob:a" },
      { blobId: "d1", kind: "pdf" as const, name: "b.pdf", ready: false, openable: false },
    ];
    const answered = [
      { blobId: "p1", kind: "image" as const, name: "a.jpg", width: 4, height: 3, ready: true },
      { blobId: "d1", kind: "pdf" as const, name: "b.pdf", pages: 2, ready: true, openable: true, unreadable: false },
    ];
    expect(settledPhotos(sent, answered)).toEqual([
      { blobId: "p1", kind: "image", name: "a.jpg", width: 4, height: 3, ready: true, localUrl: "blob:a" },
      { blobId: "d1", kind: "pdf", name: "b.pdf", pages: 2, ready: true, openable: true, unreadable: false },
    ]);
    // An answer without files, as an older server sends, still marks photos ready.
    expect(settledPhotos(sent, undefined)?.[0]?.ready).toBe(true);
  });
});

describe("an answer's rows", () => {
  it("draw a PDF's paperclip until page 1 exists, never the photo glyph", async () => {
    const host = await render(
      <AnswerResults
        found={[
          {
            threadId: "t1",
            threadName: "Istanbul trip",
            threadIcon: null,
            threadHue: null,
            truncated: false,
            rows: [
              {
                contentId: "c1",
                threadId: "t1",
                threadName: "Istanbul trip",
                type: "file",
                title: "Boarding pass, Lisbon to Istanbul",
                body: null,
                done: false,
                dueAt: null,
                occursAt: null,
                occursEndAt: null,
                allDay: false,
                rrule: null,
                photo: { blobId: "b1", kind: "pdf", pages: 1, ready: false, openable: false },
              },
            ],
          },
        ]}
      />,
    );
    expect(host.innerHTML).toContain("paperclip.svg");
    expect(host.innerHTML).not.toContain("image.svg");
  });
});
