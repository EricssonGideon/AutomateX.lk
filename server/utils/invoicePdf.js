const {
  normalizeInvoiceCurrency,
  roundMoney
} = require("./invoice");

function escapePdfText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toISOString().slice(0, 10);
}

function formatMoney(value, currency = "LKR") {
  const normalizedCurrency = normalizeInvoiceCurrency(currency);

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency
    }).format(roundMoney(value));
  } catch {
    return `${normalizedCurrency} ${roundMoney(value).toFixed(2)}`;
  }
}

function wrapText(value, maxLength = 82) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length > maxLength && line) {
      lines.push(line);
      line = word;
      return;
    }
    line = nextLine;
  });

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

function addText(commands, text, x, y, options = {}) {
  const size = options.size || 10;
  const font = options.font || "F1";
  commands.push(`BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`);
}

function addLine(commands, x1, y1, x2, y2) {
  commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
}

function buildPdf(objects) {
  const body = [];
  const offsets = [0];
  let cursor = "%PDF-1.4\n".length;

  objects.forEach((object, index) => {
    const serialized = `${index + 1} 0 obj\n${object}\nendobj\n`;
    offsets.push(cursor);
    body.push(serialized);
    cursor += serialized.length;
  });

  const xrefOffset = cursor;
  const xrefRows = offsets.map((offset, index) => {
    if (index === 0) {
      return "0000000000 65535 f ";
    }
    return `${String(offset).padStart(10, "0")} 00000 n `;
  }).join("\n");
  const xref = `xref\n0 ${offsets.length}\n${xrefRows}\n`;
  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(`%PDF-1.4\n${body.join("")}${xref}${trailer}`, "binary");
}

function generateInvoicePdfBuffer({ invoice, settings = {} }) {
  const commands = [];
  const currency = invoice.currency || settings.defaultCurrency || "LKR";
  const projectReference = invoice.projectTitle || invoice.maintenancePlanName || invoice.leadBusinessName || "";
  let y = 785;

  commands.push("0.08 0.12 0.2 RG");
  commands.push("0.08 0.12 0.2 rg");
  commands.push("40 742 515 86 re f");
  addText(commands, "AutomateX", 58, 795, { size: 22, font: "F2" });
  addText(commands, "Professional Invoice", 58, 773, { size: 11 });
  addText(commands, invoice.invoiceNumber || "Invoice", 390, 795, { size: 18, font: "F2" });
  addText(commands, `Status: ${invoice.paymentStatus || invoice.status || "Unpaid"}`, 390, 773, { size: 11 });

  commands.push("0 0 0 RG");
  commands.push("0 0 0 rg");
  y = 720;
  addText(commands, "Bill To", 48, y, { size: 13, font: "F2" });
  addText(commands, invoice.businessName || invoice.clientName || "Client", 48, y - 18, { size: 11 });
  addText(commands, invoice.clientName || "", 48, y - 34, { size: 10 });
  addText(commands, invoice.clientEmail || "", 48, y - 50, { size: 10 });

  addText(commands, "Invoice Details", 335, y, { size: 13, font: "F2" });
  addText(commands, `Issue date: ${formatDate(invoice.issueDate)}`, 335, y - 18);
  addText(commands, `Due date: ${formatDate(invoice.dueDate)}`, 335, y - 34);
  addText(commands, `Type: ${invoice.invoiceType || "Custom"}`, 335, y - 50);
  if (projectReference) {
    addText(commands, `Reference: ${projectReference}`, 335, y - 66);
  }

  y = 632;
  addLine(commands, 40, y + 18, 555, y + 18);
  addText(commands, "Description", 48, y, { font: "F2" });
  addText(commands, "Qty", 340, y, { font: "F2" });
  addText(commands, "Unit", 390, y, { font: "F2" });
  addText(commands, "Amount", 480, y, { font: "F2" });
  addLine(commands, 40, y - 8, 555, y - 8);
  y -= 28;

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  items.slice(0, 12).forEach((item) => {
    const description = item.description || item.name || "Invoice item";
    const lines = wrapText(description, 48);
    addText(commands, lines[0], 48, y);
    lines.slice(1, 3).forEach((line, index) => addText(commands, line, 48, y - ((index + 1) * 13), { size: 9 }));
    addText(commands, String(item.quantity || 0), 340, y);
    addText(commands, formatMoney(item.unitPrice || 0, currency), 390, y);
    addText(commands, formatMoney(item.amount || item.total || 0, currency), 480, y);
    y -= Math.max(24, lines.slice(0, 3).length * 14);
  });

  y = Math.min(y, 260);
  y = Math.max(y, 180);
  addLine(commands, 320, y + 20, 555, y + 20);
  [
    ["Subtotal", invoice.subtotal],
    ["Discount", invoice.discount],
    ["Tax", invoice.tax],
    ["Total", invoice.totalAmount],
    ["Paid", invoice.paidAmount],
    ["Balance", invoice.balanceAmount ?? invoice.balance]
  ].forEach(([label, value], index) => {
    const rowY = y - (index * 18);
    addText(commands, label, 350, rowY, { font: index >= 3 ? "F2" : "F1" });
    addText(commands, formatMoney(value || 0, currency), 470, rowY, { font: index >= 3 ? "F2" : "F1" });
  });

  const paymentInstructions = settings.paymentInstructions || "Please use your agreed AutomateX payment method and share the payment reference after transfer.";
  addText(commands, "Payment Instructions", 48, 150, { size: 12, font: "F2" });
  wrapText(paymentInstructions, 88).slice(0, 4).forEach((line, index) => {
    addText(commands, line, 48, 132 - (index * 14), { size: 9 });
  });
  addText(commands, "Thank you for choosing AutomateX.", 48, 58, { size: 11, font: "F2" });

  const content = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`
  ];

  return buildPdf(objects);
}

module.exports = {
  generateInvoicePdfBuffer,
  formatMoney,
  formatDate
};
