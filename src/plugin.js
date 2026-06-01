({
  name: "PDF Annotator",
  description: "Annotate PDFs attached to the current note, export a marked-up copy, and save highlight notes back into the note.",
  version: "0.1.0",

  _sessions: {},
  _summaryHeading: "PDF Annotations",

  noteOption: {
    "Annotate PDF": async function(app, noteUUID) {
      const attachments = await app.getNoteAttachments({ uuid: noteUUID });
      const pdfs = this._findPdfAttachments(attachments);

      if (!pdfs.length) {
        await app.alert("No PDF attachments were found in this note.");
        return;
      }

      const selected = await this._choosePdf(app, pdfs);
      if (!selected) {
        return;
      }

      const attachmentURL = await app.getAttachmentURL(selected.uuid || selected.id);
      const proxiedURL = this._proxyAttachmentURL(attachmentURL);
      const context = {
        noteUUID,
        attachment: selected,
        attachmentURL,
        proxiedURL,
        annotations: []
      };

      this._sessions[this._sessionKey(context)] = context;

      if (app.openSidebarEmbed) {
        const opened = await app.openSidebarEmbed(0.75, context);
        if (opened === false) {
          await app.openEmbed(context);
        }
      } else {
        await app.openEmbed(context);
      }
    }
  },

  async _choosePdf(app, pdfs) {
    if (pdfs.length === 1 || !app.prompt) {
      return pdfs[0];
    }

    const options = pdfs.map((pdf) => ({
      label: pdf.name || pdf.filename || pdf.uuid || "Untitled PDF",
      value: pdf.uuid || pdf.id
    }));

    const result = await app.prompt("Choose a PDF to annotate", {
      inputs: [
        {
          type: "select",
          name: "pdf",
          label: "PDF",
          options
        }
      ]
    });
    const selectedId = typeof result === "string" ? result : result && result.pdf;
    return pdfs.find((pdf) => (pdf.uuid || pdf.id) === selectedId) || pdfs[0];
  },

  async onEmbedCall(app, action, payload) {
    if (action === "saveAnnotations") {
      return await this._saveAnnotations(app, payload);
    }

    if (action === "saveAnnotatedPdf") {
      return await this._saveAnnotatedPdf(app, payload);
    }

    throw new Error(`Unknown PDF Annotator action: ${action}`);
  },

  async _saveAnnotations(app, payload) {
    const annotations = (payload.annotations || []).map((annotation) => this._normalizeAnnotation(annotation));
    const noteHandle = { uuid: payload.noteUUID };
    const current = await app.getNoteContent(noteHandle);
    const summary = this._formatAnnotationsMarkdown({
      attachment: payload.attachment,
      annotations,
      exportedPdfName: payload.exportedPdfName,
      attachedPdfURL: payload.attachedPdfURL
    });
    const updated = this._upsertMarkdownSection(current, this._summaryHeading, summary);

    await app.replaceNoteContent(noteHandle, updated);
    await app.alert(`Saved ${annotations.length} PDF annotation${annotations.length === 1 ? "" : "s"} to this note.`);
    return { ok: true, count: annotations.length };
  },

  async _saveAnnotatedPdf(app, payload) {
    if (!payload.annotatedPdfBase64) {
      throw new Error("The embed did not provide an annotated PDF payload.");
    }

    const bytes = this._base64ToUint8Array(payload.annotatedPdfBase64);
    const fileName = this._safeFileName(payload.exportedPdfName || `annotated-${Date.now()}.pdf`);
    const blob = new Blob([bytes], { type: "application/pdf" });

    if (app.attachNoteMedia && payload.noteUUID) {
      let fileURL;
      try {
        fileURL = await app.attachNoteMedia(
          { uuid: payload.noteUUID },
          `data:application/pdf;base64,${payload.annotatedPdfBase64}`
        );
      } catch (error) {
        await app.alert(`Could not attach the marked-up PDF to this note, so it will be downloaded instead. ${error?.message || error}`);
      }

      if (fileURL) {
        await this._saveAnnotations(app, {
          ...payload,
          exportedPdfName: fileName,
          attachedPdfURL: fileURL
        });
        return { ok: true, fileName, fileURL, attached: true };
      }
    }

    await app.saveFile(blob, fileName);
    return { ok: true, fileName, attached: false };
  },

  renderEmbed(app, ...args) {
    const data = args.find((arg) => arg && typeof arg === "object" && arg.noteUUID) || {};
    const encoded = this._escapeHtml(JSON.stringify(data));
    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f7f4; color: #202124; }
    header { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 12px; background: #ffffff; border-bottom: 1px solid #d9d9d2; }
    header h1 { margin: 0; font-size: 15px; font-weight: 650; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    button, select, input { border: 1px solid #b9b9ad; background: #fff; color: #202124; border-radius: 6px; min-height: 32px; padding: 6px 9px; font: inherit; }
    button.primary { background: #1f6f5f; border-color: #1f6f5f; color: #fff; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    main { padding: 12px; }
    .notice { padding: 12px; background: #fff8df; border: 1px solid #e0c96a; border-radius: 6px; margin-bottom: 12px; }
    .page { position: relative; margin: 0 auto 18px auto; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.14); width: fit-content; }
    canvas { display: block; max-width: calc(100vw - 24px); height: auto; }
    .overlay { position: absolute; inset: 0; cursor: crosshair; }
    .rect { position: absolute; border: 2px solid rgba(238, 184, 46, .95); background: rgba(250, 220, 79, .28); box-sizing: border-box; }
    .rect.comment { border-color: rgba(44, 128, 255, .95); background: rgba(44, 128, 255, .18); }
    .rect[data-comment]:after { content: attr(data-comment); position: absolute; left: 0; top: 100%; max-width: 260px; background: #202124; color: white; padding: 5px 7px; border-radius: 4px; font-size: 12px; white-space: normal; opacity: 0; pointer-events: none; transform: translateY(4px); }
    .rect:hover:after { opacity: 1; }
    aside { position: fixed; right: 10px; bottom: 10px; max-width: min(420px, calc(100vw - 20px)); background: #fff; border: 1px solid #d9d9d2; border-radius: 8px; box-shadow: 0 4px 18px rgba(0,0,0,.14); }
    aside h2 { margin: 0; padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #ecece7; }
    ol { margin: 0; padding: 8px 12px 10px 30px; max-height: 210px; overflow: auto; }
    li { margin: 0 0 8px 0; font-size: 13px; }
  </style>
</head>
<body>
  <script id="plugin-data" type="application/json">${encoded}</script>
  <header>
    <h1>PDF Annotator</h1>
    <div class="toolbar">
      <select id="tool" title="Annotation tool">
        <option value="highlight">Highlight</option>
        <option value="comment">Comment</option>
      </select>
      <button id="undo" title="Remove last annotation">Undo</button>
      <button id="save-summary" class="primary" title="Save annotations to note">Save Notes</button>
      <button id="export-pdf" title="Download a marked-up PDF">Export PDF</button>
    </div>
  </header>
  <main>
    <div id="status" class="notice">Loading PDF...</div>
    <div id="pages"></div>
  </main>
  <aside>
    <h2>Annotations</h2>
    <ol id="annotation-list"></ol>
  </aside>

  <script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
  <script type="module">
    const data = JSON.parse(document.getElementById("plugin-data").textContent);
    const status = document.getElementById("status");
    const pages = document.getElementById("pages");
    const list = document.getElementById("annotation-list");
    const annotations = Array.isArray(data.annotations) ? data.annotations.slice() : [];
    let pdfDocument;
    let pointerStart;

    if (!data.proxiedURL && !data.attachmentURL) {
      status.textContent = "Open this embed from a note with a PDF attachment.";
    } else {
      await loadPdf();
    }

    async function loadPdf() {
      const source = data.proxiedURL || data.attachmentURL;
      const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
      pdfDocument = await pdfjsLib.getDocument(source).promise;
      status.textContent = "Drag on a page to create a highlight or comment.";

      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.35 });
        const pageEl = document.createElement("section");
        const canvas = document.createElement("canvas");
        const overlay = document.createElement("div");
        const context = canvas.getContext("2d");

        pageEl.className = "page";
        pageEl.dataset.page = String(pageNumber);
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        overlay.className = "overlay";
        overlay.dataset.page = String(pageNumber);
        overlay.style.width = viewport.width + "px";
        overlay.style.height = viewport.height + "px";

        pageEl.style.width = viewport.width + "px";
        pageEl.style.height = viewport.height + "px";
        pageEl.append(canvas, overlay);
        pages.append(pageEl);

        await page.render({ canvasContext: context, viewport }).promise;
      }

      paintAnnotations();
      pages.addEventListener("pointerdown", startSelection);
      pages.addEventListener("pointerup", finishSelection);
    }

    function startSelection(event) {
      if (!event.target.classList.contains("overlay")) return;
      const bounds = event.target.getBoundingClientRect();
      pointerStart = {
        page: Number(event.target.dataset.page),
        overlay: event.target,
        x: (event.clientX - bounds.left) / bounds.width,
        y: (event.clientY - bounds.top) / bounds.height
      };
    }

    function finishSelection(event) {
      if (!pointerStart || event.target !== pointerStart.overlay) return;
      const bounds = event.target.getBoundingClientRect();
      const end = {
        x: (event.clientX - bounds.left) / bounds.width,
        y: (event.clientY - bounds.top) / bounds.height
      };
      const rect = {
        x: Math.min(pointerStart.x, end.x),
        y: Math.min(pointerStart.y, end.y),
        width: Math.abs(end.x - pointerStart.x),
        height: Math.abs(end.y - pointerStart.y)
      };
      pointerStart = null;

      if (rect.width < 0.01 || rect.height < 0.01) return;

      const type = document.getElementById("tool").value;
      const comment = type === "comment" ? window.prompt("Comment for this region", "") || "" : "";
      annotations.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        type,
        page: Number(event.target.dataset.page),
        rect,
        comment,
        color: type === "comment" ? "#2c80ff" : "#f6d94f"
      });
      paintAnnotations();
    }

    function paintAnnotations() {
      document.querySelectorAll(".rect").forEach((node) => node.remove());
      for (const annotation of annotations) {
        const overlay = document.querySelector('.overlay[data-page="' + annotation.page + '"]');
        if (!overlay) continue;
        const marker = document.createElement("div");
        marker.className = "rect " + (annotation.type === "comment" ? "comment" : "highlight");
        marker.style.left = (annotation.rect.x * 100) + "%";
        marker.style.top = (annotation.rect.y * 100) + "%";
        marker.style.width = (annotation.rect.width * 100) + "%";
        marker.style.height = (annotation.rect.height * 100) + "%";
        if (annotation.comment) marker.dataset.comment = annotation.comment;
        overlay.append(marker);
      }

      list.innerHTML = annotations.length
        ? annotations.map((annotation) => "<li>Page " + annotation.page + " " + annotation.type + (annotation.comment ? ": " + escapeHtml(annotation.comment) : "") + "</li>").join("")
        : "<li>No annotations yet.</li>";
    }

    document.getElementById("undo").addEventListener("click", () => {
      annotations.pop();
      paintAnnotations();
    });

    document.getElementById("save-summary").addEventListener("click", async () => {
      await window.callAmplenotePlugin("saveAnnotations", { ...data, annotations });
      status.textContent = "Saved annotations to the note.";
    });

    document.getElementById("export-pdf").addEventListener("click", async () => {
      status.textContent = "Rendering annotated PDF...";
      const exportedPdfName = "annotated-" + safeFileStem(data.attachment?.name || data.attachment?.filename || "document") + ".pdf";
      const annotatedPdfBase64 = await createAnnotatedPdfBase64(annotations);
      await window.callAmplenotePlugin("saveAnnotatedPdf", { ...data, annotations, exportedPdfName, annotatedPdfBase64 });
      status.textContent = "Downloaded marked-up PDF. Amplenote does not expose a public plugin API for replacing arbitrary PDF attachments.";
    });

    async function createAnnotatedPdfBase64(items) {
      const response = await fetch(data.proxiedURL || data.attachmentURL);
      const pdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();

      for (const annotation of items) {
        const page = pages[annotation.page - 1];
        if (!page) continue;
        const size = page.getSize();
        const x = annotation.rect.x * size.width;
        const width = annotation.rect.width * size.width;
        const height = annotation.rect.height * size.height;
        const y = size.height - (annotation.rect.y * size.height) - height;
        const color = annotation.type === "comment"
          ? PDFLib.rgb(0.18, 0.5, 1)
          : PDFLib.rgb(0.96, 0.85, 0.31);
        page.drawRectangle({ x, y, width, height, borderColor: color, borderWidth: 1.5, color, opacity: annotation.type === "comment" ? 0.18 : 0.28 });
        if (annotation.comment) {
          page.drawText(annotation.comment.slice(0, 120), { x, y: Math.max(8, y - 12), size: 9, color: PDFLib.rgb(0.05, 0.05, 0.05) });
        }
      }

      const updated = await pdfDoc.save();
      let binary = "";
      for (const byte of updated) binary += String.fromCharCode(byte);
      return btoa(binary);
    }

    function safeFileStem(name) {
      return String(name).replace(/\\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "document";
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
  </script>
</body>
</html>`;
  },

  _findPdfAttachments(attachments) {
    return (attachments || []).filter((attachment) => {
      const name = String(attachment.name || attachment.filename || attachment.fileName || "");
      const type = String(attachment.type || attachment.mimeType || attachment.contentType || "");
      return /pdf/i.test(type) || /\.pdf$/i.test(name);
    });
  },

  _normalizeAnnotation(annotation) {
    const rect = annotation.rect || {};
    const x = this._clamp(Number(rect.x) || 0, 0, 1);
    const y = this._clamp(Number(rect.y) || 0, 0, 1);
    const width = this._clamp(Number(rect.width) || 0, 0, 1 - x);
    const height = this._clamp(Number(rect.height) || 0, 0, 1 - y);
    const page = Math.max(1, Math.floor(Number(annotation.page) || 1));

    return {
      id: String(annotation.id || `${page}-${x}-${y}-${Date.now()}`),
      type: annotation.type === "comment" ? "comment" : "highlight",
      page,
      rect: { x, y, width, height },
      comment: String(annotation.comment || "").trim(),
      color: String(annotation.color || (annotation.type === "comment" ? "#2c80ff" : "#f6d94f"))
    };
  },

  _formatAnnotationsMarkdown({ attachment, annotations, exportedPdfName, attachedPdfURL }) {
    const title = attachment && (attachment.name || attachment.filename || attachment.fileName) || "PDF";
    const rows = annotations.length
      ? annotations.map((annotation) => {
        const percentRect = [
          annotation.rect.x,
          annotation.rect.y,
          annotation.rect.width,
          annotation.rect.height
        ].map((value) => `${Math.round(value * 1000) / 10}%`).join(", ");
        return `| ${annotation.page} | ${annotation.type} | ${this._escapeMarkdown(annotation.comment || "")} | ${percentRect} |`;
      }).join("\n")
      : "| - | - | No annotations captured yet. | - |";

    const exportLine = exportedPdfName && attachedPdfURL
      ? `\n\nMarked-up PDF attached to this note: [${this._escapeMarkdown(exportedPdfName)}](${attachedPdfURL}).`
      : exportedPdfName
        ? `\n\nMarked-up PDF exported locally as \`${this._escapeMarkdown(exportedPdfName)}\`. Amplenote's public plugin API exposes file download, but PDF attachment upload/replacement may be unavailable for this file or client.`
      : "\n\nUse **Export PDF** in the annotator to download a marked-up copy.";

    return `Source PDF: \`${this._escapeMarkdown(title)}\`\n\n| Page | Type | Comment | Region |\n| --- | --- | --- | --- |\n${rows}${exportLine}`;
  },

  _upsertMarkdownSection(markdown, headingText, body) {
    const source = String(markdown || "").replace(/\s+$/, "");
    const heading = `## ${headingText}`;
    const section = `${heading}\n\n${body.trim()}`;
    const pattern = new RegExp(`(^|\\n)## ${this._escapeRegExp(headingText)}\\s*\\n[\\s\\S]*?(?=\\n##\\s|$)`);

    if (pattern.test(source)) {
      return source.replace(pattern, (match, prefix) => `${prefix}${section}\n`);
    }

    return `${source}${source ? "\n\n" : ""}${section}`;
  },

  _base64ToUint8Array(base64) {
    const binary = typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  },

  _safeFileName(fileName) {
    return String(fileName).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "annotated.pdf";
  },

  _proxyAttachmentURL(attachmentURL) {
    const proxyURL = new URL("https://plugins.amplenote.com/cors-proxy");
    proxyURL.searchParams.set("apiurl", attachmentURL);
    return proxyURL.toString();
  },

  _sessionKey(context) {
    return `${context.noteUUID}:${context.attachment && (context.attachment.uuid || context.attachment.id)}`;
  },

  _clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  },

  _escapeMarkdown(value) {
    return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
  },

  _escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  },

  _escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }
})
