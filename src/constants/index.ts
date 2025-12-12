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
    DOWNLOADING_VIDEO: "Video yuklanmoqda...",
  },
  SUCCESS: {
    OPERATION_COMPLETE: "Amal muvaffaqiyatli amalga oshirildi.",
  },
} as const;

export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
export const SUPPORTED_VIDEO_FORMATS = ["mp4", "webm", "mov"];
export const SUPPORTED_AUDIO_FORMATS = ["m4a", "mp3", "opus", "aac"];
export const PREFERRED_VIDEO_CODEC = "h264"; // avc1
