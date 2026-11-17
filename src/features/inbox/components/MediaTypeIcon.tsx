import {
  File,
  FileAudio,
  FileText,
  Image as ImageIcon,
  Sticker,
  VideoCamera,
  type IconProps,
} from "@phosphor-icons/react";
import type { MessageType } from "../types";

type MediaType = Exclude<MessageType, "text" | "deleted">;

const LABELS: Record<MediaType, string> = {
  image: "Foto",
  video: "Vídeo",
  audio: "Áudio",
  document: "Documento",
  sticker: "Figurinha",
};

/** Ícone único para qualquer mídia, com semântica e peso visual consistente. */
export function MediaTypeIcon({ type, size = 14, ...props }: { type: MediaType } & IconProps) {
  const Icon =
    type === "image"
      ? ImageIcon
      : type === "video"
        ? VideoCamera
        : type === "audio"
          ? FileAudio
          : type === "document"
            ? FileText
            : Sticker;

  return <Icon {...props} size={size} weight="duotone" aria-label={LABELS[type]} />;
}

export function MediaFallbackIcon({ type, size = 22, ...props }: { type: MediaType } & IconProps) {
  if (type === "document") return <FileText {...props} size={size} weight="duotone" />;
  if (type === "audio") return <FileAudio {...props} size={size} weight="duotone" />;
  if (type === "sticker") return <Sticker {...props} size={size} weight="duotone" />;
  if (type === "video") return <VideoCamera {...props} size={size} weight="duotone" />;
  if (type === "image") return <ImageIcon {...props} size={size} weight="duotone" />;
  return <File {...props} size={size} weight="duotone" />;
}
