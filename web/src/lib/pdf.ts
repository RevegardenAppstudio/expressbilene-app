import jsPDF from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";

export function generatePdfReport(opts: {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: RowInput[];
  foot?: RowInput[];
  filename: string;
}) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(opts.title, 14, 15);
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(opts.subtitle, 14, 21);
  }
  autoTable(doc, {
    startY: opts.subtitle ? 27 : 20,
    head: [opts.columns],
    body: opts.rows,
    foot: opts.foot,
    showFoot: "lastPage",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  doc.save(opts.filename);
}
