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

    // Helper function to map Thai bank codes to readable names
    const mapBankCode = (code: string): string => {
      if (!code) return "ธนาคาร";
      const normalized = code.trim().replace(/^0+/, ""); // strip leading zeros
      const bankMap: { [key: string]: string } = {
        "2": "BBL",
        "4": "KBank",
        "6": "KTB",
        "11": "TTB",
        "14": "SCB",
        "25": "Krungsri",
        "30": "GSB",
        "24": "UOB",
        "34": "BAAC",
        "kbank": "KBank",
        "scb": "SCB",
        "ktb": "KTB",
        "bbl": "BBL",
        "krungsri": "Krungsri",
        "ttb": "TTB",
        "gsb": "GSB",
      };
      return bankMap[normalized] || bankMap[normalized.toLowerCase()] || code;
    };

    // Helper to parse SlipOK/Slip2Go date format
    const parseTransDate = (dateStr: string): string => {
      if (!dateStr) return new Date().toISOString().split("T")[0];
      const cleaned = dateStr.replace(/[^0-9]/g, ""); // e.g. "20240715"
      if (cleaned.length === 8) {
        return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
      }
      if (dateStr.includes("-")) {
        return dateStr; // e.g. "2024-07-15"
      }
      return new Date().toISOString().split("T")[0];
    };

    // Helper to parse SlipOK/Slip2Go time format
    const parseTransTime = (timeStr: string): string => {
      if (!timeStr) return new Date().toTimeString().slice(0, 5);
      const cleaned = timeStr.replace(/[^0-9]/g, ""); // e.g. "142531"
      if (cleaned.length >= 4) {
        return `${cleaned.substring(0, 2)}:${cleaned.substring(2, 4)}`;
      }
      if (timeStr.includes(":")) {
        return timeStr.slice(0, 5); // e.g. "14:25"
      }
      return new Date().toTimeString().slice(0, 5);
    };

    const hasSlipOk = !!(process.env.SLIPOK_API_KEY || "SLIPOK9AS7RET");

    if (hasSlipOk) {
      try {
        console.log("[SLIP PARSER] Making SlipOK API call...");
        const buffer = Buffer.from(finalBase64Data, "base64");
        const blob = new Blob([buffer], { type: finalMimeType });
        const formData = new FormData();
        formData.append("flies", blob, "slip.jpg");

        const slipOkResponse = await fetch("https://api.slipok.com/api/line/apikey/71624", {
          method: "POST",
          headers: {
            "x-authorization": process.env.SLIPOK_API_KEY || "SLIPOK9AS7RET",
          },
          body: formData,
        });

        if (slipOkResponse.ok) {
          const resJson: any = await slipOkResponse.json();
          console.log("[SLIP PARSER] SlipOK parsed successfully:", JSON.stringify(resJson));
          if (resJson && resJson.success && resJson.data) {
            const data = resJson.data;
            const rawSenderName = data.sender?.displayName || data.sender?.name || "";
            const senderName = rawSenderName.replace(/^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.|ms\.|mrs\.)\s*/i, "").trim();

            const parsedResult = {
              senderName: senderName || "ไม่ระบุชื่อผู้โอน",
              amount: parseFloat(data.amount) || 0,
              date: parseTransDate(data.transDate),
              time: parseTransTime(data.transTime),
              bank: mapBankCode(data.sendingBank),
              isSuccess: data.success !== false,
              method: "SlipOK API"
            };
            console.log("[SLIP PARSER] Returning SlipOK result:", parsedResult);
            return res.json({ success: true, data: parsedResult });
          } else {
            console.warn("[SLIP PARSER] SlipOK response success was false:", resJson);
          }
        } else {
          console.warn("[SLIP PARSER] SlipOK API returned error status:", slipOkResponse.status);
        }
      } catch (err: any) {
        console.error("[SLIP PARSER] SlipOK integration failed, falling back to Gemini:", err.message || err);
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
    let lastError: any = null;
    let succeededModel = "";

    const modelsToTry = [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];

    // 1. Try with responseSchema (structured output) first across all models
    for (const modelName of modelsToTry) {
      try {
        console.log(`[SLIP PARSER] Attempting with model: ${modelName} (structured schema)...`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: { parts: [imagePart, textPart] },
          config,
        });
        succeededModel = modelName;
        break; // Successfully got response
      } catch (err: any) {
        console.warn(`[SLIP PARSER] Model ${modelName} with schema failed:`, err.message || err);
        lastError = err;
      }
    }

    // 2. If structured schema failed (e.g. schema validation limitations or unsupported config),
    // fallback to normal generation using raw JSON response requests
    if (!response) {
      console.warn("[SLIP PARSER] All schema-based models failed. Initiating fallback without schema...");
      const fallbackConfig = {
        temperature: 0.1,
        responseMimeType: "application/json",
      };

      for (const modelName of modelsToTry) {
        try {
          console.log(`[SLIP PARSER] Attempting with model: ${modelName} (raw JSON fallback)...`);
          response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [imagePart, textPart] },
            config: fallbackConfig,
          });
          succeededModel = modelName;
          break; // Successfully got response
        } catch (err: any) {
          console.warn(`[SLIP PARSER] Model ${modelName} without schema failed:`, err.message || err);
          lastError = err;
        }
      }
    }

    if (!response) {
      throw new Error(`All Gemini parsing models failed. Last error: ${lastError?.message || lastError}`);
    }

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Received an empty response text from Gemini.");
    }

    console.log(`[SLIP PARSER] Successfully parsed slip using model: ${succeededModel}`);
    console.log("[SLIP PARSER] Raw model output:", resultText);

    // 3. Robust JSON Extraction helper to clean markdown backticks or messy text
    const parseStructuredData = (text: string): any => {
      let cleaned = text.trim();
      
      // Remove Markdown block code formatting (```json ... ```)
      const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
      const match = cleaned.match(jsonBlockRegex);
      if (match && match[1]) {
        cleaned = match[1].trim();
      }

      // Snip text to only contain { ... } in case the model added extra commentary
      const startIdx = cleaned.indexOf("{");
      const endIdx = cleaned.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        cleaned = cleaned.substring(startIdx, endIdx + 1);
      }

      try {
        return JSON.parse(cleaned);
      } catch (jsonErr) {
        console.warn("[SLIP PARSER] JSON.parse failed. Trying manual Regex extraction fallback...");
        // Extreme Regex manual extraction fallback
        const senderNameMatch = text.match(/"senderName"\s*:\s*"([^"]+)"/i);
        const amountMatch = text.match(/"amount"\s*:\s*([0-9.]+)/i);
        const dateMatch = text.match(/"date"\s*:\s*"([^"]+)"/i);
        const timeMatch = text.match(/"time"\s*:\s*"([^"]+)"/i);
        const bankMatch = text.match(/"bank"\s*:\s*"([^"]+)"/i);
        const isSuccessMatch = text.match(/"isSuccess"\s*:\s*(true|false)/i);

        if (senderNameMatch || amountMatch) {
          return {
            senderName: senderNameMatch ? senderNameMatch[1] : "",
            amount: amountMatch ? parseFloat(amountMatch[1]) : 0,
            date: dateMatch ? dateMatch[1] : "",
            time: timeMatch ? timeMatch[1] : "",
            bank: bankMatch ? bankMatch[1] : "",
            isSuccess: isSuccessMatch ? isSuccessMatch[1].toLowerCase() === "true" : true,
          };
        }
        throw jsonErr;
      }
    };

    const rawParsed = parseStructuredData(resultText);

    // 4. Strict Server-Side Data Normalization and Sanitization
    const normalizeParsedData = (data: any): any => {
      let senderName = data.senderName || "";
      // Strip any accidental Thai prefixes that escaped the prompt instructions
      senderName = senderName.replace(/^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.|ms\.|mrs\.)\s*/i, "").trim();

      let amount = parseFloat(data.amount);
      if (isNaN(amount)) amount = 0;

      let date = (data.date || "").trim();
      // If date includes Thai BE year (2500 - 2600), convert to Western Gregorian year (AD)
      const yearMatch = date.match(/^(\d{4})/);
      if (yearMatch) {
        let year = parseInt(yearMatch[1]);
        if (year >= 2500 && year <= 2600) {
          year = year - 543;
          date = date.replace(/^(\d{4})/, year.toString());
        }
      }

      // Check date format validation (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = new Date().toISOString().split("T")[0]; // Safe default to today
      }

      let time = (data.time || "").trim();
      // Ensure time contains only HH:MM (strip seconds or AM/PM/น.)
      time = time.replace(/\s*(น\.|am|pm)\s*/i, "").trim();
      if (time.length > 5) {
        time = time.slice(0, 5);
      }
      if (!/^\d{2}:\d{2}$/.test(time)) {
        time = new Date().toTimeString().slice(0, 5); // Safe default to current time
      }

      return {
        senderName: senderName || "ไม่ระบุชื่อผู้โอน",
        amount,
        date,
        time,
        bank: data.bank || "ธนาคาร",
        isSuccess: data.isSuccess !== false, // default to true unless explicitly false
      };
    };

    const finalData = normalizeParsedData(rawParsed);
    const resultWithMethod = {
      ...finalData,
      method: "Gemini AI"
    };
    console.log("[SLIP PARSER] Normalized and Sanitized result:", resultWithMethod);

    return res.json({ success: true, data: resultWithMethod });
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
