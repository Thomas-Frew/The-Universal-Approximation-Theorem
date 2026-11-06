import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from "obscenity";

/**
 * Rude words, for aliases (the only text one player shows another).
 *
 * `obscenity` does the matching: it reads through look-alike spellings
 * (`sh1t`, `fuuuck`) and knows the innocent words that contain rude ones
 * (Scunthorpe, Cockatiel), so it blocks far fewer real names than a plain
 * list would. Every made-up alias (`profiles.ts`) was checked to pass.
 */
const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/**
 * Joins letters spelled out one at a time (`f u c k`, `s.h.i.t`) into one
 * word, which `obscenity` would otherwise read as separate letters. Only
 * single letters are joined: removing every space would make words across a
 * gap (`Cerulean Albatross`) and block innocent names.
 */
function joinSpelledOut(alias: string): string {
  const words: string[] = [];
  let spelling = false;
  for (const word of alias.split(/[ ._'-]+/)) {
    if (word.length === 1 && spelling) {
      words[words.length - 1] += word;
    } else {
      words.push(word);
      spelling = word.length === 1;
    }
  }
  return words.join(" ");
}

/** Whether an alias contains a rude word, however it is spelled. */
export function isRude(alias: string): boolean {
  return matcher.hasMatch(alias) || matcher.hasMatch(joinSpelledOut(alias));
}
