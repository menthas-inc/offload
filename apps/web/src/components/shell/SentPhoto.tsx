"use client";

// A photo sent with a message, from ui_kits/mobile_app/LiveConversation.jsx.
//
// "A photo sent with a message is shown, not named": the tile is the picture
// and the name sits beside it, for the dumper alone, since a conversation is
// theirs. The kit drew the tile at 34px and `--radius-xs` because it had no
// pictures to draw; here it is the row tile's 36px and `--radius-sm`, so one
// thumbnail size holds across the product (decisions.md, 2026-09-18). The web
// kit's turns draw text only, so this is the phones' too.

import { Icon } from "../Icon";
import { PhotoThumb } from "./PhotoThumb";
import type { PhotoOnWire } from "../../lib/dump";
import styles from "../../app/(shell)/composer.module.css";

export function SentPhoto({ photo, onOpen }: { photo: PhotoOnWire; onOpen: () => void }) {
  const name = photo.name ?? "Photo";
  return (
    <button type="button" className={styles.sentPhoto} onClick={onOpen} aria-label={`Open ${name}`}>
      <PhotoThumb
        blobId={photo.blobId}
        ready={photo.ready}
        localSrc={photo.localUrl}
        alt=""
        className={styles.sentPhotoTile}
        fallback={
          <span className={styles.sentPhotoTile} data-empty="true" aria-hidden="true">
            <Icon name="image" size={15} />
          </span>
        }
      />
      <span className={styles.sentPhotoName}>{name}</span>
    </button>
  );
}
