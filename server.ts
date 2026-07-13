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

    // Structured prompt for bank slip details extraction with extreme accuracy rules
    const prompt = `Analyze this Thai bank transfer slip image and accurately extract the transaction details.

Follow these strict rules to ensure absolute accuracy:
1. SENDER NAME:
   - Identify the sender's section (marked by "จาก", "ผู้โอน", "บัญชีผู้โอน", "โอนโดย", "Transfer From", "From").
   - Extract the full name of the sender (Thai or English).
   - Crucial: DO NOT confuse the sender with the receiver (marked by "ถึง", "ผู้รับโอน", "ผู้รับเงิน", "To", "Transfer To"). You MUST extract the SENDER, not the receiver.
   - Clean any prefixes like "นาย", "นาง", "นางสาว", "น.ส.", "ด.ช.", "ด.ญ.", "MR.", "MRS.", "MS." to obtain the clean display name, but ensure the first and last names are fully captured (e.g. "สมชาย ดีมาก" or "Somchai Deemak").

2. AMOUNT:
   - Identify the primary transfer amount (marked by "จำนวนเงิน", "จำนวน", "Amount", "THB").
   - Extract the numeric value. Ignore commas (e.g. "1,500.00" or "150" should be extracted as 1500.00 or 150.0).
   - Verify it is the actual transfer amount, not fee amount ("ค่าธรรมเนียม", "Fee") or remaining balance.

3. DATE:
   - Identify the transfer date.
   - If the date is in Thai Buddhist Era (B.E. - e.g. "2569", "2568", "2567" or short "69", "68", "67"), convert it to Western Gregorian Era year (Gregorian Year = B.E. Year - 543). E.g., Year 2569/69 becomes 2026, 2568/68 becomes 2025, 2567/67 becomes 2024.
   - Map Thai abbreviated months to standard month numbers:
     - ม.ค. -> 01, ก.พ. -> 02, มี.ค. -> 03, เม.ย. -> 04, พ.ค. -> 05, มิ.ย. -> 06
     - ก.ค. -> 07, ส.ค. -> 08, ก.ย. -> 09, ต.ค. -> 10, พ.ย. -> 11, ธ.ค. -> 12
   - Format the date precisely as YYYY-MM-DD (e.g. "2026-07-12").

4. TIME:
   - Identify the transaction time.
   - Strip any Thai text like "น." or seconds if present.
   - Format the time precisely as HH:MM (e.g. "10:30").

5. BANK NAME:
   - Identify the originating bank of the transfer from logos or text (e.g. Kasikornbank/KBank, SCB, Krungthai/KTB, Bangkok Bank/BBL, Krungsri/BAY, Government Savings Bank/GSB, TMBThanachart/TTB, PromptPay, UOB).
   - Use standard names or abbreviations (e.g. "KBank", "SCB", "PromptPay", "KTB", "BBL", "Krungsri", "TTB", "GSB").

6. TRANSACTION STATUS:
   - Check if this is a genuine successful transfer slip.
   - Look for terms like "สำเร็จ", "โอนเงินสำเร็จ", "ทำรายการสำเร็จ", "บันทึกรายการเรียบร้อย", "Transfer Successful".
   - Set isSuccess to true if the transaction is successful.
   - Set isSuccess to false if the slip is a draft, canceled, scheduled transaction, or incomplete.`;

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    };

    const textPart = {
      text: prompt,
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        temperature: 0.1, // Set lower temperature for deterministic & accurate factual OCR parsing
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            senderName: {
              type: Type.STRING,
              description: "ชื่อผู้โอนเงินภาษาไทย หรืออังกฤษ ปราศจากคำนำหน้าชื่อ เช่น สมชาย ดีมาก หรือ Somchai Deemak",
            },
            amount: {
              type: Type.NUMBER,
              description: "จำนวนเงินที่โอนสำเร็จหลักที่เป็นตัวเลขทศนิยม เช่น 250.00",
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
              description: "ชื่อย่อหรือชื่อเต็มของธนาคาร เช่น KBank, SCB, PromptPay, KTB, BBL",
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
