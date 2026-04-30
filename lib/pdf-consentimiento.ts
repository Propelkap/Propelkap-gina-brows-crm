/**
 * Genera el PDF del consentimiento firmado usando pdf-lib (Node.js, sin browser).
 * Recibe la estructura del template + las respuestas del cliente + la firma como dataURL.
 * Devuelve un Uint8Array listo para subir a Storage.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Estructura = {
  titulo: string;
  datos_personales: Array<{ id: string; label: string; tipo: string; requerido?: boolean }>;
  declaraciones: string[];
  salud: Array<{ id: string; pregunta: string }>;
  autoriza_fotos: { pregunta: string; requerido?: boolean };
  enlace: string[];
  cuidados_posteriores: string;
  autorizacion_artista: string;
};

type Respuestas = Record<string, string | boolean>;

/**
 * Sanitiza texto a WinAnsi (CP1252) para que pdf-lib + StandardFonts.Helvetica
 * no exploten con caracteres Unicode (em-dash, comillas curvas iOS, flechas, emoji, etc.).
 * Mapea los más comunes a equivalentes ASCII y elimina lo no codificable.
 */
function safeText(input: unknown): string {
  if (input == null) return "";
  let s = String(input);
  // Reemplazos comunes
  s = s
    .replace(/[‘’‚‛]/g, "'")  // smart single quotes
    .replace(/[“”„‟]/g, '"')  // smart double quotes
    .replace(/[–—―]/g, "-")          // en/em dash
    .replace(/…/g, "...")                       // ellipsis
    .replace(/•/g, "*")                         // bullet
    .replace(/[→➡]/g, ">")                // arrow right
    .replace(/[←]/g, "<")                       // arrow left
    .replace(/[✓✔]/g, "v")                // check
    .replace(/[✗✘]/g, "x")                // cross
    .replace(/ /g, " ");                        // nbsp -> space
  // Filtra cualquier char fuera de WinAnsi (CP1252). Mantiene latin-1 + chars WinAnsi 0x80-0x9F.
  // Set seguro: ASCII imprimible + latin-1 supplement + chars WinAnsi específicos.
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ€ŒœŠšŸŽžƒˆ˜‰‹›]/g, "");
  return s;
}

export async function generarPdfConsentimiento(opts: {
  estructura: Estructura;
  respuestas: Respuestas;
  firmaDataUrl: string;
  iniciales: Record<string, string>;
  fechaFirma: Date;
  ip?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4_W = 595;
  const A4_H = 842;
  const margin = 40;
  const lineH = 12;
  const titleSize = 14;
  const bodySize = 9;
  const labelSize = 8;
  const cBlack = rgb(0, 0, 0);
  const cMuted = rgb(0.4, 0.4, 0.4);
  const cAccent = rgb(0.69, 0.41, 0.81); // lavanda Gina

  let page = pdf.addPage([A4_W, A4_H]);
  let y = A4_H - margin;

  function newPage() {
    page = pdf.addPage([A4_W, A4_H]);
    y = A4_H - margin;
  }

  function ensureSpace(needed: number) {
    if (y - needed < margin) newPage();
  }

  function wrapText(text: string, width: number, font = helv, size = bodySize): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      const widthW = font.widthOfTextAtSize(test, size);
      if (widthW > width && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawText(text: string, opts: { x?: number; size?: number; font?: typeof helv; color?: typeof cBlack; maxWidth?: number; bold?: boolean } = {}) {
    const x = opts.x ?? margin;
    const size = opts.size ?? bodySize;
    const font = opts.bold ? helvBold : (opts.font ?? helv);
    const color = opts.color ?? cBlack;
    const maxWidth = opts.maxWidth ?? A4_W - 2 * margin;
    const lines = wrapText(safeText(text), maxWidth, font, size);
    for (const line of lines) {
      ensureSpace(lineH);
      page.drawText(line, { x, y, size, font, color });
      y -= lineH;
    }
  }

  function divider() {
    ensureSpace(8);
    page.drawLine({
      start: { x: margin, y: y - 2 },
      end: { x: A4_W - margin, y: y - 2 },
      thickness: 0.5,
      color: cMuted,
    });
    y -= 8;
  }

  // ====== HEADER ======
  drawText("GINA BROWS", { size: 16, bold: true, color: cAccent });
  drawText("Microblading Artist · Monterrey, Nuevo León", { size: labelSize, color: cMuted });
  y -= 6;
  drawText(opts.estructura.titulo, { size: titleSize, bold: true });
  y -= 8;
  divider();

  // ====== DATOS PERSONALES ======
  drawText("DATOS DEL CLIENTE", { bold: true, size: 10 });
  y -= 4;
  for (const f of opts.estructura.datos_personales) {
    const valor = String(opts.respuestas[f.id] ?? "-");
    drawText(`${f.label}: ${valor}`);
  }
  y -= 6;
  divider();

  // ====== DECLARACIONES ======
  drawText("DECLARACIONES", { bold: true, size: 10 });
  y -= 4;
  for (let i = 0; i < opts.estructura.declaraciones.length; i++) {
    const decl = opts.estructura.declaraciones[i];
    const ini = opts.iniciales[`decl_${i}`] ?? "-";
    drawText(`[${ini}] ${decl}`, { size: bodySize });
    y -= 2;
  }
  y -= 6;
  divider();

  // ====== SALUD ======
  drawText("FORMULARIO DE SALUD MÉDICA", { bold: true, size: 10 });
  y -= 4;
  for (const q of opts.estructura.salud) {
    const r = opts.respuestas[`salud_${q.id}`];
    const respuestaTxt = r === true || r === "si" ? "SÍ" : "NO";
    const color = respuestaTxt === "SÍ" ? rgb(0.85, 0.3, 0.3) : cMuted;
    ensureSpace(lineH);
    page.drawText(safeText(q.pregunta), { x: margin, y, size: bodySize, font: helv, color: cBlack });
    page.drawText(safeText(respuestaTxt), { x: A4_W - margin - 30, y, size: bodySize, font: helvBold, color });
    y -= lineH;
  }

  if (opts.respuestas.salud_explicacion) {
    y -= 4;
    drawText("Explicación adicional:", { size: labelSize, bold: true, color: cMuted });
    drawText(String(opts.respuestas.salud_explicacion));
  }

  y -= 6;
  divider();

  // ====== AUTORIZACIÓN FOTOS ======
  drawText("USO DE IMÁGENES", { bold: true, size: 10 });
  y -= 4;
  drawText(opts.estructura.autoriza_fotos.pregunta);
  const autorizaFotos = opts.respuestas.autoriza_fotos === true || opts.respuestas.autoriza_fotos === "si";
  drawText(`> ${autorizaFotos ? "SÍ AUTORIZA" : "NO AUTORIZA"}`, { bold: true, color: autorizaFotos ? rgb(0.2, 0.6, 0.3) : rgb(0.85, 0.3, 0.3) });
  y -= 6;
  divider();

  // ====== ENLACE ======
  drawText("FORMULARIO DE ENLACE", { bold: true, size: 10 });
  y -= 4;
  for (let i = 0; i < opts.estructura.enlace.length; i++) {
    const decl = opts.estructura.enlace[i];
    const r = opts.respuestas[`enlace_${i}`];
    const respuestaTxt = r === true || r === "si" ? "SÍ" : "NO";
    drawText(`[${respuestaTxt}] ${decl}`);
  }
  y -= 6;
  divider();

  // ====== AUTORIZACIÓN ARTISTA ======
  drawText("AUTORIZACIÓN", { bold: true, size: 10 });
  y -= 2;
  drawText(opts.estructura.autorizacion_artista, { size: bodySize });
  y -= 6;
  divider();

  // ====== CUIDADOS POSTERIORES (solo info, no requiere acción) ======
  drawText("CUIDADOS POSTERIORES", { bold: true, size: 10 });
  y -= 2;
  drawText(opts.estructura.cuidados_posteriores, { size: labelSize, color: cMuted });
  y -= 8;

  // ====== FIRMA ======
  ensureSpace(120);
  divider();
  drawText("FIRMA DEL CLIENTE", { bold: true, size: 10 });
  y -= 4;

  // Insertar imagen de firma
  if (opts.firmaDataUrl?.startsWith("data:image/png;base64,")) {
    try {
      const base64 = opts.firmaDataUrl.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pngImg = await pdf.embedPng(bytes);
      const dims = pngImg.scale(0.5);
      const finalH = Math.min(dims.height, 80);
      const finalW = (finalH / dims.height) * dims.width;
      ensureSpace(finalH + 30);
      page.drawImage(pngImg, { x: margin, y: y - finalH, width: finalW, height: finalH });
      y -= finalH + 4;
    } catch {
      drawText("[Firma no procesable]", { color: cMuted });
    }
  }

  // Línea de firma + metadatos
  page.drawLine({
    start: { x: margin, y: y - 2 },
    end: { x: margin + 200, y: y - 2 },
    thickness: 0.5,
    color: cBlack,
  });
  y -= 8;
  const fmtFecha = opts.fechaFirma.toLocaleString("es-MX", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Monterrey",
  });
  drawText(`Firmado el: ${fmtFecha}`, { size: labelSize, color: cMuted });
  if (opts.ip) drawText(`IP: ${opts.ip}`, { size: labelSize, color: cMuted });
  drawText("Documento generado digitalmente por el CRM de Gina Brows.", { size: labelSize, color: cMuted });

  return await pdf.save();
}
