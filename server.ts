import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import heicConvert from "heic-convert";

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

    // Clean base64 string robustly for any media type (images, PDFs, etc.)
    const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

    let finalMimeType = mimeType;
    let finalBase64Data = base64Data;

    if (
      mimeType === "image/heic" ||
      mimeType === "image/heif" ||
      mimeType.includes("heic") ||
      mimeType.includes("heif")
    ) {
      try {
        console.log("HEIC/HEIF format detected. Converting to JPEG server-side...");
        const inputBuffer = Buffer.from(base64Data, "base64");
        const convertFn = typeof heicConvert === "function"
          ? heicConvert
          : (heicConvert as any).default || heicConvert;
        const outputBuffer = await convertFn({
          buffer: inputBuffer,
          format: "JPEG",
          quality: 0.8,
        });
        finalBase64Data = Buffer.from(outputBuffer).toString("base64");
        finalMimeType = "image/jpeg";
        console.log("HEIC/HEIF converted to JPEG successfully.");
      } catch (convErr: any) {
        console.error("Error during server-side HEIC conversion:", convErr);
      }
    }

    // Structured prompt for bank slip details extraction with extreme accuracy rules
    const prompt = `Analyze this Thai bank transfer slip image and accurately extract the transaction details.

CRITICAL PRIORITIES:
- SENDER NAME (ชื่อผู้โอน) and AMOUNT (จำนวนเงิน) are the MOST CRITICAL fields. You MUST pay 200% attention to these. Double-check all characters, vowels, and digits.

Follow these strict rules to ensure absolute accuracy:
1. SENDER NAME (เน้นเป็นพิเศษ):
   - Locate the SENDER's full name (ชื่อผู้โอน / จาก).
   - Look for labels: "ผู้โอน", "จาก", "บัญชีผู้โอน", "โอนโดย", "Transfer From", "From", "Snd:".
   - Layout Flow: In many modern Thai banking slips (such as K-Plus/K+, SCB Easy, Krungthai NEXT, Bangkok Bank), there might NOT be explicit text labels like "จาก" (From) or "ผู้โอน" (Sender). Instead, they represent the transaction using a vertical or horizontal flow with an arrow (e.g., "↓", "→", "➔").
   - Arrow Rule: The FIRST block/name before the arrow is the SENDER (จาก). The SECOND block/name after the arrow is the RECIPIENT (ถึง). You MUST extract the SENDER (the first name/block). Do NOT extract the recipient!
   - Ensure you read every single character (including Thai vowels, tone marks like ่, ้, ๊, ๋, ็, ์, and sub-vowels like ุ, ู, ิ, ี, ึ, ื) with maximum care. Do not drop letters.
   - Clean any prefixes like "นาย", "นาง", "นางสาว", "น.ส.", "ด.ช.", "ด.ญ.", "MR.", "MRS.", "MS." to obtain the clean display name, but ensure the first and last names (or initials) are fully captured (e.g. "ปกป้อง ส" from "ด.ช. ปกป้อง ส", "สมชาย ดีมาก" from "นาย สมชาย ดีมาก"). If it is a company or store name, extract it clearly.

2. AMOUNT (เน้นเป็นพิเศษ):
   - Locate the main transfer amount (จำนวนเงิน / ยอดโอน). It is usually in a larger font size.
   - Look for labels: "จำนวนเงิน", "จำนวน", "ยอดโอน", "Amount", "THB", "บาท".
   - Extract the absolute numeric value. Ignore currency symbols and commas (e.g., "฿150.00", "150.00 บาท", "1,500.00 THB" should be extracted as 150.00 or 1500.00).
   - Double-check that you do NOT extract the fee ("ค่าธรรมเนียม", "Fee") or the remaining balance. The transfer amount must be the exact successful transferred value.

3. DATE:
   - Identify the transfer date (e.g., "14 ก.ค. 69" or "14 Jul 2026").
   - BE Year Conversion: If the date is in Thai Buddhist Era (B.E. - e.g., "2569", "2568", "2567" or short "69", "68", "67"), convert it to Western Gregorian Era year (Gregorian Year = B.E. Year - 543 or 2000 + (Short B.E. Year - 43)).
     - B.E. 2569 or 69 -> 2026
     - B.E. 2568 or 68 -> 2025
     - B.E. 2567 or 67 -> 2024
     - B.E. 2570 or 70 -> 2027
   - Map Thai abbreviated months to standard month numbers:
     - ม.ค. -> 01, ก.พ. -> 02, มี.ค. -> 03, เม.ย. -> 04, พ.ค. -> 05, มิ.ย. -> 06
     - ก.ค. -> 07, ส.ค. -> 08, ก.ย. -> 09, ต.ค. -> 10, พ.ย. -> 11, ธ.ค. -> 12
   - Format the date precisely as YYYY-MM-DD (e.g. "2026-07-14").

4. TIME:
   - Identify the transaction time (e.g., "08:59 น.").
   - Strip any Thai text like "น." or seconds if present.
   - Format the time precisely as HH:MM (e.g. "08:59").

5. BANK NAME:
   - Identify the originating bank of the transfer from logos or text (e.g. K+ / KBank / Kasikornbank, SCB, Krungthai/KTB, Bangkok Bank/BBL, Krungsri/BAY, Government Savings Bank/GSB, TMBThanachart/TTB, PromptPay, UOB).
   - Use standard names or abbreviations (e.g. "KBank", "SCB", "PromptPay", "KTB", "BBL", "Krungsri", "TTB", "GSB").

6. TRANSACTION STATUS:
   - Check if this is a genuine successful transfer slip.
   - Look for terms like "สำเร็จ", "โอนเงินสำเร็จ", "ทำรายการสำเร็จ", "บันทึกรายการเรียบร้อย", "Transfer Successful".
   - Set isSuccess to true if the transaction is successful.
   - Set isSuccess to false if the slip is a draft, canceled, scheduled transaction, or incomplete.`;

    const imagePart = {
      inlineData: {
        mimeType: finalMimeType,
        data: finalBase64Data,
      },
    };

    const textPart = {
      text: prompt,
    };

    const config = {
      temperature: 0.1, // Set lower temperature for deterministic & accurate factual OCR parsing
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          senderName: {
            type: Type.STRING,
            description: "ชื่อเต็มผู้โอนเงินที่ถูกต้องที่สุด (ภาษาไทย หรือ อังกฤษ) ต้องไม่มีคำนำหน้าชื่อ และต้องพยายามอ่านสระ วรรณยุกต์ให้ครบถ้วน ห้ามสะกดผิด เช่น 'สมชาย ดีมาก' หรือ 'Somchai Deemak'",
          },
          amount: {
            type: Type.NUMBER,
            description: "ตัวเลขยอดเงินที่โอนสำเร็จจริงๆ เท่านั้น (ห้ามรวมค่าธรรมเนียม) เป็นเลขทศนิยม เช่น 250.00",
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
    };

    let response;
    try {
      console.log("Attempting to parse slip using primary model (gemini-2.5-flash)...");
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: [imagePart, textPart] },
        config,
      });
    } catch (primaryError: any) {
      console.warn("Primary model (gemini-2.5-flash) failed, trying fallback (gemini-2.5-pro)... Error:", primaryError?.message || primaryError);
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-pro",
          contents: { parts: [imagePart, textPart] },
          config,
        });
      } catch (fallbackError: any) {
        console.warn("Fallback model (gemini-2.5-pro) failed, trying secondary fallback (gemini-1.5-flash)... Error:", fallbackError?.message || fallbackError);
        response = await ai.models.generateContent({
          model: "gemini-1.5-flash",
          contents: { parts: [imagePart, textPart] },
          config,
        });
      }
    }

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
