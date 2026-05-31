const IMAGE_TYPES = ["image/png", "image/jpeg"];

export const MAX_UPLOAD_SIZE = 2 * 1024 * 1024;

const readImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });

export const compressImageIfNeeded = async (file: File) => {
  if (!IMAGE_TYPES.includes(file.type)) return file;
  if (file.size <= MAX_UPLOAD_SIZE) return file;

  const image = await readImage(file);
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));

  canvas.width = Math.max(1, Math.floor(image.width * ratio));
  canvas.height = Math.max(1, Math.floor(image.height * ratio));

  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.78);
  });

  if (!blob) return file;

  return new File([blob], file.name.replace(/\.(png|jpg|jpeg)$/i, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
};

export const validateFileType = (file: File) => {
  const allowedTypes = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf",
    "application/msword",
    "image/png",
    "image/jpeg",
  ];

  return allowedTypes.includes(file.type);
};
