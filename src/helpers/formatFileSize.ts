import { filesize } from "filesize"

export const formatFileSize = (size: number | undefined) => {
    if (!size) return "0 B";
    return filesize(size)
}