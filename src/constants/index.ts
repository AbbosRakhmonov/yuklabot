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
    QUEUE_FULL:
      "Navbatda so‘rovlaringiz juda ko‘p. Iltimos, avvalgilari tugashini kuting.",
    RATE_LIMIT: (seconds: number) =>
      `Juda ko‘p so‘rov yubordingiz. Iltimos, ${seconds} soniyadan keyin qayta urining.`,
  },
  INFO: {
    ANALYZING: "Analiz qilinmoqda...",
    VIDEO_QUALITY:
      "Video sifatini tanlang, past sifatdan yuqori sifatga qarab o'sib boradi",
    DOWNLOADING_VIDEO: "Video yuklanmoqda...",
    DOWNLOADING_AUDIO: "Audio yuklanmoqda...",
    SCENE_CANCELLED: "Operatsiya bekor qilindi.",
    OPERATION_IN_PROGRESS:
      "Operatsiya bajarilmoqda. Iltimos, kuting yoki uni bekor qiling.",
    DOWNLOADING_IMAGE: "Rasm yuklanmoqda...",
  },
  SUCCESS: {
    OPERATION_COMPLETE: "Amal muvaffaqiyatli amalga oshirildi.",
  },
} as const;

// Local Bot API server: 2GB, cloud Bot API (api.telegram.org): 50MB
export const MAX_FILE_SIZE = config.telegram.isLocalBotApi
  ? 2 * 1024 * 1024 * 1024
  : 50 * 1024 * 1024;

export const CANCEL_BUTTON_TEXT = "❌ Bekor qilish";
