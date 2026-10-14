import { ViewTransition, type ReactNode } from "react";

interface TitleMorphProps {
  titleId: string;
  part: "panel" | "emoji";
  children: ReactNode;
}

// Names a title's panel or emoji so navigating list → detail morphs the card into the detail page.
export function TitleMorph({ titleId, part, children }: TitleMorphProps) {
  // Without `share`, `default="none"` would also switch the morph off.
  return (
    <ViewTransition name={`title-${part}-${titleId}`} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
