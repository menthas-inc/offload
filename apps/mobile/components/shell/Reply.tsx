// What offload said, drawn on a phone.
//
// The same tree the web draws, from the same parser, so the two cannot disagree
// about what a reply contains. Only the drawing differs, and it differs because
// React Native has no list element and no blockquote: a bullet is a character
// in a row and a quote is a view with a border down one side.
//
// **Components, never HTML**, which on this surface is free: there is no HTML
// here to begin with. What it buys is the same guarantee stated the same way on
// both clients, so a later change cannot quietly introduce one on the web side
// and leave this one looking equivalent.

import { Platform, Text, View, type TextStyle } from "react-native";
import { router } from "expo-router";
import { isPlain, parse, type Block, type Inline } from "@offload/markup";

const isAndroid = Platform.OS === "android";

/** The body colour a reply already uses, so nothing here changes the voice. */
const BODY = isAndroid ? "text-a-on" : "text-text-primary";

/** **The bubble decides the type, not this.** A reply that changed size or
 *  typeface partway through would read as two voices, and the two bubbles this
 *  is drawn in already disagree about both. So the call site passes what it
 *  already uses and everything here inherits it. */
export function Reply({
  text,
  className = "",
  style,
}: {
  text: string;
  /** Defaulted rather than optional. `exactOptionalPropertyTypes` will not pass
   *  `string | undefined` to a React Native `className`, and threading the
   *  undefined through four components to satisfy that would be noise. */
  className?: string;
  style: TextStyle;
}) {
  const blocks = parse(text);

  // Almost every reply is one sentence. It comes back as one paragraph of one
  // text piece and is drawn exactly as it was before any of this existed.
  if (isPlain(blocks)) {
    return (
      <Text className={className} style={style}>
        {text}
      </Text>
    );
  }

  return (
    <View className="gap-space-4">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} className={className} style={style} />
      ))}
    </View>
  );
}

function BlockView({
  block,
  className,
  style,
}: {
  block: Block;
  className: string;
  style: TextStyle;
}) {
  if (block.kind === "bullets" || block.kind === "numbers") {
    return (
      <View className="gap-space-2">
        {block.items.map((item, index) => (
          <View key={index} className="flex-row">
            {/* The marker is structure rather than content, so it takes tertiary
                ink: at full weight a column of bullets reads louder than the
                sentences beside it. A fixed width keeps the text aligned when
                a list runs past nine. */}
            <Text
              className="font-core text-text-tertiary"
              style={{ ...style, width: 22 }}
            >
              {block.kind === "bullets" ? "•" : `${index + 1}.`}
            </Text>
            <Text className={`flex-1 ${className}`} style={style}>
              <Line pieces={item} />
            </Text>
          </View>
        ))}
      </View>
    );
  }

  if (block.kind === "quote") {
    return (
      // Width in a style prop, not an arbitrary class: the adherence lint
      // refuses those and is right to, and there is no 2px border class.
      <View
        className="border-border-hairline pl-space-5"
        style={{ borderLeftWidth: 2 }}
      >
        {block.lines.map((line, index) => (
          <Text
            key={index}
            className={`${className} ${isAndroid ? "text-a-on-var" : "text-text-secondary"}`}
            style={style}
          >
            <Line pieces={line} />
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View>
      {block.lines.map((line, index) => (
        <Text key={index} className={className} style={style}>
          <Line pieces={line} />
        </Text>
      ))}
    </View>
  );
}

function Line({ pieces }: { pieces: Inline[] }) {
  return (
    <>
      {pieces.map((piece, index) => {
        if (piece.kind === "strong") {
          return (
            <Text key={index} className={`font-semibold ${BODY}`}>
              {piece.text}
            </Text>
          );
        }
        if (piece.kind === "link") {
          return (
            <Text
              key={index}
              className="font-medium text-text-accent underline"
              accessibilityRole="link"
              // **`router.push` can leave the app, so this checks again.**
              //
              // Not importing `Linking` proves nothing: `expo-router` calls
              // `Linking.openURL` itself for anything it classifies as
              // external, which is any scheme prefix or a leading `//`. Today
              // none of those can reach here, but that is a property of the
              // parser rather than of this file, and the comment that used to
              // sit here claimed otherwise.
              //
              // One line, so the surface a person taps does not depend on a
              // package in another directory staying correct.
              onPress={() => {
                if (!/^\/[^/\\]/.test(piece.href)) return;
                router.push(piece.href as never);
              }}
            >
              {piece.text}
            </Text>
          );
        }
        return <Text key={index}>{piece.text}</Text>;
      })}
    </>
  );
}
