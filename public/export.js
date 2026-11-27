// Export eines Plans als Bild (JPEG) oder PDF – ohne externe Bibliotheken.
// Die Tabelle wird auf ein Canvas gezeichnet; das PDF bettet dieses Bild auf einer A4-Seite ein.

const PlanExport = (() => {
  const SCALE = 3; // Auflösung (3 = scharf auch beim Drucken)
  const FONT = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';
  const STRIPE = "#ffff00";

  // title: Überschrift, header: ["Startdatum", ...], rows: [["01.01.2026", "bis", ...], ...]
  // align: pro Spalte "left" | "right" | "center"
  function drawTable({ title, header, rows, align }) {
    const fontSize = 15;
    const rowH = 22;
    const padX = 14;
    const margin = 32;
    const titleH = 44;

    const measure = document.createElement("canvas").getContext("2d");
    const colW = header.map((h, c) => {
      measure.font = `600 ${fontSize}px ${FONT}`;
      let w = measure.measureText(h).width;
      measure.font = `${fontSize}px ${FONT}`;
      for (const r of rows) w = Math.max(w, measure.measureText(r[c] || "").width);
      return Math.ceil(w) + padX * 2;
    });
    const tableW = colW.reduce((a, b) => a + b, 0);
    const width = Math.max(tableW, 360) + margin * 2;
    const height = margin + titleH + rowH * (rows.length + 1) + margin;

    const canvas = document.createElement("canvas");
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#000000";
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(title, margin, margin + 14);

    const drawRow = (cells, y, bold) => {
      ctx.font = `${bold ? "600 " : ""}${fontSize}px ${FONT}`;
      ctx.fillStyle = "#000000";
      let x = margin;
      cells.forEach((text, c) => {
        const a = bold ? "center" : align[c];
        ctx.textAlign = a;
        const tx = a === "right" ? x + colW[c] - padX : a === "center" ? x + colW[c] / 2 : x + padX;
        ctx.fillText(text || "", tx, y + rowH / 2 + 1);
        x += colW[c];
      });
    };

    let y = margin + titleH;
    drawRow(header, y, true);
    rows.forEach((r, i) => {
      y += rowH;
      if (i % 2 === 0) {
        ctx.fillStyle = STRIPE;
        ctx.fillRect(margin, y, tableW, rowH);
      }
      drawRow(r, y, false);
    });
    return canvas;
  }

  const toJpegBlob = (canvas, quality = 0.95) =>
    new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

  // ---------- Miniplan im Stil der Vorlage (A4-Seiten) ----------
  // data: { logo: HTMLImageElement|null, termine: [{ date, time, title, altar[], sammeln[], weihrauch[] }],
  //         termineText, orgaText, oberminis: [names], planBy }
  function drawMiniPlan(data) {
    const W = 794, H = 1123;            // A4 bei 96 dpi
    const LEFT = 80, BOTTOM = H - 60;
    const COLS = [255, 440, 610];       // Altardienst, Sammeln, Weihrauch
    const LINE = 20;
    const pages = [];
    let ctx, y;

    const newPage = () => {
      const c = document.createElement("canvas");
      c.width = W * SCALE;
      c.height = H * SCALE;
      ctx = c.getContext("2d");
      ctx.scale(SCALE, SCALE);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "alphabetic";
      pages.push(c);
      y = 80;
    };
    const font = (size, weight = 400) => (ctx.font = `${weight} ${size}px ${FONT}`);
    const write = (str, x, yy, color = "#000") => {
      ctx.fillStyle = color;
      ctx.fillText(str, x, yy);
    };
    const fit = (str, maxW) => {
      // zu lange Namen kürzen, damit sie nicht in die nächste Spalte laufen
      if (ctx.measureText(str).width <= maxW) return str;
      while (str.length > 1 && ctx.measureText(str + "…").width > maxW) str = str.slice(0, -1);
      return str + "…";
    };
    const wrap = (str, maxW) => {
      const lines = [];
      for (const para of String(str || "").split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/)) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > maxW && line) {
            lines.push(line);
            line = word;
          } else line = test;
        }
        lines.push(line);
      }
      return lines;
    };
    const columnHeader = () => {
      font(15);
      ["Altardienst", "Sammeln", "Weihrauch"].forEach((h, i) => write(h, COLS[i], y));
      y += 42;
    };

    // Kopf: Logo links, "MINIPLAN" daneben
    newPage();
    let headerBottom = y + 40;
    if (data.logo) {
      const maxW = 280, maxH = 175;
      const r = Math.min(maxW / data.logo.naturalWidth, maxH / data.logo.naturalHeight);
      const lw = data.logo.naturalWidth * r, lh = data.logo.naturalHeight * r;
      ctx.drawImage(data.logo, LEFT, y, lw, lh);
      font(15);
      write("MINIPLAN", 440, y + lh / 2 + 5);
      headerBottom = y + lh + 28;
    } else {
      font(26, 700);
      write("MINIPLAN", LEFT, y + 26);
      headerBottom = y + 70;
    }
    y = headerBottom;
    columnHeader();

    // Termine
    for (const t of data.termine) {
      const head = [`${weekday(t.date)} ${shortDate(t.date)}`];
      if (t.time) head.push(`${t.time.replace(/^0/, "")} Uhr`);
      const lines = Math.max(head.length + (t.title ? 1 : 0), t.altar.length, t.sammeln.length, t.weihrauch.length, 1);
      const blockH = lines * LINE + 24;
      if (y + blockH > BOTTOM) {
        newPage();
        columnHeader();
      }
      let ly = y;
      if (t.title) {
        font(15, 700);
        write(fit(t.title, COLS[0] - LEFT - 10), LEFT, ly);
        ly += LINE;
      }
      font(15);
      head.forEach((h) => {
        write(h, LEFT, ly);
        ly += LINE;
      });
      [t.altar, t.sammeln, t.weihrauch].forEach((names, c) => {
        const maxW = (COLS[c + 1] || W - 40) - COLS[c] - 10;
        names.forEach((n, k) => write(fit(n || "—", maxW), COLS[c], y + k * LINE, n ? "#000" : "#999"));
      });
      y += blockH;
    }

    // Fußbereich: Termine, Orga, Oberminis
    font(15);
    const textW = W - LEFT - 80;
    const termineLines = wrap(data.termineText, textW).filter((l, i, a) => l || i < a.length - 1);
    const orgaLines = wrap(data.orgaText, textW);
    const obers = data.oberminis.map((n) => (n === data.planBy ? `${n} (Plan)` : n));
    const oberRows = Math.ceil(obers.length / 3);
    const footerH =
      40 + LINE * (1 + Math.max(termineLines.length, 2)) + 30 +
      LINE * (1 + orgaLines.length) + 40 +
      (obers.length ? LINE * (1 + oberRows) : 0);
    y = Math.max(y + 40, BOTTOM - footerH); // Fußbereich möglichst unten, wie in der Vorlage
    if (y + footerH > BOTTOM + 20) {
      newPage();
    }

    font(15, 700);
    write("Termine:", LEFT, y, "#ff0000");
    y += LINE;
    font(15);
    termineLines.forEach((l) => {
      write(l, LEFT, y);
      y += LINE;
    });
    y += LINE * Math.max(0, 2 - termineLines.length) + 30;

    font(15, 700);
    write("Orga:", LEFT, y);
    y += LINE;
    font(15);
    orgaLines.forEach((l) => {
      write(l, LEFT, y);
      y += LINE;
    });
    y += 40;

    if (obers.length) {
      font(15);
      write("Eure Oberminis:", LEFT, y);
      const uw = ctx.measureText("Eure Oberminis:").width;
      ctx.fillRect(LEFT, y + 3, uw, 1);
      y += LINE;
      obers.forEach((n, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        write(fit(n, 240), [LEFT, 355, 610][col], y + row * LINE);
      });
    }
    return pages;
  }

  const WEEKDAYS = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
  const weekday = (iso) => WEEKDAYS[new Date(iso + "T00:00:00Z").getUTCDay()];
  const shortDate = (iso) => {
    const [yy, mm, dd] = iso.split("-");
    return `${dd}.${mm}.${yy.slice(2)}`;
  };

  // Mehrere Seiten untereinander zu einem Bild zusammensetzen (für JPEG).
  function stackPages(pages) {
    if (pages.length === 1) return pages[0];
    const gap = 16 * SCALE;
    const c = document.createElement("canvas");
    c.width = pages[0].width;
    c.height = pages.reduce((h, p) => h + p.height, 0) + gap * (pages.length - 1);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#d0d0d0";
    ctx.fillRect(0, 0, c.width, c.height);
    let y = 0;
    for (const p of pages) {
      ctx.drawImage(p, 0, y);
      y += p.height + gap;
    }
    return c;
  }

  // Minimal-PDF: eine A4-Seite (hoch) pro Canvas, JPEG oben ausgerichtet und auf die Seite eingepasst.
  async function toPdfBlob(canvasOrPages) {
    const canvases = Array.isArray(canvasOrPages) ? canvasOrPages : [canvasOrPages];
    const pageW = 595.28, pageH = 841.89;
    const images = [];
    for (const canvas of canvases) {
      const jpeg = new Uint8Array(await (await toJpegBlob(canvas)).arrayBuffer());
      // Ganze Seiten (A4-Format) randlos, einzelne Tabellen mit Rand
      const isPage = Math.abs(canvas.width / canvas.height - pageW / pageH) < 0.01;
      const m = isPage ? 0 : 28;
      const ratio = Math.min((pageW - 2 * m) / canvas.width, (pageH - 2 * m) / canvas.height);
      const w = canvas.width * ratio, h = canvas.height * ratio;
      images.push({ jpeg, canvas, w, h, x: (pageW - w) / 2, y: pageH - m - h });
    }

    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let length = 0;
    const push = (data) => {
      const bytes = typeof data === "string" ? enc.encode(data) : data;
      parts.push(bytes);
      length += bytes.length;
    };
    const obj = (n, body) => {
      offsets[n] = length;
      push(`${n} 0 obj\n${body}\nendobj\n`);
    };

    // Objekte: 1 Catalog, 2 Pages, danach je Seite: Page, Content, Image
    const pageObj = (i) => 3 + i * 3;
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    const kids = images.map((_, i) => `${pageObj(i)} 0 R`).join(" ");
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>`);
    images.forEach((img, i) => {
      const p = pageObj(i);
      obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
      const content = `q ${img.w.toFixed(2)} 0 0 ${img.h.toFixed(2)} ${img.x.toFixed(2)} ${img.y.toFixed(2)} cm /Im0 Do Q`;
      obj(p + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      offsets[p + 2] = length;
      push(`${p + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.canvas.width} /Height ${img.canvas.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`);
      push(img.jpeg);
      push("\nendstream\nendobj\n");
    });

    const size = 3 + images.length * 3;
    const xref = length;
    let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let n = 1; n < size; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
    push(`${table}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: "application/pdf" });
  }

  function download(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return { drawTable, drawMiniPlan, stackPages, toJpegBlob, toPdfBlob, download, weekday, shortDate };
})();
