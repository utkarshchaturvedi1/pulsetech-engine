export async function preparePhoto(file: File): Promise<File> {
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) throw new Error("Please choose a JPG, PNG or WebP photo.");
  if (file.size <= 2 * 1024 * 1024) return file;
  if (file.size > 15 * 1024 * 1024) throw new Error("Please choose a photo smaller than 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d"); if (!context) throw new Error("Please choose another photo.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error("Please choose a smaller photo.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {type:"image/jpeg"});
  } finally { bitmap.close(); }
}
