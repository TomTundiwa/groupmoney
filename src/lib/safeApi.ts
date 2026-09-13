/**
 * Safe API request helper that guarantees no JSON parsing crashes on HTML responses.
 * Prevents "Unexpected token 'T', 'The page c'... is not valid JSON" errors.
 */

export interface SafeApiResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<SafeApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";

    // Check if response is JSON
    if (!contentType.toLowerCase().includes("application/json")) {
      let rawText = "";
      try {
        rawText = await res.text();
      } catch (e) {
        // ignore
      }

      let errorMsg = `เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (${res.status})`;
      if (res.status === 404) {
        errorMsg = "ไม่พบ API Endpoint ฝั่งเซิร์ฟเวอร์ (HTTP 404) ระบบหลังบ้านอาจกำลังบูตหรือยังไม่พร้อมทำงาน";
      } else if (res.status === 502 || res.status === 503) {
        errorMsg = `เซิร์ฟเวอร์หลังบ้านกำลังเริ่มระบบ (HTTP ${res.status}) กรุณาลองใหม่อีกครั้งใน 1-2 นาที`;
      } else if (rawText && rawText.length < 150 && !rawText.includes("<")) {
        errorMsg = `เซิร์ฟเวอร์: ${rawText.trim()}`;
      } else if (rawText.toLowerCase().includes("the page cannot be found") || rawText.toLowerCase().includes("the page could not")) {
        errorMsg = "ระบบหลังบ้าน (Custom Server) ยังไม่เริ่มทำงาน หรือยังไม่มีการเปิดเซิร์ฟเวอร์ Node.js สำหรับ Discord Bot";
      }

      return {
        ok: false,
        status: res.status,
        error: errorMsg,
      };
    }

    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: json,
        error: json.error || json.message || `เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (HTTP ${res.status})`,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: json,
    };
  } catch (err: any) {
    console.error(`[safeFetchJson] Error fetching ${url}:`, err);
    return {
      ok: false,
      status: 0,
      error: err.message?.includes("Failed to fetch")
        ? "ไม่สามารถเชื่อมต่อไปยังเซิร์ฟเวอร์ได้ โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือสถานะเซิร์ฟเวอร์"
        : `เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message || "Network error"}`,
    };
  }
}

/**
 * Direct Discord Webhook test from browser as a zero-dependency fallback
 */
export async function testDiscordWebhookDirect(webhookUrl: string, groupName: string) {
  const embed = {
    title: "🔔 ทดสอบการเชื่อมต่อ Discord Webhook สำเร็จ! (Direct Web)",
    description: `ระบบแจ้งเตือนของก๊วน **${groupName || "ก๊วนออมเงิน"}** ได้เชื่อมต่อกับ Discord Webhook นี้เรียบร้อยแล้ว 🎉`,
    color: 0x5865F2,
    fields: [
      { name: "🏢 กลุ่ม", value: groupName || "ก๊วนออมเงิน", inline: true },
      { name: "🕒 เวลา", value: new Date().toLocaleTimeString("th-TH"), inline: true },
      { name: "🛡️ สถานะ", value: "พร้อมรับแจ้งเตือน (Direct)", inline: true },
    ],
    footer: { text: "Group Money Tracker • Direct Notification" },
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl.trim(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Group Money Bot",
      avatar_url: "https://cdn-icons-png.flaticon.com/512/9028/9028031.png",
      embeds: [embed],
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Discord Webhook error (${response.status}): ${txt}`);
  }
  return { success: true };
}
