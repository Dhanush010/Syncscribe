import express from "express";
import Document from "../models/Document.js";
import { authenticateToken } from "../middleware/auth.js";
import puppeteer from "puppeteer";
import { Document as DocxDocument, Packer, Paragraph, TextRun } from "docx";
import TurndownService from "turndown";

const router = express.Router();

const checkPermission = async (doc, userId) => {
  if (!doc) return false;
  if (doc.owner.toString() === userId.toString()) return true;
  return doc.permissions.some(p => p.user.toString() === userId.toString());
};

// Helper to convert Quill delta to HTML
const deltaToHTML = (delta) => {
  if (!delta || !delta.ops) return "";
  
  let html = "";
  for (const op of delta.ops) {
    if (op.insert) {
      let text = String(op.insert).replace(/\n/g, "<br>");
      let style = "";
      
      if (op.attributes) {
        if (op.attributes.bold) style += "font-weight:bold;";
        if (op.attributes.italic) style += "font-style:italic;";
        if (op.attributes.underline) style += "text-decoration:underline;";
        if (op.attributes.header) {
          style += `font-size:${24 - op.attributes.header * 2}px;font-weight:bold;`;
        }
      }
      
      if (style) {
        html += `<span style="${style}">${text}</span>`;
      } else {
        html += text;
      }
    }
  }
  
  return html;
};

// Helper to convert Quill delta to plain text
const deltaToText = (delta) => {
  if (!delta || !delta.ops) return "";
  
  let text = "";
  for (const op of delta.ops) {
    if (op.insert && typeof op.insert === "string") {
      text += op.insert;
    }
  }
  
  return text;
};

// Helper to convert Quill delta to Markdown
const deltaToMarkdown = (delta) => {
  if (!delta || !delta.ops) return "";
  
  const html = deltaToHTML(delta);
  const turndownService = new TurndownService();
  return turndownService.turndown(html);
};

// Export as PDF
router.get("/pdf/:docId", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    const hasPermission = await checkPermission(doc, req.user.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: "Access denied" });
    }

    let content;
    try {
      const delta = typeof doc.content === "string" ? JSON.parse(doc.content) : doc.content;
      content = deltaToHTML(delta);
    } catch {
      content = `<p>${doc.content || ""}</p>`;
    }

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${doc.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; }
            h1 { margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>${doc.title}</h1>
          ${content}
        </body>
      </html>
    `;

    await page.setContent(html);
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.title || 'document'}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error("PDF export error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// Export as DOCX
router.get("/docx/:docId", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    const hasPermission = await checkPermission(doc, req.user.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: "Access denied" });
    }

    let text;
    try {
      const delta = typeof doc.content === "string" ? JSON.parse(doc.content) : doc.content;
      text = deltaToText(delta);
    } catch {
      text = doc.content || "";
    }

    const docxDoc = new DocxDocument({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: doc.title, bold: true, size: 32 })],
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [new TextRun({ text })]
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(docxDoc);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.title || 'document'}.docx"`);
    res.send(buffer);
  } catch (err) {
    console.error("DOCX export error:", err);
    res.status(500).json({ error: "Failed to generate DOCX" });
  }
});

// Export as TXT
router.get("/txt/:docId", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    const hasPermission = await checkPermission(doc, req.user.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: "Access denied" });
    }

    let text;
    try {
      const delta = typeof doc.content === "string" ? JSON.parse(doc.content) : doc.content;
      text = deltaToText(delta);
    } catch {
      text = doc.content || "";
    }

    const output = `${doc.title}\n${"=".repeat(doc.title.length)}\n\n${text}`;

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.title || 'document'}.txt"`);
    res.send(output);
  } catch (err) {
    res.status(500).json({ error: "Failed to export TXT" });
  }
});

// Export as Markdown
router.get("/md/:docId", authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    
    const hasPermission = await checkPermission(doc, req.user.userId);
    if (!hasPermission) {
      return res.status(403).json({ error: "Access denied" });
    }

    let markdown;
    try {
      const delta = typeof doc.content === "string" ? JSON.parse(doc.content) : doc.content;
      markdown = `# ${doc.title}\n\n${deltaToMarkdown(delta)}`;
    } catch {
      markdown = `# ${doc.title}\n\n${doc.content || ""}`;
    }

    res.setHeader("Content-Type", "text/markdown");
    res.setHeader("Content-Disposition", `attachment; filename="${doc.title || 'document'}.md"`);
    res.send(markdown);
  } catch (err) {
    res.status(500).json({ error: "Failed to export Markdown" });
  }
});

export default router;


