const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadPlugin() {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "plugin.js"), "utf8");
  return vm.runInNewContext(source, { Blob, Buffer, URL, console });
}

test("finds PDF attachments by mime type and filename", () => {
  const plugin = loadPlugin();
  const pdfs = plugin._findPdfAttachments([
    { uuid: "1", name: "paper.pdf" },
    { uuid: "2", name: "diagram.png", type: "image/png" },
    { uuid: "3", filename: "scan", mimeType: "application/pdf" }
  ]);

  assert.deepEqual(pdfs.map((pdf) => pdf.uuid), ["1", "3"]);
});

test("normalizes annotation geometry into safe page-relative coordinates", () => {
  const plugin = loadPlugin();
  const annotation = plugin._normalizeAnnotation({
    id: "x",
    type: "comment",
    page: "2.9",
    rect: { x: -0.5, y: 0.8, width: 2, height: 0.5 },
    comment: "  Important note  "
  });

  assert.equal(annotation.page, 2);
  assert.equal(annotation.type, "comment");
  assert.deepEqual(JSON.parse(JSON.stringify(annotation.rect)), { x: 0, y: 0.8, width: 1, height: 0.19999999999999996 });
  assert.equal(annotation.comment, "Important note");
});

test("formats a markdown table of PDF annotations", () => {
  const plugin = loadPlugin();
  const markdown = plugin._formatAnnotationsMarkdown({
    attachment: { name: "research.pdf" },
    annotations: [
      plugin._normalizeAnnotation({
        page: 3,
        type: "highlight",
        rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        comment: "cashflow | assumption"
      })
    ],
    exportedPdfName: "annotated-research.pdf"
  });

  assert.match(markdown, /Source PDF: `research\.pdf`/);
  assert.match(markdown, /\| 3 \| highlight \| cashflow \\\| assumption \| 10%, 20%, 30%, 40% \|/);
  assert.match(markdown, /annotated-research\.pdf/);
});

test("upserts the PDF annotation section without touching later sections", () => {
  const plugin = loadPlugin();
  const updated = plugin._upsertMarkdownSection(
    "# Note\n\nBody\n\n## PDF Annotations\n\nold\n\n## Keep\n\nstay",
    "PDF Annotations",
    "new"
  );

  assert.equal(updated, "# Note\n\nBody\n\n## PDF Annotations\n\nnew\n\n## Keep\n\nstay");
});

test("saveAnnotations replaces note content with the annotation summary", async () => {
  const plugin = loadPlugin();
  let replaced = "";
  const alerts = [];
  const app = {
    async getNoteContent(noteHandle) {
      assert.deepEqual(JSON.parse(JSON.stringify(noteHandle)), { uuid: "note-1" });
      return "# Meeting\n\nCurrent body";
    },
    async replaceNoteContent(noteHandle, markdown) {
      assert.deepEqual(JSON.parse(JSON.stringify(noteHandle)), { uuid: "note-1" });
      replaced = markdown;
    },
    async alert(message) {
      alerts.push(message);
    }
  };

  const result = await plugin._saveAnnotations(app, {
    noteUUID: "note-1",
    attachment: { name: "agenda.pdf" },
    annotations: [{ page: 1, rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, comment: "Follow up" }]
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, count: 1 });
  assert.match(replaced, /## PDF Annotations/);
  assert.match(replaced, /Follow up/);
  assert.equal(alerts[0], "Saved 1 PDF annotation to this note.");
});

test("note option opens an embed with a proxied PDF attachment URL", async () => {
  const plugin = loadPlugin();
  let embedContext;
  const app = {
    async getNoteAttachments(noteHandle) {
      assert.deepEqual(JSON.parse(JSON.stringify(noteHandle)), { uuid: "note-1" });
      return [{ uuid: "pdf-1", name: "report.pdf", type: "application/pdf" }];
    },
    async getAttachmentURL(uuid) {
      assert.equal(uuid, "pdf-1");
      return "https://attachments.example/report.pdf?download=1";
    },
    async openSidebarEmbed(aspectRatio, context) {
      assert.equal(aspectRatio, 0.75);
      embedContext = context;
      return true;
    }
  };

  await plugin.noteOption["Annotate PDF"].call(plugin, app, "note-1");

  assert.equal(embedContext.noteUUID, "note-1");
  assert.equal(embedContext.attachment.uuid, "pdf-1");
  assert.match(embedContext.proxiedURL, /^https:\/\/plugins\.amplenote\.com\/cors-proxy\?apiurl=/);
});

test("note option falls back to full embed when sidebar embed is unavailable", async () => {
  const plugin = loadPlugin();
  let embedContext;
  const app = {
    async getNoteAttachments() {
      return [{ uuid: "pdf-1", name: "report.pdf", type: "application/pdf" }];
    },
    async getAttachmentURL() {
      return "https://attachments.example/report.pdf?download=1";
    },
    async openSidebarEmbed() {
      return false;
    },
    async openEmbed(context) {
      embedContext = context;
    }
  };

  await plugin.noteOption["Annotate PDF"].call(plugin, app, "note-1");

  assert.equal(embedContext.noteUUID, "note-1");
});

test("saveAnnotatedPdf attaches a marked-up PDF back to the note when supported", async () => {
  const plugin = loadPlugin();
  let attached;
  let replaced = "";
  const alerts = [];
  const result = await plugin._saveAnnotatedPdf({
    async attachNoteMedia(noteHandle, dataURL) {
      attached = { noteHandle, dataURL };
      return "https://files.example/annotated.pdf";
    },
    async getNoteContent() {
      return "# Note";
    },
    async replaceNoteContent(noteHandle, markdown) {
      assert.deepEqual(JSON.parse(JSON.stringify(noteHandle)), { uuid: "note-1" });
      replaced = markdown;
    },
    async alert(message) {
      alerts.push(message);
    }
  }, {
    noteUUID: "note-1",
    annotatedPdfBase64: Buffer.from("%PDF").toString("base64"),
    exportedPdfName: "marked-up.pdf",
    attachment: { name: "source.pdf" },
    annotations: []
  });

  assert.equal(result.attached, true);
  assert.equal(result.fileURL, "https://files.example/annotated.pdf");
  assert.deepEqual(JSON.parse(JSON.stringify(attached.noteHandle)), { uuid: "note-1" });
  assert.match(attached.dataURL, /^data:application\/pdf;base64,/);
  assert.match(replaced, /\[marked-up\.pdf\]\(https:\/\/files\.example\/annotated\.pdf\)/);
  assert.equal(alerts[0], "Saved 0 PDF annotations to this note.");
});

test("saveAnnotatedPdf downloads a sanitized PDF filename when attachment upload is unavailable", async () => {
  const plugin = loadPlugin();
  let saved;
  const result = await plugin._saveAnnotatedPdf({
    async attachNoteMedia() {
      throw new Error("not allowed");
    },
    async alert(message) {
      assert.match(message, /downloaded instead/);
    },
    async saveFile(blob, fileName) {
      saved = { blob, fileName };
    }
  }, {
    noteUUID: "note-1",
    annotatedPdfBase64: Buffer.from("%PDF").toString("base64"),
    exportedPdfName: "bad/name?.pdf"
  });

  assert.equal(result.fileName, "bad-name-.pdf");
  assert.equal(result.attached, false);
  assert.equal(saved.fileName, "bad-name-.pdf");
  assert.equal(saved.blob.type, "application/pdf");
});
