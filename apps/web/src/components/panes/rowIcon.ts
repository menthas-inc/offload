/** The glyph for a piece of content, from its type. The kit's own mapping:
 *  a pin for a place, a link for a link, a picture for a picture. */
export function rowIcon(type: string): string {
  switch (type) {
    case "location":
      return "map-pin";
    case "link":
      return "link";
    case "image":
    case "screenshot":
      return "image";
    case "file":
      return "paperclip";
    case "voice":
      return "mic";
    case "task":
      return "square-check-big";
    case "event":
      return "calendar";
    default:
      return "text-quote";
  }
}
