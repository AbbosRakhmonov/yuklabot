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
  },
  SUCCESS: {
    OPERATION_COMPLETE: "Amal muvaffaqiyatli amalga oshirildi.",
  },
} as const;

export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export const CANCEL_BUTTON_TEXT = "❌ Bekor qilish";
