"use client";

// What offload said, drawn.
//
// **Components, never HTML.** The parser hands back a tree and this walks it,
// so there is no string a browser parses and no `dangerouslySetInnerHTML` for a
// later change to reintroduce. A reply is written by a model that has just read
// rows other people wrote; the strongest guarantee is that no path exists at
// all, rather than a sanitiser somebody has to keep correct.
//
// **The plain case pays nothing.** Almost every reply is one sentence, and one
// sentence comes back from the parser as one paragraph of one text piece, so it
// is returned as a bare string and the surrounding markup never appears.

import Link from "next/link";
import { isPlain, parse, type Block, type Inline } from "@offload/markup";
import styles from "../../app/(shell)/reply.module.css";

export function Reply({ text }: { text: string }) {
  const blocks = parse(text);
  if (isPlain(blocks)) return <>{text}</>;

  return (
    <div className={styles.reply}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === "bullets") {
    return (
      <ul className={styles.list}>
        {block.items.map((item, index) => (
          <li key={index}>
            <Line pieces={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (block.kind === "numbers") {
    return (
      <ol className={styles.list}>
        {block.items.map((item, index) => (
          <li key={index}>
            <Line pieces={item} />
          </li>
        ))}
      </ol>
    );
  }

  if (block.kind === "quote") {
    // Somebody else's words, or offload's own from earlier. A rule down the
    // side rather than italics: the reply is already set in the serif and
    // italicising a whole block of it is unreadable at this size.
    return (
      <blockquote className={styles.quote}>
        {block.lines.map((line, index) => (
          <span key={index} className={styles.line}>
            <Line pieces={line} />
          </span>
        ))}
      </blockquote>
    );
  }

  return (
    <p className={styles.paragraph}>
      {block.lines.map((line, index) => (
        <span key={index} className={styles.line}>
          <Line pieces={line} />
        </span>
      ))}
    </p>
  );
}

function Line({ pieces }: { pieces: Inline[] }) {
  return (
    <>
      {pieces.map((piece, index) => {
        if (piece.kind === "strong") return <b key={index}>{piece.text}</b>;
        if (piece.kind === "link") {
          // Internal only, guaranteed by the parser rather than checked again
          // here: anything else came back as text and never reaches this arm.
          return (
            <Link key={index} href={piece.href} className={styles.link}>
              {piece.text}
            </Link>
          );
        }
        return <span key={index}>{piece.text}</span>;
      })}
    </>
  );
}
