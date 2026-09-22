import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import heicConvert from "heic-convert";

dotenv.config();

const app = express();
const PORT = 3000;

// Enable CORS and handle preflight requests for all endpoints
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-requested-with");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Set up large payload limits for base64 image transfers
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

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

    const slipOkApiKey = process.env.SLIPOK_API_KEY;
    const slipOkBranchId = process.env.SLIPOK_BRANCH_ID || "71624";
    const hasSlipOk = !!(slipOkApiKey && slipOkApiKey !== "SLIPOK9AS7RET");

    if (hasSlipOk) {
      try {
        console.log("[SLIP PARSER] Making SlipOK API call...");
        const buffer = Buffer.from(finalBase64Data, "base64");
        const blob = new Blob([buffer], { type: finalMimeType });
        const formData = new FormData();
        formData.append("files", blob, "slip.jpg");

        const slipOkResponse = await fetch(`https://api.slipok.com/api/line/apikey/${slipOkBranchId}`, {
          method: "POST",
          headers: {
            "x-authorization": slipOkApiKey,
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
            console.log("[SLIP PARSER] SlipOK response success was false, falling back to Gemini AI:", resJson);
          }
        } else {
          console.log(`[SLIP PARSER] SlipOK API unavailable (status ${slipOkResponse.status}), seamlessly falling back to Gemini AI.`);
        }
      } catch (err: any) {
        console.log("[SLIP PARSER] SlipOK integration check skipped, falling back seamlessly to Gemini AI.");
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

    // Models prioritized according to current platform support and availability.
    // gemini-3.8-flash is the primary model for multimodal text extraction.
    const modelsToTry = [
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
      "gemini-3.1-pro-preview",
      "gemini-3.5-flash",
    ];

    // 1. Try with responseSchema (structured output) across models
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
        // Continue to next available model (handles 503 high demand spikes or 429 automatically)
      }
    }

    // 2. If structured schema failed (e.g. schema limitations), fallback to raw JSON generation
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
      const errStr = typeof lastError === "string" ? lastError : (lastError?.message || JSON.stringify(lastError || ""));
      const isHighDemand = errStr.includes("503") || errStr.includes("high demand") || errStr.includes("UNAVAILABLE");
      const errorMsg = isHighDemand
        ? "ระบบ AI สแกนสลิปมีผู้ใช้งานหนาแน่นชั่วคราว (503 High Demand) กรุณาลองใหม่อีกครั้งใน 1-2 นาที หรือเลือกกรอกยอดเงินด้วยตนเอง"
        : `ไม่สามารถสแกนสลิปผ่าน AI ได้: ${errStr}`;
      throw new Error(errorMsg);
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

// Helper to validate Discord webhook URLs
const isValidDiscordWebhookUrl = (url: string): boolean => {
  if (!url || typeof url !== "string") return false;
  const pattern = /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/i;
  return pattern.test(url.trim());
};

// Discord Webhook: Test connection endpoint
app.post("/api/discord/test", async (req, res) => {
  try {
    const { webhookUrl, groupName, webhookType = "transaction" } = req.body;
    if (!webhookUrl || typeof webhookUrl !== "string") {
      return res.status(400).json({ success: false, error: "กรุณาระบุ Discord Webhook URL" });
    }
    if (!isValidDiscordWebhookUrl(webhookUrl.trim())) {
      return res.status(400).json({
        success: false,
        error: "รูปแบบ Webhook URL ไม่ถูกต้อง ต้องขึ้นต้นด้วย https://discord.com/api/webhooks/...",
      });
    }

    const isOverdue = webhookType === "overdue";

    const embed = isOverdue
      ? {
          title: "🚨 ทดสอบการเชื่อมต่อ Webhook แจ้งเตือนยอดค้าง สำเร็จ!",
          description: `ระบบแจ้งเตือนรายชื่อยอดค้างของก๊วน **${groupName || "ก๊วนออมเงิน"}** ได้เชื่อมต่อเรียบร้อยแล้ว 🎉\nพร้อมสำหรับการแจ้งเตือนรายชื่อคนค้างจ่าย สรุปยอดหนี้ และสะกิดสมาชิกที่ไม่โอนเงิน`,
          color: 0xEF4444, // Red
          fields: [
            { name: "🏢 กลุ่ม", value: groupName || "ก๊วนออมเงิน", inline: true },
            { name: "📌 ช่องทาง", value: "แจ้งเตือนรายชื่อยอดค้าง (Overdue)", inline: true },
            { name: "🕒 เวลาทดสอบ", value: new Date().toLocaleTimeString("th-TH"), inline: true },
          ],
          footer: {
            text: "Group Money Tracker • Overdue Reminder Webhook",
          },
          timestamp: new Date().toISOString(),
        }
      : {
          title: "🔔 ทดสอบการเชื่อมต่อ Discord Webhook สำเร็จ!",
          description: `ระบบแจ้งเตือนของก๊วน **${groupName || "ก๊วนออมเงิน"}** ได้เชื่อมต่อกับ Discord Webhook นี้เรียบร้อยแล้ว 🎉\nต่อไปเมื่อมีสมาชิกบันทึกสลิปหรือโอนเงินเข้ากลุ่ม ระบบจะแจ้งเตือนมายังห้องนี้อัตโนมัติ`,
          color: 0x5865F2, // Discord Blurple
          fields: [
            { name: "🏢 กลุ่ม", value: groupName || "ก๊วนออมเงิน", inline: true },
            { name: "🕒 เวลาทดสอบ", value: new Date().toLocaleTimeString("th-TH"), inline: true },
            { name: "🛡️ สถานะ", value: "พร้อมรับแจ้งเตือน (Active)", inline: true },
          ],
          footer: {
            text: "Group Money Tracker • Discord Notification",
          },
          timestamp: new Date().toISOString(),
        };

    const botUsername = isOverdue
      ? `แจ้งเตือนยอดค้าง • ${groupName || "ก๊วนออมเงิน"}`
      : "Group Money Bot";
    const botAvatar = isOverdue
      ? "https://cdn-icons-png.flaticon.com/512/5501/5501375.png"
      : "https://cdn-icons-png.flaticon.com/512/9028/9028031.png";

    const response = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: botUsername,
        avatar_url: botAvatar,
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Discord ปฏิเสธคำขอ (${response.status}): ${errText || response.statusText}`,
      });
    }

    return res.json({ success: true, message: "ส่งข้อความทดสอบไปยัง Discord สำเร็จแล้ว!" });
  } catch (err: any) {
    console.error("Error in /api/discord/test:", err);
    return res.status(500).json({ success: false, error: err.message || "ไม่สามารถเชื่อมต่อไปยัง Discord ได้" });
  }
});

// Discord Webhook: Notify new transaction endpoint
app.post("/api/discord/notify-transaction", async (req, res) => {
  try {
    const {
      webhookUrl,
      groupName,
      memberNickname,
      memberName,
      amount,
      bank,
      date,
      time,
      notes,
      method,
      memberTotalPaid,
      targetAmount,
      progressPercent,
      hasSlipImage,
      slipImageUrl,
    } = req.body;

    if (!webhookUrl || !isValidDiscordWebhookUrl(webhookUrl.trim())) {
      return res.status(400).json({ success: false, error: "Invalid Discord Webhook URL." });
    }

    const formattedAmount = Number(amount || 0).toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const hasImage = Boolean(slipImageUrl || hasSlipImage);

    const embed: Record<string, any> = {
      title: `💸 แจ้งเตือนการโอนเงิน: ${groupName || "ก๊วนออมเงิน"}`,
      description: `**${memberNickname || "สมาชิก"}** ได้โอนเงินเข้ากลุ่มจำนวน **+฿${formattedAmount}** เรียบร้อยแล้ว!`,
      color: 0x10B981, // Emerald green
      fields: [
        {
          name: "👤 ผู้โอน",
          value: `${memberNickname || "สมาชิก"}${memberName && memberName !== memberNickname ? ` (${memberName})` : ""}`,
          inline: true,
        },
        {
          name: "💰 ยอดเงิน",
          value: `+฿${formattedAmount}`,
          inline: true,
        },
        {
          name: "🏦 ธนาคาร/ช่องทาง",
          value: bank || "ธนาคาร",
          inline: true,
        },
        {
          name: "📅 วันและเวลา",
          value: `${date || "-"} ${time || ""}`,
          inline: true,
        },
        {
          name: "📊 ยอดสะสมรวม",
          value: `฿${Number(memberTotalPaid || 0).toLocaleString("th-TH")}${targetAmount ? ` / ฿${Number(targetAmount).toLocaleString("th-TH")} (${progressPercent || 0}%)` : ""}`,
          inline: true,
        },
        {
          name: "⚙️ วิธีบันทึก",
          value: `${method || "บันทึกข้อมูล"}${hasImage ? " (📎 แนบรูปสลิป)" : ""}`,
          inline: true,
        },
        ...(notes ? [{ name: "📝 บันทึกช่วยจำ", value: notes, inline: false }] : []),
      ],
      footer: {
        text: `Group Money Tracker • ${groupName || "ก๊วนออมเงิน"}`,
      },
      timestamp: new Date().toISOString(),
    };

    let formData: FormData | null = null;

    // Attach slip image to Discord webhook if provided
    if (slipImageUrl && typeof slipImageUrl === "string" && slipImageUrl.trim()) {
      const cleanUrl = slipImageUrl.trim();
      if (cleanUrl.startsWith("data:")) {
        try {
          const match = cleanUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const mimeType = match[1] || "image/jpeg";
            const base64Data = match[2];
            const buffer = Buffer.from(base64Data, "base64");

            let ext = "jpg";
            if (mimeType.includes("png")) ext = "png";
            else if (mimeType.includes("webp")) ext = "webp";
            else if (mimeType.includes("gif")) ext = "gif";
            else if (mimeType.includes("heic")) ext = "heic";

            const filename = `slip-${Date.now()}.${ext}`;

            // Reference file attachment in Discord embed
            embed.image = {
              url: `attachment://${filename}`,
            };

            formData = new FormData();
            formData.append(
              "payload_json",
              JSON.stringify({
                username: "Group Money Bot",
                avatar_url: "https://cdn-icons-png.flaticon.com/512/9028/9028031.png",
                embeds: [embed],
              })
            );

            const blob = new Blob([buffer], { type: mimeType });
            formData.append("files[0]", blob, filename);
          }
        } catch (imgErr) {
          console.warn("Failed to process slip image base64 for Discord webhook:", imgErr);
        }
      } else if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
        embed.image = {
          url: cleanUrl,
        };
      }
    }

    let response: Response;
    if (formData) {
      response = await fetch(webhookUrl.trim(), {
        method: "POST",
        body: formData,
      });
    } else {
      response = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Group Money Bot",
          avatar_url: "https://cdn-icons-png.flaticon.com/512/9028/9028031.png",
          embeds: [embed],
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Discord returned ${response.status}: ${errText}`,
      });
    }

    return res.json({ success: true, hasAttachedImage: Boolean(formData || embed.image) });
  } catch (err: any) {
    console.error("Error in /api/discord/notify-transaction:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to notify Discord." });
  }
});

// Import Discord Bot Service
import {
  discordBotManager,
  buildCheckEmbed,
  buildBalanceEmbed,
  buildHelpEmbed,
  fetchGroupData,
} from "./server/discordBotService";

// Discord Bot: Get connection status for a group
app.get("/api/discord/bot/status/:groupId", (req, res) => {
  const { groupId } = req.params;
  const status = discordBotManager.getBotStatus(groupId);
  return res.json({ success: true, ...status });
});

// Discord Bot: Connect or reconnect bot for a group
app.post("/api/discord/bot/connect", async (req, res) => {
  try {
    const { groupId, botToken, channelId } = req.body;
    if (!groupId || !botToken) {
      return res.status(400).json({ success: false, error: "Missing groupId or botToken." });
    }

    const result = await discordBotManager.connectBot(groupId, botToken, channelId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const status = discordBotManager.getBotStatus(groupId);
    return res.json({
      success: true,
      message: `เชื่อมต่อ Discord Bot สำเร็จในชื่อ ${status.botUsername || "Bot"}! พร้อมรับคำสั่ง !เช็ค และ !ยอดเงิน แล้ว`,
      botUsername: status.botUsername,
    });
  } catch (err: any) {
    console.error("Error connecting Discord Bot:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to connect bot." });
  }
});

// Discord Bot: Disconnect bot
app.post("/api/discord/bot/disconnect", (req, res) => {
  const { groupId } = req.body;
  if (groupId) {
    discordBotManager.disconnectBot(groupId);
  }
  return res.json({ success: true, message: "ตัดการเชื่อมต่อ Discord Bot สำเร็จ" });
});

// Discord Command Execution & Preview Endpoint (Supports !เช็ค, !ยอดเงิน, !คำสั่ง)
// Can be called to test preview in UI or push to Discord webhook directly
app.post("/api/discord/command", async (req, res) => {
  try {
    const {
      groupId,
      command,
      sendToWebhook,
      webhookUrl,
      group: clientGroup,
      members: clientMembers,
      transactions: clientTransactions,
    } = req.body;
    if (!groupId || !command) {
      return res.status(400).json({ success: false, error: "Missing groupId or command." });
    }

    let data: { group: any; members: any[]; transactions: any[] } | null = null;
    if (clientGroup && clientMembers && Array.isArray(clientMembers) && clientMembers.length > 0) {
      data = {
        group: clientGroup,
        members: clientMembers,
        transactions: clientTransactions || [],
      };
    } else if (groupId) {
      data = await fetchGroupData(groupId);
    }

    if (!data) {
      return res.status(404).json({ success: false, error: "Group not found." });
    }

    const cmd = String(command).trim().toLowerCase();
    let embed;
    const isOverdueCheck =
      cmd.startsWith("!เช็ค") ||
      cmd.startsWith("!check") ||
      cmd.startsWith("!ค้าง") ||
      cmd.startsWith("!หนี้");

    if (
      cmd.startsWith("!เช็คก่อน") ||
      cmd.startsWith("!checkprev") ||
      cmd.startsWith("!เช็คอาทิตย์ก่อน") ||
      cmd.startsWith("!เช็คสัปดาห์ก่อน") ||
      cmd.startsWith("!ค้างก่อน")
    ) {
      embed = buildCheckEmbed(data.group, data.members, data.transactions, "previous");
    } else if (
      cmd.startsWith("!เช็ค") ||
      cmd.startsWith("!check") ||
      cmd.startsWith("!ค้าง") ||
      cmd.startsWith("!หนี้") ||
      cmd.startsWith("!เช็คปัจจุบัน")
    ) {
      embed = buildCheckEmbed(data.group, data.members, data.transactions, "current");
    } else if (
      cmd.startsWith("!ยอดเงิน") ||
      cmd.startsWith("!balance") ||
      cmd.startsWith("!เงิน") ||
      cmd.startsWith("!money")
    ) {
      embed = buildBalanceEmbed(data.group, data.members, data.transactions);
    } else {
      embed = buildHelpEmbed(data.group);
    }

    let webhookResult = null;
    const targetWebhook =
      webhookUrl ||
      (isOverdueCheck && data.group.discordOverdueWebhookUrl
        ? data.group.discordOverdueWebhookUrl
        : data.group.discordWebhookUrl);

    if (sendToWebhook && targetWebhook && isValidDiscordWebhookUrl(targetWebhook)) {
      try {
        const payload: Record<string, any> = {
          username: isOverdueCheck
            ? `แจ้งเตือนยอดค้าง • ${data.group.name || "ก๊วนออมเงิน"}`
            : (data.group.name ? `Group Money • ${data.group.name}` : "Group Money Bot"),
          avatar_url: isOverdueCheck
            ? "https://cdn-icons-png.flaticon.com/512/5501/5501375.png"
            : "https://cdn-icons-png.flaticon.com/512/9028/9028031.png",
          embeds: [embed],
        };

        if (isOverdueCheck && data.group.discordOverdueMentionText?.trim()) {
          payload.content = data.group.discordOverdueMentionText.trim();
        }

        const discordRes = await fetch(targetWebhook.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        webhookResult = {
          sent: discordRes.ok,
          status: discordRes.status,
        };
      } catch (err: any) {
        webhookResult = { sent: false, error: err.message };
      }
    }

    return res.json({
      success: true,
      command,
      embed,
      webhookResult,
    });
  } catch (err: any) {
    console.error("Error executing discord command:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to execute command." });
  }
});

// Discord Webhook: Notify overdue / outstanding balance members list
app.post("/api/discord/notify-overdue", async (req, res) => {
  try {
    const {
      webhookUrl,
      groupId,
      period = "current",
      customTitle,
      mentionText,
      customNote,
      group: clientGroup,
      members: clientMembers,
      transactions: clientTransactions,
    } = req.body;

    if (!webhookUrl || typeof webhookUrl !== "string") {
      return res.status(400).json({ success: false, error: "กรุณาระบุ Webhook URL แจ้งเตือนยอดค้าง" });
    }
    if (!isValidDiscordWebhookUrl(webhookUrl.trim())) {
      return res.status(400).json({
        success: false,
        error: "รูปแบบ Webhook URL ไม่ถูกต้อง ต้องขึ้นต้นด้วย https://discord.com/api/webhooks/...",
      });
    }

    // Use client provided payload if available (matching exact active screen state), or fetch from Firestore
    let data: { group: any; members: any[]; transactions: any[] } | null = null;
    if (clientGroup && clientMembers && Array.isArray(clientMembers) && clientMembers.length > 0) {
      data = {
        group: clientGroup,
        members: clientMembers,
        transactions: clientTransactions || [],
      };
    } else if (groupId) {
      data = await fetchGroupData(groupId);
    }

    if (!data || !data.group) {
      return res.status(404).json({ success: false, error: "ไม่พบข้อมูลกลุ่มหรือสมาชิกสำหรับสรุปยอดค้าง" });
    }

    const embed = buildCheckEmbed(
      data.group,
      data.members,
      data.transactions,
      period === "previous" ? "previous" : "current"
    );

    if (customTitle && typeof customTitle === "string" && customTitle.trim()) {
      embed.title = customTitle.trim();
    }

    if (customNote && typeof customNote === "string" && customNote.trim()) {
      embed.description = `📢 **${customNote.trim()}**\n\n${embed.description || ""}`;
    }

    const payload: Record<string, any> = {
      username: `แจ้งเตือนยอดค้าง • ${data.group.name}`,
      avatar_url: "https://cdn-icons-png.flaticon.com/512/5501/5501375.png",
      embeds: [embed],
    };

    if (mentionText && typeof mentionText === "string" && mentionText.trim()) {
      payload.content = mentionText.trim();
    }

    const response = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: `Discord ปฏิเสธคำขอ (${response.status}): ${errText || response.statusText}`,
      });
    }

    return res.json({
      success: true,
      message: "ส่งแจ้งเตือนรายชื่อยอดค้างไปยัง Discord สำเร็จแล้ว!",
      embed,
    });
  } catch (err: any) {
    console.error("Error in /api/discord/notify-overdue:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "เกิดข้อผิดพลาดในการส่งแจ้งเตือนยอดค้างไปยัง Discord",
    });
  }
});

// Import Overdue Scheduler Service
import {
  overdueScheduler,
  executeScheduledOverdueBroadcast,
  sendOverdueBroadcastForGroup,
  SCHEDULED_BANGKOK_HOURS,
  SCHEDULED_TIME_SLOT_LABELS,
  SCHEDULED_BANGKOK_TIME_SLOTS,
} from "./server/overdueScheduler";

// Endpoint to check scheduler status
app.get("/api/discord/scheduler/status", (req, res) => {
  const status = overdueScheduler.getStatus();
  const publicAppUrl = process.env.APP_URL || "";
  const cronPingUrl = publicAppUrl
    ? `${publicAppUrl}/api/discord/scheduler/cron-ping`
    : "/api/discord/scheduler/cron-ping";

  return res.json({
    success: true,
    ...status,
    appUrl: publicAppUrl,
    cronPingUrl,
  });
});

// Endpoint for client heartbeat and external cron pings (supports both GET and POST)
app.all(
  ["/api/discord/scheduler/check", "/api/discord/scheduler/cron-ping", "/api/cron/overdue"],
  async (req, res) => {
    try {
      const result = await overdueScheduler.checkTick();
      const status = overdueScheduler.getStatus();
      return res.json({
        success: true,
        message: "Automated overdue check processed successfully",
        result,
        status,
      });
    } catch (err: any) {
      console.error("[CRON] Error during scheduler check:", err);
      return res.status(500).json({ success: false, error: err.message || "Scheduler check failed" });
    }
  }
);

// Endpoint to manually trigger scheduled run for testing (e.g. from UI)
app.post("/api/discord/scheduler/trigger-now", async (req, res) => {
  try {
    const { timeSlot, bypassDedup = true } = req.body;
    const result = await executeScheduledOverdueBroadcast(timeSlot || undefined, bypassDedup);
    return res.json({
      success: true,
      message: `ดำเนินการส่งแจ้งเตือนยอดค้างเรียบร้อย: ตรวจสอบ ${result.checked} กลุ่ม, ส่งสำเร็จ ${result.sent} รายการ (รอบเวลา ${result.timeSlot} น.)`,
      ...result,
    });
  } catch (err: any) {
    console.error("Error triggering scheduled broadcast:", err);
    return res.status(500).json({ success: false, error: err.message || "Failed to trigger scheduled run" });
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

// Global Express Error Handler to prevent HTML error pages on API calls
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[Server Error] ${req.method} ${req.url}:`, err);
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith("/api/")) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
    });
  }
  return next(err);
});

// Catch-all for undefined API endpoints to ensure valid JSON response instead of HTML
app.all("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Vite middleware and asset serving
async function startServer() {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    (typeof __filename !== "undefined" && (__filename.endsWith(".cjs") || __filename.includes("dist")));

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn("Could not start Vite dev middleware, serving static dist instead:", viteErr);
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Start automated overdue notification scheduler (6:00, 12:00, 15:00, 20:00 Bangkok time)
    try {
      overdueScheduler.start();
    } catch (schedErr) {
      console.error("Failed to start overdue scheduler:", schedErr);
    }
  });
}

startServer();
