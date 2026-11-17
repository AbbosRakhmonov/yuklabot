import { config } from "@/config/config";

export const MESSAGES = {
  ERROR: {
    USER_NOT_FOUND: "Foydalanuvchi topilmadi. Iltimos, qayta urining.",
    GENERIC: "Xatolik yuz berdi. Iltimos, qayta urining.",
    DATABASE: "Ma'lumotlar bazasida xatolik yuz berdi. Iltimos, qayta urining.",
    INVALID_URL: "Havola noto‘g‘ri. Iltimos, qayta urining.",
    UNSUPPORTED_PLATFORM: "Bunday platforma qo‘llab-quvvatlanmaydi.",
    INVALID_COMMAND: "Buyruq noto‘g‘ri. Iltimos, qayta urining.",
    INVALID_MESSAGE:
      "Menga havola yuborishingiz kerak. Iltimos, qayta urining.",
    NO_SESSION: "Sessiya topilmadi. Iltimos, qayta urining.",
    FILE_TOO_LARGE:
      "Fayl hajmi juda katta, uni Telegram orqali yuborib bo‘lmaydi.",
    MEDIA_NOT_FOUND: "Yuklab olingan fayl topilmadi. Iltimos, qayta urining.",
    LINK_EXPIRED: "Bu tugma eskirgan. Iltimos, linkni qayta yuboring.",
    NO_FITTING_QUALITY:
      "Bu videoning hech bir sifati Telegram limitiga sig‘maydi. Audio sifatida yuklab ko‘ring.",
    NO_FITTING_AUDIO:
      "Bu audioning hech bir sifati Telegram limitiga sig‘maydi.",
    QUALITY_TOO_LARGE: (limit: string) =>
      `🚫 Bu sifat Telegram limitidan (${limit}) katta, uni yuborib bo‘lmaydi. Boshqa sifatni tanlang.`,
    VIDEO_TOO_MANY_PARTS: (maxParts: number) =>
      `🚫 Bu sifat juda katta: ${maxParts} qismdan ham ko‘proqqa bo‘linardi. Kichikroq sifatni tanlang.`,
    QUEUE_FULL:
      "Navbatda so‘rovlaringiz juda ko‘p. Iltimos, avvalgilari tugashini kuting.",
    RATE_LIMIT: (seconds: number) =>
      `Juda ko‘p so‘rov yubordingiz. Iltimos, ${seconds} soniyadan keyin qayta urining.`,
  },
  INFO: {
    ANALYZING: "Analiz qilinmoqda...",
    VIDEO_QUALITY:
      "Video sifatini tanlang, past sifatdan yuqori sifatga qarab o'sib boradi",
    AUDIO_QUALITY:
      "Audio sifatini tanlang, past sifatdan yuqori sifatga qarab o'sib boradi",
    DOWNLOADING_VIDEO: "Video yuklanmoqda...",
    DOWNLOADING_AUDIO: "Audio yuklanmoqda...",
    UPLOADING: "📤 Telegramga yuborilmoqda...",
    SPLITTING: "✂️ Video qismlarga bo‘linmoqda...",
    UPLOADING_PART: (part: number, total: number) =>
      `📤 Telegramga yuborilmoqda... (${part}/${total}-qism)`,
    DOWNLOAD_CANCELLED: "❌ Yuklash bekor qilindi.",
    SCENE_CANCELLED: "Operatsiya bekor qilindi.",
    OPERATION_IN_PROGRESS:
      "Operatsiya bajarilmoqda. Iltimos, kuting yoki uni bekor qiling.",
    DOWNLOADING_IMAGE: "Rasm yuklanmoqda...",
  },
  SUCCESS: {
    OPERATION_COMPLETE: "Amal muvaffaqiyatli amalga oshirildi.",
  },
} as const;

// Local Bot API server with --local: 2GB; cloud Bot API (api.telegram.org)
// or a local server without --local: 50MB
export const MAX_FILE_SIZE = config.telegram.localMode
  ? 2 * 1024 * 1024 * 1024
  : 50 * 1024 * 1024;
// A part is aimed at this share of the limit: parts can only be cut at
// keyframes, so their sizes vary a bit
export const VIDEO_PART_FILL = 0.9;

// Telegram's own wording of the limit, for messages
export const MAX_FILE_SIZE_LABEL = config.telegram.localMode
  ? "2 GB"
  : "50 MB";

export const CANCEL_BUTTON_TEXT = "❌ Bekor qilish";
