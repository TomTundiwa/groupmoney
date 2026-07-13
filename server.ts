import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up large payload limits for base64 image transfers
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Shared Gemini API client initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Server-side API endpoint to parse the uploaded transaction slip using Gemini 3.5 Flash
app.post("/api/parse-slip", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({
        error: "Missing imageBase64 or mimeType in request body.",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured on the server.",
      });
    }

    // Clean base64 string
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // Structured prompt for bank slip details extraction
    const prompt = `Analyze this Thai bank transfer slip image and extract the transfer transaction details.
Format the output as a clean JSON object containing:
- senderName: The name of the person who transferred the money (Thai or English). Clean any prefixes like นาย/นาง/น.ส. if possible, or extract the full display name.
- amount: The numerical transfer amount (float/number).
- date: The transfer date formatted as YYYY-MM-DD.
- time: The transfer time formatted as HH:MM.
- bank: The origin bank name (e.g., KBank, SCB, KTB, BBL, PromptPay, Krungsri).
- isSuccess: A boolean indicating if this is a valid and successful money transfer slip.

Make sure to look closely at the amount (e.g. 150.00, 2,500.00) and the sender's name.
If you cannot read any field, provide an empty string or null.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data,
          },
        },
        prompt,
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            senderName: {
              type: Type.STRING,
              description: "ชื่อผู้โอนเงินภาษาไทย หรืออังกฤษ เช่น สมชาย ดีมาก หรือ Somchai Deemak",
            },
            amount: {
              type: Type.NUMBER,
              description: "จำนวนเงินที่โอนสำเร็จ ตัวเลขทศนิยม เช่น 250.00",
            },
            date: {
              type: Type.STRING,
              description: "วันที่ทำการโอน รูปแบบ YYYY-MM-DD",
            },
            time: {
              type: Type.STRING,
              description: "เวลาที่ทำการโอน รูปแบบ HH:MM",
            },
            bank: {
              type: Type.STRING,
              description: "ชื่อย่อหรือชื่อเต็มของธนาคาร เช่น KBank, SCB, PromptPay, KTB",
            },
            isSuccess: {
              type: Type.BOOLEAN,
              description: "เป็นหลักฐานการโอนเงินที่ถูกต้องและสำเร็จจริงหรือไม่",
            },
          },
          required: ["senderName", "amount", "date", "time", "bank", "isSuccess"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response text from Gemini model.");
    }

    const parsedData = JSON.parse(resultText.trim());
    return res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error parsing slip with Gemini:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to process slip image.",
    });
  }
});

// Dynamic XML Sitemap Endpoint
app.get("/sitemap.xml", (req, res) => {
  res.header("Content-Type", "application/xml");
  const appUrl = process.env.APP_URL || "https://slipbuddy.demo";
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${appUrl}/</loc>
    <lastmod>2026-07-11</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  res.send(sitemap);
});

// Vite middleware and asset serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
